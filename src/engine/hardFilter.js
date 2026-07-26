/**
 * Hard criteria. Pure arithmetic and set membership, checked in code.
 *
 * Nothing in this file asks an LLM anything. Whether $22,000,000 is more than
 * $15,000,000, and whether "AZ" is in a list of states, are not matters of
 * judgment, and a model that got them wrong 1% of the time would make the whole
 * tool untrustworthy.
 */

import { money, pct, points } from './format.js';
import { propertyTypeLabel } from '../data/lenders.js';

/**
 * How close to a numeric boundary still counts as Borderline.
 * These are the hand-set thresholds referenced in the README's limitations.
 */
export const MARGINS = {
  /** Loan size within 10% of the min or the max of the range. */
  loanSizeFraction: 0.1,
  /** LTV within 2 percentage points of the cap. */
  ltvPoints: 2,
  /** Post-close exposure within 10% of the per-property-type cap. */
  exposureFraction: 0.1,
};

/**
 * Order matters: the first failure in this list becomes the cited driver.
 * Ranked most-absolute first. An excluded asset class or an unserved state is a
 * flat no; a loan size outside the range is structural; LTV and exposure are the
 * two that could plausibly change with more equity or with time, so they rank
 * last.
 */
const FAILURE_PRECEDENCE = [
  'property-type-excluded',
  'property-type-not-covered',
  'geography',
  'loan-size',
  'ltv',
  'exposure',
];

function servesState(lender, state) {
  const geo = lender.geography;
  if (geo.mode === 'list') return geo.states.includes(state);
  return !(geo.excludedStates ?? []).includes(state);
}

function committedFor(lender, propertyType) {
  return lender.exposure.committed?.[propertyType] ?? 0;
}

/**
 * @returns {{failures: Array, driver: object|null, passed: boolean, checks: Array}}
 */
export function checkHardCriteria(deal, lender) {
  const failures = [];
  const checks = [];

  // --- 1. Property type / industry -----------------------------------------
  const typeLabel = propertyTypeLabel(deal.propertyType);
  if (lender.propertyTypes.excluded.includes(deal.propertyType)) {
    failures.push({
      criterion: 'property-type-excluded',
      label: 'Excluded property type',
      quote: lender.propertyTypes.text,
      detail: `${typeLabel} is on this lender's excluded list.`,
    });
  } else if (!lender.propertyTypes.included.includes(deal.propertyType)) {
    failures.push({
      criterion: 'property-type-not-covered',
      label: 'Property type not covered',
      quote: lender.propertyTypes.text,
      detail: `${typeLabel} is not one of the property types this lender covers.`,
    });
  } else {
    checks.push({
      criterion: 'property-type',
      label: 'Property type',
      quote: lender.propertyTypes.text,
      detail: `${typeLabel} is covered.`,
    });
  }

  // --- 2. Geography ---------------------------------------------------------
  if (!servesState(lender, deal.state)) {
    failures.push({
      criterion: 'geography',
      label: 'Geography not served',
      quote: lender.geography.text,
      detail: `The property is in ${deal.state}, which this lender does not serve.`,
    });
  } else {
    checks.push({
      criterion: 'geography',
      label: 'Geography',
      quote: lender.geography.text,
      detail: `${deal.state} is served.`,
    });
  }

  // --- 3. Loan size --------------------------------------------------------
  const { min, max } = lender.loanSize;
  if (deal.loanAmount > max) {
    failures.push({
      criterion: 'loan-size',
      label: 'Loan size above maximum',
      quote: lender.loanSize.text,
      detail: `The request of ${money(deal.loanAmount)} is ${money(deal.loanAmount - max)} over the ${money(max)} maximum.`,
    });
  } else if (deal.loanAmount < min) {
    failures.push({
      criterion: 'loan-size',
      label: 'Loan size below minimum',
      quote: lender.loanSize.text,
      detail: `The request of ${money(deal.loanAmount)} is ${money(min - deal.loanAmount)} under the ${money(min)} minimum.`,
    });
  } else {
    checks.push({
      criterion: 'loan-size',
      label: 'Loan size',
      quote: lender.loanSize.text,
      detail: `${money(deal.loanAmount)} sits inside the ${money(min)} to ${money(max)} range.`,
    });
  }

  // --- 4. LTV --------------------------------------------------------------
  const ltvCap = lender.ltv.cap;
  if (deal.ltv > ltvCap) {
    failures.push({
      criterion: 'ltv',
      label: 'LTV above cap',
      quote: lender.ltv.text,
      detail: `Requested LTV of ${pct(deal.ltv)} is ${points(deal.ltv, ltvCap)} points over the ${pct(ltvCap)} cap.`,
    });
  } else {
    checks.push({
      criterion: 'ltv',
      label: 'LTV',
      quote: lender.ltv.text,
      detail: `Requested LTV of ${pct(deal.ltv)} is ${points(ltvCap, deal.ltv)} points under the ${pct(ltvCap)} cap.`,
    });
  }

  // --- 5. Exposure cap for this property type ------------------------------
  const cap = lender.exposure.capPerPropertyType;
  const committed = committedFor(lender, deal.propertyType);
  const postClose = committed + deal.loanAmount;
  if (postClose > cap) {
    failures.push({
      criterion: 'exposure',
      label: 'Exposure cap exceeded',
      quote: lender.exposure.text,
      detail:
        `${money(committed)} already committed to ${typeLabel} plus this ${money(deal.loanAmount)} request ` +
        `is ${money(postClose)}, which is ${money(postClose - cap)} over the ${money(cap)} cap. ` +
        `Only ${money(Math.max(0, cap - committed))} of room remains.`,
    });
  } else {
    checks.push({
      criterion: 'exposure',
      label: 'Exposure cap',
      quote: lender.exposure.text,
      detail:
        `${money(committed)} committed to ${typeLabel} plus this request is ${money(postClose)} ` +
        `against a ${money(cap)} cap, leaving ${money(cap - postClose)} of room.`,
    });
  }

  failures.sort(
    (a, b) => FAILURE_PRECEDENCE.indexOf(a.criterion) - FAILURE_PRECEDENCE.indexOf(b.criterion),
  );

  return {
    passed: failures.length === 0,
    failures,
    driver: failures[0] ?? null,
    checks,
    exposure: { cap, committed, postClose },
  };
}

