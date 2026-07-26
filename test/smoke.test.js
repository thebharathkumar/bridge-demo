/**
 * Offline smoke tests. No API key required, no network access required.
 *
 * The three required worked examples are asserted end to end against the real
 * engine and the real synthetic profiles, so the README's table cannot silently
 * drift away from what the code actually does.
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EXAMPLE_DEALS, getExample } from '../src/data/examples.js';
import { LENDERS, getLender } from '../src/data/lenders.js';
import { evaluateDeal, evaluateLender, VERDICTS } from '../src/engine/evaluate.js';
import { checkHardCriteria, checkMargins, MARGINS } from '../src/engine/hardFilter.js';
import { evaluateSoftDeterministic } from '../src/engine/softFilter.js';
import { normalizeDeal, DealValidationError } from '../src/engine/normalizeDeal.js';

/** Every test in this file pins softMode to deterministic: no key, no network. */
const OFFLINE = { softMode: 'deterministic' };

function resultFor(report, lenderId) {
  const result = report.results.find((r) => r.lenderId === lenderId);
  assert.ok(result, `expected a result for ${lenderId}`);
  return result;
}

/* ================================================================== *
 * Required worked example 1: hard cap failure
 * ================================================================== */

test('example 1: a loan over the maximum is Not Eligible, cited to that exact cap', async () => {
  const example = getExample('example-1-hard-cap');
  const report = await evaluateDeal(normalizeDeal(example.deal), OFFLINE);
  const result = resultFor(report, example.expect.lenderId);

  assert.equal(result.verdict, VERDICTS.NOT_ELIGIBLE);
  assert.equal(result.driver.kind, 'hard');
  assert.equal(result.driver.criterion, 'loan-size');

  // The cited criterion must be the lender's own loan-size sentence, verbatim.
  const lender = getLender(example.expect.lenderId);
  assert.equal(result.driver.quote, lender.loanSize.text);

  // And the citation has to carry the actual numbers, not a vague summary.
  for (const needle of example.expect.contains) {
    assert.ok(
      `${result.driver.quote} ${result.driver.detail}`.includes(needle),
      `expected the cited reason to mention ${needle}, got: ${result.driver.detail}`,
    );
  }
  assert.match(result.driver.detail, /\$7,000,000 over/);

  // No soft judgment should have been spent on an already-disqualified deal.
  assert.equal(result.soft.source, 'not-run');
  assert.equal(result.soft.assessments.length, 0);
});

/* ================================================================== *
 * Required worked example 2: inside the margin
 * ================================================================== */

test('example 2: a deal inside the LTV margin is Borderline with the specific number', async () => {
  const example = getExample('example-2-borderline');
  const deal = normalizeDeal(example.deal);
  const report = await evaluateDeal(deal, OFFLINE);
  const result = resultFor(report, example.expect.lenderId);
  const lender = getLender(example.expect.lenderId);

  assert.equal(result.verdict, VERDICTS.BORDERLINE);
  assert.equal(result.driver.kind, 'margin');
  assert.equal(result.driver.criterion, 'ltv');
  assert.equal(result.driver.quote, lender.ltv.text);

  for (const needle of example.expect.contains) {
    assert.ok(
      result.driver.detail.includes(needle),
      `expected the cited reason to mention ${needle}, got: ${result.driver.detail}`,
    );
  }

  // It must say why a human is needed, not just that it is borderline.
  assert.ok(result.needsHuman);
  assert.match(result.driver.whyHuman, /human/i);

  // It breaks no actual rule — that is the whole point of Borderline.
  const hard = checkHardCriteria(deal, lender);
  assert.equal(hard.passed, true, 'example 2 must fail no hard criterion');
});

test('example 2: the soft read is carried as context but is not the driver', async () => {
  const example = getExample('example-2-borderline');
  const result = await evaluateLender(
    normalizeDeal(example.deal),
    getLender(example.expect.lenderId),
    'deterministic',
  );

  assert.equal(result.driver.kind, 'margin');
  assert.equal(result.soft.determinative, false);
  assert.ok(result.soft.assessments.length > 0, 'the soft pass should still run for the human reading this');
  assert.match(result.soft.note, /cannot override/i);
});

