/**
 * Input normalization and validation.
 *
 * The engine treats LTV and occupancy as fractions (0.685). Humans and form fields
 * hand over percentages (68.5). Anything above 1 is read as a percentage, which is
 * unambiguous here because no real deal has an LTV of 150% and none has one of 0.68%.
 */

import { PROPERTY_TYPES, PROJECT_STAGES } from '../data/lenders.js';

const PROPERTY_TYPE_IDS = new Set(PROPERTY_TYPES.map((t) => t.id));
const PROJECT_STAGE_IDS = new Set(PROJECT_STAGES.map((s) => s.id));

export class DealValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DealValidationError';
  }
}

function toNumber(value, field) {
  if (value === '' || value === null || value === undefined) return undefined;
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(num)) throw new DealValidationError(`"${field}" must be a number, received: ${value}`);
  return num;
}

/** Accepts 0.685 or 68.5, returns 0.685. */
function toFraction(value, field) {
  const num = toNumber(value, field);
  if (num === undefined) return undefined;
  const fraction = num > 1 ? num / 100 : num;
  if (fraction < 0 || fraction > 1.5) {
    throw new DealValidationError(`"${field}" of ${value} is out of range; give a percentage like 68.5 or a fraction like 0.685`);
  }
  return fraction;
}

function toBool(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const str = String(value).toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(str)) return true;
  if (['false', 'no', 'n', '0'].includes(str)) return false;
  return undefined;
}

export function normalizeDeal(input) {
  if (!input || typeof input !== 'object') {
    throw new DealValidationError('A deal object is required.');
  }

  const loanAmount = toNumber(input.loanAmount, 'loanAmount');
  if (loanAmount === undefined) throw new DealValidationError('"loanAmount" is required.');
  if (loanAmount <= 0) throw new DealValidationError('"loanAmount" must be greater than zero.');

  const propertyType = String(input.propertyType ?? '').trim();
  if (!propertyType) throw new DealValidationError('"propertyType" is required.');
  if (!PROPERTY_TYPE_IDS.has(propertyType)) {
    throw new DealValidationError(
      `"propertyType" must be one of: ${[...PROPERTY_TYPE_IDS].join(', ')}. Received: ${propertyType}`,
    );
  }

  const state = String(input.state ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new DealValidationError('"state" must be a two-letter code, for example TX.');
  }

  const ltv = toFraction(input.ltv, 'ltv');
  if (ltv === undefined) throw new DealValidationError('"ltv" is required.');

  const projectStage = input.projectStage ? String(input.projectStage).trim() : undefined;
  if (projectStage && !PROJECT_STAGE_IDS.has(projectStage)) {
    throw new DealValidationError(
      `"projectStage" must be one of: ${[...PROJECT_STAGE_IDS].join(', ')}. Received: ${projectStage}`,
    );
  }

  const sponsorIn = input.sponsor ?? {};
  const tenancyIn = input.tenancy ?? {};

  const deal = {
    name: input.name ? String(input.name).trim() : 'Untitled deal',
    loanAmount,
    propertyType,
    state,
    ltv,
    projectStage,
    occupancyPct: toFraction(input.occupancyPct, 'occupancyPct'),
    sponsor: {
      yearsExperience: toNumber(sponsorIn.yearsExperience, 'sponsor.yearsExperience'),
      priorDealsSameAssetClass: toNumber(sponsorIn.priorDealsSameAssetClass, 'sponsor.priorDealsSameAssetClass'),
      localToMarket: toBool(sponsorIn.localToMarket),
      isOwnerOccupant: toBool(sponsorIn.isOwnerOccupant),
      generalContractorTrackRecord: sponsorIn.generalContractorTrackRecord
        ? String(sponsorIn.generalContractorTrackRecord).trim()
        : undefined,
    },
    tenancy: {
      largestTenantSharePct: toFraction(tenancyIn.largestTenantSharePct, 'tenancy.largestTenantSharePct'),
      leaseTermRemainingYears: toNumber(tenancyIn.leaseTermRemainingYears, 'tenancy.leaseTermRemainingYears'),
      tenantCreditRated: toBool(tenancyIn.tenantCreditRated),
      rolloverNext24MonthsPct: toFraction(tenancyIn.rolloverNext24MonthsPct, 'tenancy.rolloverNext24MonthsPct'),
    },
    notes: input.notes ? String(input.notes).trim() : '',
  };

  // Strip undefined leaves so "not stated" is genuinely absent rather than a key
  // holding undefined. The soft evaluators distinguish the two.
  for (const group of ['sponsor', 'tenancy']) {
    for (const [key, value] of Object.entries(deal[group])) {
      if (value === undefined) delete deal[group][key];
    }
  }
  if (deal.occupancyPct === undefined) delete deal.occupancyPct;
  if (deal.projectStage === undefined) delete deal.projectStage;

  return deal;
}
