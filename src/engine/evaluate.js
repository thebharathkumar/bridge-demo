/**
 * Verdict assembly.
 *
 * The whole point of this file is the order of the three questions:
 *
 *   1. Does the deal fail a hard criterion?        -> Not Eligible, cite it.
 *   2. Does it sit inside a margin of a boundary?  -> Borderline, cite the number.
 *   3. How does the soft read go?                  -> Eligible, or Borderline.
 *
 * Step 2 wins over step 3 unconditionally. A soft read cannot argue a deal out of
 * Borderline once it is sitting on a numeric edge, because the thing that makes it
 * Borderline is the edge, not the narrative.
 */

import { LENDERS } from '../data/lenders.js';
import { checkHardCriteria, checkMargins } from './hardFilter.js';
import { evaluateSoftCriteria, llmConfigured } from './softFilter.js';

export const VERDICTS = {
  ELIGIBLE: 'Eligible',
  NOT_ELIGIBLE: 'Not Eligible',
  BORDERLINE: 'Borderline',
};

function tightestCleared(checks) {
  // Preference order for "the criterion this deal cleared by the least comfortable
  // margin", used only to give an Eligible verdict something concrete to cite when
  // no soft criterion came back supportive.
  const order = ['exposure', 'ltv', 'loan-size', 'geography', 'property-type'];
  return [...checks].sort(
    (a, b) => order.indexOf(a.criterion) - order.indexOf(b.criterion),
  )[0];
}

export async function evaluateLender(deal, lender, softMode = 'auto') {
  const hard = checkHardCriteria(deal, lender);

  // 1. Hard failure. Stop here — no soft judgment is spent on a deal that is
  //    already disqualified on the facts.
  if (!hard.passed) {
    return {
      lenderId: lender.id,
      lenderName: lender.name,
      lenderArchetype: lender.archetype,
      verdict: VERDICTS.NOT_ELIGIBLE,
      driver: {
        kind: 'hard',
        criterion: hard.driver.criterion,
        label: hard.driver.label,
        quote: hard.driver.quote,
        detail: hard.driver.detail,
      },
      alsoFails: hard.failures.slice(1).map((f) => ({
        criterion: f.criterion,
        label: f.label,
        quote: f.quote,
        detail: f.detail,
      })),
      hardChecks: hard.checks,
      margins: [],
      soft: { source: 'not-run', reason: 'Hard criteria failed, so no soft judgment was spent on this deal.', assessments: [] },
      needsHuman: false,
    };
  }

  const margins = checkMargins(deal, lender);

  // The soft pass runs even when a margin has already locked the verdict to
  // Borderline. It cannot change the verdict, but a human picking this file up
  // deserves to see the qualitative read alongside the number that flagged it.
  const soft = await evaluateSoftCriteria(deal, lender, softMode);
  const concerns = soft.assessments.filter((a) => a.assessment === 'concern');
  const supports = soft.assessments.filter((a) => a.assessment === 'supports');

  // 2. Numeric margin. Borderline, and the soft read is explicitly not the driver.
  if (margins.length > 0) {
    const closest = margins[0];
    return {
      lenderId: lender.id,
      lenderName: lender.name,
      lenderArchetype: lender.archetype,
      verdict: VERDICTS.BORDERLINE,
      driver: {
        kind: 'margin',
        criterion: closest.criterion,
        label: closest.label,
        quote: closest.quote,
        detail: closest.detail,
        whyHuman:
          'This deal breaks none of this lender\'s stated rules, but it lands close enough to one of their ' +
          'numbers that the answer depends on how they feel on the day. A human needs to make this call.',
      },
      alsoFails: [],
      hardChecks: hard.checks,
      margins,
      soft: {
        ...soft,
        determinative: false,
        note: 'Shown as context only. The numeric margin above set this verdict, and the soft read cannot override it.',
      },
      needsHuman: true,
    };
  }

  // 3. Soft read decides between Eligible and Borderline. It never reaches
  //    Not Eligible — a judgment call is not grounds for a confident no.
  if (concerns.length > 0) {
    const lead = concerns[0];
    return {
      lenderId: lender.id,
      lenderName: lender.name,
      lenderArchetype: lender.archetype,
      verdict: VERDICTS.BORDERLINE,
      driver: {
        kind: 'soft',
        criterion: lead.id,
        label: 'Soft criterion',
        quote: lead.text,
        detail: lead.reason,
        whyHuman:
          'Every hard rule is met with room to spare. What flagged this is a stated preference, ' +
          'which is a judgment call rather than a number, so it needs a human read rather than an automated no.',
      },
      alsoFails: [],
      hardChecks: hard.checks,
      margins: [],
      soft: { ...soft, determinative: true },
      needsHuman: true,
    };
  }

  const supportingDriver = supports[0];
  const fallbackCheck = tightestCleared(hard.checks);
  return {
    lenderId: lender.id,
    lenderName: lender.name,
    lenderArchetype: lender.archetype,
    verdict: VERDICTS.ELIGIBLE,
    driver: supportingDriver
      ? {
          kind: 'soft',
          criterion: supportingDriver.id,
          label: 'Soft criterion',
          quote: supportingDriver.text,
          detail: supportingDriver.reason,
        }
      : {
          kind: 'hard',
          criterion: fallbackCheck.criterion,
          label: fallbackCheck.label,
          quote: fallbackCheck.quote,
          detail: fallbackCheck.detail,
        },
    alsoFails: [],
    hardChecks: hard.checks,
    margins: [],
    soft: { ...soft, determinative: true },
    needsHuman: false,
  };
}

export async function evaluateDeal(deal, { lenders = LENDERS, softMode = 'auto' } = {}) {
  const results = await Promise.all(lenders.map((lender) => evaluateLender(deal, lender, softMode)));

  const counts = {
    eligible: results.filter((r) => r.verdict === VERDICTS.ELIGIBLE).length,
    borderline: results.filter((r) => r.verdict === VERDICTS.BORDERLINE).length,
    notEligible: results.filter((r) => r.verdict === VERDICTS.NOT_ELIGIBLE).length,
  };

  const order = { [VERDICTS.ELIGIBLE]: 0, [VERDICTS.BORDERLINE]: 1, [VERDICTS.NOT_ELIGIBLE]: 2 };
  results.sort((a, b) => order[a.verdict] - order[b.verdict] || a.lenderId.localeCompare(b.lenderId));

  const softSources = new Set(results.map((r) => r.soft.source).filter((s) => s !== 'not-run'));

  return {
    deal,
    counts,
    results,
    softMode: {
      requested: softMode,
      llmConfigured: llmConfigured(),
      used: [...softSources],
    },
  };
}