test('a soft read cannot talk a deal out of Borderline once it is on a boundary', async () => {
  const example = getExample('example-2-borderline');
  const lender = getLender('SYN-03');

  // Make the soft criteria read as well as they possibly can: fully stabilized,
  // high occupancy, deeply experienced sponsor.
  const glowing = normalizeDeal({
    ...example.deal,
    projectStage: 'stabilized',
    occupancyPct: 0.99,
    sponsor: { ...example.deal.sponsor, priorDealsSameAssetClass: 25, yearsExperience: 30 },
    notes: 'Best sponsor in the market, flawless record, every box ticked.',
  });

  const soft = evaluateSoftDeterministic(glowing, lender);
  assert.equal(soft.filter((a) => a.assessment === 'concern').length, 0, 'no soft concerns in this variant');

  const result = await evaluateLender(glowing, lender, 'deterministic');
  assert.equal(result.verdict, VERDICTS.BORDERLINE, 'the numeric margin still rules');
  assert.equal(result.driver.kind, 'margin');
});

/* ================================================================== *
 * Required worked example 3: clean pass
 * ================================================================== */

test('example 3: a deal that clears every hard filter and reads well is Eligible, with reasoning', async () => {
  const example = getExample('example-3-eligible');
  const deal = normalizeDeal(example.deal);
  const report = await evaluateDeal(deal, OFFLINE);
  const result = resultFor(report, example.expect.lenderId);
  const lender = getLender(example.expect.lenderId);

  assert.equal(result.verdict, VERDICTS.ELIGIBLE);
  assert.equal(result.driver.kind, 'soft');
  assert.equal(result.needsHuman, false);

  // The driver must quote one of this lender's real soft criteria.
  const softTexts = lender.soft.map((s) => s.text);
  assert.ok(
    softTexts.includes(result.driver.quote),
    `expected the driver to quote a soft criterion, got: ${result.driver.quote}`,
  );

  // The reasoning has to point at a fact, so it must carry a number.
  assert.match(result.driver.detail, /\d/);

  // No hard failure and no margin hit anywhere.
  assert.equal(checkHardCriteria(deal, lender).passed, true);
  assert.deepEqual(checkMargins(deal, lender), []);
  assert.equal(result.hardChecks.length, 5, 'all five hard criteria should be recorded as cleared');
});

/* ================================================================== *
 * Engine invariants
 * ================================================================== */

test('every example produces a verdict for all nine lenders, and only the three legal verdicts', async () => {
  for (const example of EXAMPLE_DEALS) {
    const report = await evaluateDeal(normalizeDeal(example.deal), OFFLINE);
    assert.equal(report.results.length, LENDERS.length, `${example.id}: one result per lender`);
    const total = report.counts.eligible + report.counts.borderline + report.counts.notEligible;
    assert.equal(total, LENDERS.length, `${example.id}: counts must add up`);

    for (const result of report.results) {
      assert.ok(
        Object.values(VERDICTS).includes(result.verdict),
        `${example.id}/${result.lenderId}: illegal verdict ${result.verdict}`,
      );
      // Every verdict cites something specific: a quoted criterion and a detail.
      assert.ok(result.driver.quote?.trim(), `${example.id}/${result.lenderId}: missing cited criterion`);
      assert.ok(result.driver.detail?.trim(), `${example.id}/${result.lenderId}: missing detail`);
      assert.doesNotMatch(
        result.driver.detail,
        /overall fit|similarity|score/i,
        `${example.id}/${result.lenderId}: driver must be a criterion, not a vibe`,
      );
    }
  }
});

test('a Not Eligible verdict never spends a soft judgment', async () => {
  for (const example of EXAMPLE_DEALS) {
    const report = await evaluateDeal(normalizeDeal(example.deal), OFFLINE);
    for (const result of report.results.filter((r) => r.verdict === VERDICTS.NOT_ELIGIBLE)) {
      assert.equal(result.soft.source, 'not-run', `${result.lenderId} should not have run a soft pass`);
    }
  }
});

