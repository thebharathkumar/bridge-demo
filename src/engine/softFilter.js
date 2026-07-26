/**
 * Soft criteria. Judgment, not arithmetic.
 *
 * Two things are true at once here:
 *   1. This pass only ever runs on a deal that has already cleared every hard
 *      criterion. There is no point spending a judgment call on a deal that is
 *      already disqualified by a number.
 *   2. A soft read can move a verdict from Eligible to Borderline, but it can
 *      never produce Not Eligible. "The operator looks thin for this business
 *      plan" is a reason to put a human on it, not a reason to hand someone a
 *      confident no.
 *
 * The LLM path and the deterministic path return the same shape, so the verdict
 * logic downstream does not know or care which one ran.
 */

import { pct } from './format.js';
import { propertyTypeLabel } from '../data/lenders.js';

const ASSESSMENTS = ['supports', 'neutral', 'concern'];
const DEFAULT_MODEL = process.env.LENDER_FIT_MODEL || 'claude-opus-5';

/* ------------------------------------------------------------------ *
 * Deterministic evaluator (the offline default)
 * ------------------------------------------------------------------ */

function unknown(reason) {
  return { assessment: 'neutral', reason: `Not assessed: ${reason}` };
}

/**
 * One evaluator per signal kind. Each returns { assessment, reason }.
 * Missing data is deliberately `neutral`, never `concern` — an absent field is
 * an incomplete submission, not a red flag, and pretending otherwise would put
 * deals in Borderline for no reason.
 */