/**
 * Numeric-boundary proximity, only meaningful for a deal that failed no hard
 * criteria. Any hit here forces Borderline no matter how the soft read goes.
 *
 * `proximity` is a 0..1 fraction of the relevant margin band that has been
 * consumed (1 = sitting exactly on the boundary), used only to pick which of
 * several near-misses gets cited as the driver.
 */
export function checkMargins(deal, lender) {
  const flags = [];
  const { min, max } = lender.loanSize;

  const maxBand = max * MARGINS.loanSizeFraction;
  if (max - deal.loanAmount <= maxBand) {
    const gap = max - deal.loanAmount;
    flags.push({
      criterion: 'loan-size',
      label: 'Loan size near the maximum',
      quote: lender.loanSize.text,
      detail:
        `The ${money(deal.loanAmount)} request is within ${money(gap)} of this lender's ` +
        `${money(max)} maximum, inside the ${MARGINS.loanSizeFraction * 100}% margin.`,
      proximity: 1 - gap / maxBand,
    });
  }

  const minBand = min * MARGINS.loanSizeFraction;
  if (deal.loanAmount - min <= minBand) {
    const gap = deal.loanAmount - min;
    flags.push({
      criterion: 'loan-size',
      label: 'Loan size near the minimum',
      quote: lender.loanSize.text,
      detail:
        `The ${money(deal.loanAmount)} request is within ${money(gap)} of this lender's ` +
        `${money(min)} minimum, inside the ${MARGINS.loanSizeFraction * 100}% margin.`,
      proximity: 1 - gap / minBand,
    });
  }

  const ltvGap = points(lender.ltv.cap, deal.ltv);
  if (ltvGap <= MARGINS.ltvPoints) {
    flags.push({
      criterion: 'ltv',
      label: 'LTV near the cap',
      quote: lender.ltv.text,
      detail:
        `Requested LTV of ${pct(deal.ltv)} is ${ltvGap} points under the ${pct(lender.ltv.cap)} cap, ` +
        `inside the ${MARGINS.ltvPoints}-point margin.`,
      proximity: 1 - ltvGap / MARGINS.ltvPoints,
    });
  }

  const cap = lender.exposure.capPerPropertyType;
  const committed = lender.exposure.committed?.[deal.propertyType] ?? 0;
  const postClose = committed + deal.loanAmount;
  const exposureBand = cap * MARGINS.exposureFraction;
  if (cap - postClose <= exposureBand) {
    const room = cap - postClose;
    flags.push({
      criterion: 'exposure',
      label: 'Exposure near the cap',
      quote: lender.exposure.text,
      detail:
        `Closing this loan would put ${money(postClose)} against the ${money(cap)} ` +
        `${propertyTypeLabel(deal.propertyType)} cap, leaving only ${money(room)} of room, ` +
        `inside the ${MARGINS.exposureFraction * 100}% margin.`,
      proximity: 1 - room / exposureBand,
    });
  }

  flags.sort((a, b) => b.proximity - a.proximity);
  return flags;
}