test('the soft pass can never produce Not Eligible on its own', async () => {
  // A deal that clears SYN-01's hard criteria with room to spare but reads as badly
  // as the soft criteria allow: first-time sponsor, ground-up construction.
  const weakSoftDeal = normalizeDeal({
    name: 'Weak soft read, clean hard numbers',
    loanAmount: 5_000_000,
    propertyType: 'multifamily',
    state: 'TX',
    ltv: 0.5,
    projectStage: 'ground-up-construction',
    occupancyPct: 0,
    sponsor: { yearsExperience: 1, priorDealsSameAssetClass: 0, localToMarket: false },
    notes: 'First-time developer, ground-up construction, no track record at all.',
  });

  const lender = getLender('SYN-01');
  const soft = evaluateSoftDeterministic(weakSoftDeal, lender);
  assert.ok(soft.every((a) => a.assessment === 'concern'), 'both soft criteria should read as concerns');

  const result = await evaluateLender(weakSoftDeal, lender, 'deterministic');
  assert.equal(result.verdict, VERDICTS.BORDERLINE, 'soft concerns cap out at Borderline');
  assert.equal(result.driver.kind, 'soft');
  assert.match(result.driver.whyHuman, /judgment call/i);
});

test('hard-failure precedence puts the most absolute failure first', () => {
  // Cannabis-related in a state SYN-01 does not serve, over their maximum, over
  // their LTV cap: four failures at once. The excluded asset class wins.
  const deal = normalizeDeal({
    loanAmount: 30_000_000,
    propertyType: 'cannabis-related',
    state: 'FL',
    ltv: 0.9,
  });
  const hard = checkHardCriteria(deal, getLender('SYN-01'));
  assert.equal(hard.passed, false);
  assert.equal(hard.driver.criterion, 'property-type-excluded');
  assert.ok(hard.failures.length >= 4, 'this deal should trip several criteria');
  assert.deepEqual(
    hard.failures.map((f) => f.criterion),
    ['property-type-excluded', 'geography', 'loan-size', 'ltv'],
    'failures should come back in precedence order',
  );
});

test('exposure caps are enforced against already-committed capital', () => {
  // SYN-02 has $9,000,000 of its $12,000,000 retail cap committed, so a $4,000,000
  // retail request breaks the cap even though it is inside the loan-size range.
  const deal = normalizeDeal({
    loanAmount: 4_000_000,
    propertyType: 'retail-strip',
    state: 'OH',
    ltv: 0.6,
  });
  const hard = checkHardCriteria(deal, getLender('SYN-02'));
  assert.equal(hard.passed, false);
  assert.equal(hard.driver.criterion, 'exposure');
  assert.match(hard.driver.detail, /\$1,000,000 over/);
  assert.match(hard.driver.detail, /\$3,000,000 of room remains/);
});

test('a near-miss on the exposure cap is Borderline, not Eligible', async () => {
  // $2,300,000 of retail against SYN-02 leaves $700,000 of a $12,000,000 cap,
  // inside the 10% margin band.
  const deal = normalizeDeal({
    loanAmount: 2_300_000,
    propertyType: 'retail-strip',
    state: 'OH',
    ltv: 0.55,
    sponsor: { localToMarket: true },
    tenancy: { largestTenantSharePct: 0.4 },
  });
  const lender = getLender('SYN-02');
  assert.equal(checkHardCriteria(deal, lender).passed, true);

  const result = await evaluateLender(deal, lender, 'deterministic');
  assert.equal(result.verdict, VERDICTS.BORDERLINE);
  assert.equal(result.driver.criterion, 'exposure');
  assert.match(result.driver.detail, /\$700,000 of room/);
});

test('margin thresholds match the documented values', () => {
  assert.equal(MARGINS.loanSizeFraction, 0.1);
  assert.equal(MARGINS.ltvPoints, 2);
  assert.equal(MARGINS.exposureFraction, 0.1);

  const lender = getLender('SYN-03'); // 70% LTV cap, $3m–$25m
  // 67.9% is 2.1 points under the cap: outside the margin.
  assert.equal(
    checkMargins(normalizeDeal({ loanAmount: 10_000_000, propertyType: 'self-storage', state: 'AZ', ltv: 0.679 }), lender)
      .length,
    0,
  );
  // 68.1% is 1.9 points under: inside it.
  const inside = checkMargins(
    normalizeDeal({ loanAmount: 10_000_000, propertyType: 'self-storage', state: 'AZ', ltv: 0.681 }),
    lender,
  );
  assert.equal(inside.length, 1);
  assert.equal(inside[0].criterion, 'ltv');
});

/* ================================================================== *
 * Input handling
 * ================================================================== */

test('LTV is accepted as a percentage or a fraction', () => {
  assert.equal(normalizeDeal({ loanAmount: 1_000_000, propertyType: 'office', state: 'ny', ltv: 68.5 }).ltv, 0.685);
  assert.equal(normalizeDeal({ loanAmount: 1_000_000, propertyType: 'office', state: 'NY', ltv: 0.685 }).ltv, 0.685);
});