const SIGNAL_EVALUATORS = {
  'min-prior-deals': (signal, deal) => {
    const count = deal.sponsor?.priorDealsSameAssetClass;
    if (count === undefined || count === null) return unknown('no prior-deal count given for the sponsor');
    if (count >= signal.min) {
      return {
        assessment: 'supports',
        reason: `The sponsor has ${count} prior deal${count === 1 ? '' : 's'} in this asset class, at or above the ${signal.min} this lender looks for.`,
      };
    }
    return {
      assessment: 'concern',
      reason: `The sponsor has ${count} prior deal${count === 1 ? '' : 's'} in this asset class, short of the ${signal.min} this lender looks for.`,
    };
  },

  'stage-aversion': (signal, deal) => {
    if (!deal.projectStage) return unknown('no business plan / project stage given');
    if (signal.averse.includes(deal.projectStage)) {
      return {
        assessment: 'concern',
        reason: `This is a ${stageLabel(deal.projectStage)} deal, which is the business plan this lender says it is cautious on.`,
      };
    }
    return {
      assessment: 'supports',
      reason: `This is a ${stageLabel(deal.projectStage)} deal, not the business plan this lender is cautious on.`,
    };
  },

  'stage-comfort': (signal, deal) => {
    if (!deal.projectStage) return unknown('no business plan / project stage given');
    if (signal.comfortable.includes(deal.projectStage)) {
      return {
        assessment: 'supports',
        reason: `A ${stageLabel(deal.projectStage)} business plan is one this lender says it is comfortable with.`,
      };
    }
    return {
      assessment: 'concern',
      reason: `A ${stageLabel(deal.projectStage)} business plan is outside what this lender says it is comfortable with.`,
    };
  },

  'min-occupancy': (signal, deal) => {
    const occ = deal.occupancyPct;
    if (occ === undefined || occ === null) return unknown('no occupancy given');
    if (occ >= signal.min) {
      return {
        assessment: 'supports',
        reason: `Occupancy of ${pct(occ)} is at or above the ${pct(signal.min)} this lender prefers.`,
      };
    }
    return {
      assessment: 'concern',
      reason: `Occupancy of ${pct(occ)} is below the ${pct(signal.min)} this lender prefers.`,
    };
  },

  'prefers-local-sponsor': (signal, deal) => {
    const local = deal.sponsor?.localToMarket;
    if (local === undefined || local === null) return unknown('not stated whether the sponsor is local to the market');
    return local
      ? { assessment: 'supports', reason: 'The sponsor is local to the market, which this lender prefers.' }
      : { assessment: 'concern', reason: 'The sponsor is out of market, and this lender prefers local borrowers.' };
  },

  'min-lease-term': (signal, deal) => {
    if (signal.onlyIfSingleTenantSharePct !== undefined) {
      const share = deal.tenancy?.largestTenantSharePct;
      if (share === undefined || share === null) return unknown('no tenant concentration given');
      if (share < signal.onlyIfSingleTenantSharePct) {
        return {
          assessment: 'supports',
          reason: `The largest tenant is ${pct(share)} of the rent roll, under the ${pct(signal.onlyIfSingleTenantSharePct)} concentration where this criterion bites.`,
        };
      }
    }
    const term = deal.tenancy?.leaseTermRemainingYears;
    if (term === undefined || term === null) return unknown('no remaining lease term given');
    if (term >= signal.minYears) {
      return {
        assessment: 'supports',
        reason: `${term} years of remaining lease term meets the ${signal.minYears} this lender prefers.`,
      };
    }
    return {
      assessment: 'concern',
      reason: `${term} years of remaining lease term is short of the ${signal.minYears} this lender prefers.`,
    };
  },

  'prefers-credit-tenant': (signal, deal) => {
    const rated = deal.tenancy?.tenantCreditRated;
    if (rated === undefined || rated === null) return unknown('not stated whether the tenant carries a public credit rating');
    return rated
      ? { assessment: 'supports', reason: 'The tenant carries a public credit rating, which this lender prefers.' }
      : { assessment: 'concern', reason: 'The tenant has no public credit rating, and this lender is cautious on unrated tenants.' };
  },

  'max-rollover': (signal, deal) => {
    const rollover = deal.tenancy?.rolloverNext24MonthsPct;
    if (rollover === undefined || rollover === null) return unknown('no 24-month rollover figure given');
    if (rollover <= signal.maxPct) {
      return {
        assessment: 'supports',
        reason: `${pct(rollover)} of the rent roll rolls within 24 months, under this lender's ${pct(signal.maxPct)} comfort line.`,
      };
    }
    return {
      assessment: 'concern',
      reason: `${pct(rollover)} of the rent roll rolls within 24 months, over this lender's ${pct(signal.maxPct)} comfort line.`,
    };
  },

  'owner-occupant-history': (signal, deal) => {
    const owner = deal.sponsor?.isOwnerOccupant;
    if (owner === undefined || owner === null) return unknown('not stated whether the borrower will occupy the property');
    if (!owner) {
      return {
        assessment: 'concern',
        reason: 'This is an investor deal, and this lender is built around owner-occupants.',
      };
    }
    const years = deal.sponsor?.yearsExperience;
    if (years === undefined || years === null) return unknown('no operating history given for the borrower');
    if (years >= signal.minYears) {
      return {
        assessment: 'supports',
        reason: `An owner-occupant with ${years} years of operating history, past the ${signal.minYears} this lender asks for.`,
      };
    }
    return {
      assessment: 'concern',
      reason: `An owner-occupant with only ${years} years of operating history, short of the ${signal.minYears} this lender asks for.`,
    };
  },

  'gc-track-record': (signal, deal) => {
    const record = deal.sponsor?.generalContractorTrackRecord;
    if (!record) return unknown('no general contractor track record given');
    if (record === signal.required) {
      return {
        assessment: 'supports',
        reason: 'The general contractor has completed projects of comparable scale, which is what this lender requires.',
      };
    }
    return {
      assessment: 'concern',
      reason: `The general contractor's track record is "${record}", not the comparable-scale record this lender requires.`,
    };
  },

  'preferred-property-types': (signal, deal) => {
    if (signal.preferred.includes(deal.propertyType)) {
      return {
        assessment: 'supports',
        reason: `${propertyTypeLabel(deal.propertyType)} is the property type this lender prefers within its box.`,
      };
    }
    return {
      assessment: 'neutral',
      reason: `${propertyTypeLabel(deal.propertyType)} is inside this lender's box but not its stated preference.`,
    };
  },

  /**
   * Keyword scan over the free-text notes. This is the weakest evaluator in the
   * file and the clearest example of what the LLM pass is actually for.
   */
  'narrative-flag': (signal, deal) => {
    const notes = (deal.notes || '').toLowerCase();
    if (!notes) return unknown('no deal narrative provided to read');
    const hit = signal.watchFor.find((phrase) => notes.includes(phrase.toLowerCase()));
    if (hit) {
      return {
        assessment: 'concern',
        reason: `The deal narrative mentions "${hit}", which is what this lender says it is cautious on.`,
      };
    }
    return {
      assessment: 'neutral',
      reason: 'Nothing in the deal narrative matches the language this lender flags, but a keyword scan is a weak test of this.',
    };
  },
};

