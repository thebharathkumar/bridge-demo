/**
 * SYNTHETIC SAMPLE DEALS.
 *
 * These are the three worked examples from the README. They are pinned here so the
 * demo UI, the README table, and the smoke tests all exercise the same inputs, and
 * `expect` records what each one is supposed to prove. The tests assert against
 * `expect`, so if the engine's behaviour drifts, `npm test` fails rather than the
 * README quietly becoming a lie.
 */

export const EXAMPLE_DEALS = [
  {
    id: 'example-1-hard-cap',
    title: 'Fails a hard cap',
    blurb: 'A $22,000,000 request against a lender whose maximum is $15,000,000.',
    expect: {
      lenderId: 'SYN-01',
      verdict: 'Not Eligible',
      criterion: 'loan-size',
      contains: ['$15,000,000', '$22,000,000'],
    },
    deal: {
      name: 'Sunbelt garden apartments, 240 units',
      loanAmount: 22_000_000,
      propertyType: 'multifamily',
      state: 'TX',
      ltv: 0.62,
      projectStage: 'stabilized',
      occupancyPct: 0.94,
      sponsor: {
        yearsExperience: 18,
        priorDealsSameAssetClass: 9,
        localToMarket: true,
        isOwnerOccupant: false,
      },
      tenancy: {},
      notes:
        'Stabilized 240-unit garden-style apartment complex in a growing metro. Repeat borrower, low leverage request, ' +
        'clean operating history. Looking for a single lender to hold the whole loan.',
    },
  },

  {
    id: 'example-2-borderline',
    title: 'Sits on a boundary',
    blurb: 'A 68.5% LTV request against a 70% cap, inside the 2-point margin.',
    expect: {
      lenderId: 'SYN-03',
      verdict: 'Borderline',
      criterion: 'ltv',
      contains: ['68.5%', '70%', '1.5'],
    },
    deal: {
      name: 'Phoenix light-industrial flex building',
      loanAmount: 6_900_000,
      propertyType: 'industrial-warehouse',
      state: 'AZ',
      ltv: 0.685,
      projectStage: 'stabilized',
      occupancyPct: 0.94,
      sponsor: {
        yearsExperience: 11,
        priorDealsSameAssetClass: 4,
        localToMarket: true,
        isOwnerOccupant: false,
      },
      tenancy: {
        largestTenantSharePct: 0.55,
        leaseTermRemainingYears: 4,
        tenantCreditRated: false,
        rolloverNext24MonthsPct: 0.2,
      },
      notes:
        'Two-tenant light-industrial flex building near a regional distribution corridor. Both tenants in place ' +
        'four years with four years remaining. Borrower owns three similar buildings within twenty miles.',
    },
  },

  {
    id: 'example-3-eligible',
    title: 'Clears everything and reads well',
    blurb: 'A $9,500,000 value-add multifamily deal with an experienced repositioning sponsor.',
    expect: {
      lenderId: 'SYN-06',
      verdict: 'Eligible',
      criterionKind: 'soft',
    },
    deal: {
      name: 'Atlanta value-add multifamily, 118 units',
      loanAmount: 9_500_000,
      propertyType: 'multifamily',
      state: 'GA',
      ltv: 0.68,
      projectStage: 'value-add',
      occupancyPct: 0.88,
      sponsor: {
        yearsExperience: 14,
        priorDealsSameAssetClass: 6,
        localToMarket: true,
        isOwnerOccupant: false,
      },
      tenancy: {
        rolloverNext24MonthsPct: 0.25,
      },
      notes:
        'Classic interior renovation plan across 118 units, taking rents to the level of two comparable properties ' +
        'the sponsor already renovated in the same submarket. Sponsor has completed six repositionings of this type ' +
        'and is based in the metro. Twelve-month renovation schedule, property occupied throughout.',
    },
  },
];

export function getExample(id) {
  return EXAMPLE_DEALS.find((example) => example.id === id);
}