test('loan amounts survive commas and dollar signs, and state is upper-cased', () => {
  const deal = normalizeDeal({ loanAmount: '$9,500,000', propertyType: 'multifamily', state: 'ga', ltv: '68' });
  assert.equal(deal.loanAmount, 9_500_000);
  assert.equal(deal.state, 'GA');
});

test('bad input is rejected with a message that names the field', () => {
  assert.throws(() => normalizeDeal({ propertyType: 'office', state: 'NY', ltv: 0.6 }), DealValidationError);
  assert.throws(
    () => normalizeDeal({ loanAmount: 1_000_000, propertyType: 'spaceport', state: 'NY', ltv: 0.6 }),
    /propertyType/,
  );
  assert.throws(
    () => normalizeDeal({ loanAmount: 1_000_000, propertyType: 'office', state: 'New York', ltv: 0.6 }),
    /two-letter/,
  );
});

test('missing soft-criteria data reads as neutral, never as a concern', () => {
  // A deal with nothing said about the sponsor should not be penalised for it.
  const bare = normalizeDeal({ loanAmount: 9_000_000, propertyType: 'multifamily', state: 'GA', ltv: 0.6 });
  const soft = evaluateSoftDeterministic(bare, getLender('SYN-06'));
  const priorDeals = soft.find((a) => a.id === 'SYN-06-S1');
  assert.equal(priorDeals.assessment, 'neutral');
  assert.match(priorDeals.reason, /^Not assessed:/);
});

/* ================================================================== *
 * Data hygiene
 * ================================================================== */

test('the synthetic lender set is well formed', () => {
  assert.ok(LENDERS.length >= 8 && LENDERS.length <= 10, 'the brief asks for 8 to 10 profiles');
  const ids = new Set();

  for (const lender of LENDERS) {
    assert.ok(!ids.has(lender.id), `duplicate lender id ${lender.id}`);
    ids.add(lender.id);

    assert.match(lender.name, /^Sample Lender [A-Z]$/, 'names must stay obviously synthetic');
    assert.ok(lender.loanSize.min < lender.loanSize.max, `${lender.id}: loan size range inverted`);
    assert.ok(lender.ltv.cap > 0 && lender.ltv.cap <= 1, `${lender.id}: LTV cap must be a fraction`);
    assert.ok(lender.propertyTypes.included.length > 0, `${lender.id}: must cover something`);
    assert.ok(lender.soft.length >= 1 && lender.soft.length <= 2, `${lender.id}: one or two soft criteria`);

    // Every criterion needs quotable prose, since the whole product is the citation.
    for (const text of [
      lender.loanSize.text,
      lender.propertyTypes.text,
      lender.geography.text,
      lender.ltv.text,
      lender.exposure.text,
    ]) {
      assert.ok(text?.trim().length > 10, `${lender.id}: every criterion needs quotable text`);
    }

    // A lender cannot both cover and exclude the same asset class.
    for (const type of lender.propertyTypes.included) {
      assert.ok(!lender.propertyTypes.excluded.includes(type), `${lender.id}: ${type} both covered and excluded`);
    }

    // Committed exposure must not already exceed the cap.
    for (const [type, amount] of Object.entries(lender.exposure.committed ?? {})) {
      assert.ok(
        amount <= lender.exposure.capPerPropertyType,
        `${lender.id}: committed ${type} exceeds its own cap`,
      );
    }

    for (const criterion of lender.soft) {
      assert.ok(criterion.id.startsWith(lender.id), `${lender.id}: soft criterion id should be namespaced`);
      assert.ok(criterion.signal?.kind, `${criterion.id}: needs a machine-checkable signal for offline mode`);
    }
  }
});

test('every soft signal kind has a deterministic evaluator, so offline mode is complete', () => {
  const bare = normalizeDeal({ loanAmount: 5_000_000, propertyType: 'multifamily', state: 'GA', ltv: 0.6 });
  for (const lender of LENDERS) {
    for (const assessment of evaluateSoftDeterministic(bare, lender)) {
      assert.doesNotMatch(
        assessment.reason,
        /no evaluator for signal/,
        `${assessment.id}: missing a deterministic evaluator`,
      );
    }
  }
});