/**
 * Prose forms of the project stages. Naive hyphen-stripping turned "value-add"
 * into "value add", which reads wrong in a cited sentence.
 */
const STAGE_PROSE = {
  stabilized: 'stabilized',
  'light-value-add': 'light value-add',
  'value-add': 'value-add',
  'lease-up': 'lease-up',
  'ground-up-construction': 'ground-up construction',
};

function stageLabel(stage) {
  return STAGE_PROSE[stage] ?? String(stage).replace(/-/g, ' ');
}

export function evaluateSoftDeterministic(deal, lender) {
  return lender.soft.map((criterion) => {
    const evaluator = SIGNAL_EVALUATORS[criterion.signal?.kind];
    const result = evaluator
      ? evaluator(criterion.signal, deal)
      : unknown(`no evaluator for signal "${criterion.signal?.kind}"`);
    return { id: criterion.id, text: criterion.text, ...result };
  });
}

/* ------------------------------------------------------------------ *
 * LLM pass (optional, behind an API key check)
 * ------------------------------------------------------------------ */

const SOFT_SCHEMA = {
  type: 'object',
  properties: {
    assessments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          assessment: { type: 'string', enum: ASSESSMENTS },
          reason: { type: 'string' },
        },
        required: ['id', 'assessment', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['assessments'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You judge soft lending criteria for a deal-matching prototype that runs on synthetic sample data.

The hard criteria (loan size, property type, geography, LTV, exposure caps) have ALREADY been checked deterministically in code and this deal passed all of them. Do not re-check them, do not comment on them, and do not second-guess the arithmetic.

Your only job is to read each soft criterion and say how the deal reads against it:
- "supports"  - a fact in the deal directly satisfies what the criterion asks for
- "concern"   - a fact in the deal runs against what the criterion asks for
- "neutral"   - the deal does not say enough to judge this criterion either way

Rules:
- Return exactly one assessment per criterion, using the criterion's id.
- Ground every reason in a specific fact from the deal. Name the number or the detail.
- If the deal is silent on what a criterion asks about, that is "neutral". Absent information is not a concern.
- A "concern" is a reason for a human underwriter to look, not a rejection. Never phrase it as a decline.
- Keep each reason to one sentence, plain English, no hedging filler.`;

let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const mod = await import('@anthropic-ai/sdk');
      const Anthropic = mod.default ?? mod.Anthropic;
      return new Anthropic({ timeout: 30_000, maxRetries: 1 });
    })();
  }
  return clientPromise;
}

export function llmConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function describeDeal(deal) {
  const lines = [
    `Deal: ${deal.name || 'unnamed'}`,
    `Loan requested: $${deal.loanAmount.toLocaleString('en-US')}`,
    `Property type: ${propertyTypeLabel(deal.propertyType)}`,
    `Location: ${deal.state}`,
    `LTV: ${pct(deal.ltv)}`,
  ];
  if (deal.projectStage) lines.push(`Business plan / stage: ${stageLabel(deal.projectStage)}`);
  if (deal.occupancyPct !== undefined && deal.occupancyPct !== null) {
    lines.push(`Occupancy: ${pct(deal.occupancyPct)}`);
  }

  const s = deal.sponsor ?? {};
  const sponsorBits = [];
  if (s.yearsExperience !== undefined) sponsorBits.push(`${s.yearsExperience} years of experience`);
  if (s.priorDealsSameAssetClass !== undefined) {
    sponsorBits.push(`${s.priorDealsSameAssetClass} prior deals in this asset class`);
  }
  if (s.localToMarket !== undefined) sponsorBits.push(s.localToMarket ? 'local to the market' : 'out of market');
  if (s.isOwnerOccupant !== undefined) {
    sponsorBits.push(s.isOwnerOccupant ? 'will occupy the property' : 'investor, will not occupy');
  }
  if (s.generalContractorTrackRecord) {
    sponsorBits.push(`general contractor track record: ${s.generalContractorTrackRecord}`);
  }
  if (sponsorBits.length) lines.push(`Sponsor: ${sponsorBits.join('; ')}`);

  const t = deal.tenancy ?? {};
  const tenancyBits = [];
  if (t.largestTenantSharePct !== undefined) {
    tenancyBits.push(`largest tenant is ${pct(t.largestTenantSharePct)} of the rent roll`);
  }
  if (t.leaseTermRemainingYears !== undefined) {
    tenancyBits.push(`${t.leaseTermRemainingYears} years of remaining lease term`);
  }
  if (t.tenantCreditRated !== undefined) {
    tenancyBits.push(t.tenantCreditRated ? 'tenant has a public credit rating' : 'tenant has no public credit rating');
  }
  if (t.rolloverNext24MonthsPct !== undefined) {
    tenancyBits.push(`${pct(t.rolloverNext24MonthsPct)} of the rent roll rolls within 24 months`);
  }
  if (tenancyBits.length) lines.push(`Tenancy: ${tenancyBits.join('; ')}`);

  if (deal.notes) lines.push(`Narrative from the borrower: ${deal.notes}`);
  return lines.join('\n');
}

/**
 * @returns {Promise<Array|null>} assessments, or null if the pass could not be
 *   completed for any reason. A null here is not an error the caller has to
 *   handle loudly — it just means the deterministic evaluator runs instead.
 */
export async function evaluateSoftWithLlm(deal, lender) {
  const prompt = [
    `Lender: ${lender.name} (${lender.archetype}). This is synthetic sample data.`,
    '',
    'Soft criteria to judge:',
    ...lender.soft.map((c) => `- id ${c.id}: "${c.text}"`),
    '',
    'The deal:',
    describeDeal(deal),
  ].join('\n');

  try {
    const client = await getClient();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SOFT_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    });

    if (response.stop_reason === 'refusal') {
      console.warn(`[soft] model declined the soft pass for ${lender.id}; using deterministic fallback`);
      return null;
    }
    if (response.stop_reason === 'max_tokens') {
      console.warn(`[soft] soft pass for ${lender.id} hit max_tokens; using deterministic fallback`);
      return null;
    }

    const text = response.content.find((block) => block.type === 'text')?.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    return validateAssessments(parsed, lender);
  } catch (error) {
    console.warn(`[soft] soft pass for ${lender.id} failed (${error?.message ?? error}); using deterministic fallback`);
    return null;
  }
}

/**
 * The model is not trusted to return whatever it likes. Every criterion must be
 * accounted for exactly once with a legal assessment value, or the whole result
 * is discarded in favour of the deterministic pass. A partially-populated soft
 * read would silently drop a criterion out of the verdict.
 */
function validateAssessments(parsed, lender) {
  const rows = parsed?.assessments;
  if (!Array.isArray(rows)) return null;

  const byId = new Map();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string') return null;
    if (!ASSESSMENTS.includes(row.assessment)) return null;
    if (typeof row.reason !== 'string' || !row.reason.trim()) return null;
    if (byId.has(row.id)) return null;
    byId.set(row.id, row);
  }

  const out = [];
  for (const criterion of lender.soft) {
    const row = byId.get(criterion.id);
    if (!row) return null;
    out.push({
      id: criterion.id,
      text: criterion.text,
      assessment: row.assessment,
      reason: row.reason.trim(),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * @param {'auto'|'deterministic'|'llm'} mode
 * @returns {Promise<{source: 'llm'|'deterministic', assessments: Array}>}
 */
export async function evaluateSoftCriteria(deal, lender, mode = 'auto') {
  const wantLlm = mode === 'llm' || (mode === 'auto' && llmConfigured());
  if (wantLlm && llmConfigured()) {
    const assessments = await evaluateSoftWithLlm(deal, lender);
    if (assessments) return { source: 'llm', assessments };
  }
  return { source: 'deterministic', assessments: evaluateSoftDeterministic(deal, lender) };
}
