/**
 * SYNTHETIC SAMPLE DATA — NOT REAL LENDERS, NOT REAL UNDERWRITING CRITERIA.
 *
 * Every profile below is invented for this prototype. The names are deliberately
 * placeholders ("Sample Lender A") so nothing here can be mistaken for a real
 * institution, and the numbers are made up round figures, not observed terms.
 * Do not use any of this to make a real financing decision.
 *
 * Each profile carries the plain-language `text` of every criterion alongside the
 * machine-readable values. The engine cites the `text` verbatim so a verdict
 * always points at a sentence a human can read and argue with.
 */

export const SYNTHETIC_DATA_NOTICE =
  'Synthetic sample data. Placeholder lender names and invented criteria, created for this prototype only.';

/** Controlled vocabulary for property types / industries. */
export const PROPERTY_TYPES = [
  { id: 'multifamily', label: 'Multifamily' },
  { id: 'mixed-use', label: 'Mixed-use' },
  { id: 'retail-strip', label: 'Retail (strip / inline)' },
  { id: 'office', label: 'Office' },
  { id: 'medical-office', label: 'Medical office' },
  { id: 'industrial-warehouse', label: 'Industrial / warehouse' },
  { id: 'self-storage', label: 'Self-storage' },
  { id: 'hospitality-hotel', label: 'Hospitality / hotel' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'gas-station-cstore', label: 'Gas station / c-store' },
  { id: 'entertainment-special-purpose', label: 'Entertainment / special purpose' },
  { id: 'cannabis-related', label: 'Cannabis-related' },
];

export const PROJECT_STAGES = [
  { id: 'stabilized', label: 'Stabilized' },
  { id: 'light-value-add', label: 'Light value-add' },
  { id: 'value-add', label: 'Value-add / reposition' },
  { id: 'lease-up', label: 'Lease-up' },
  { id: 'ground-up-construction', label: 'Ground-up construction' },
];

export const LENDERS = [
  {
    id: 'SYN-01',
    name: 'Sample Lender A',
    archetype: 'Mid-market stabilized multifamily balance-sheet lender',
    loanSize: {
      min: 2_000_000,
      max: 15_000_000,
      text: 'Loan size: $2,000,000 to $15,000,000.',
    },
    propertyTypes: {
      included: ['multifamily', 'mixed-use'],
      excluded: ['hospitality-hotel', 'cannabis-related', 'entertainment-special-purpose'],
      text: 'Covers multifamily and mixed-use. Will not lend on hospitality/hotel, cannabis-related, or entertainment/special-purpose assets.',
    },
    geography: {
      mode: 'list',
      states: ['TX', 'OK', 'NM', 'AZ', 'CO'],
      text: 'Lends in TX, OK, NM, AZ, and CO only.',
    },
    ltv: { cap: 0.75, text: 'Maximum LTV of 75%.' },
    exposure: {
      capPerPropertyType: 40_000_000,
      committed: { multifamily: 28_500_000, 'mixed-use': 6_000_000 },
      text: 'Maximum $40,000,000 outstanding per property type. Currently $28,500,000 committed to multifamily and $6,000,000 to mixed-use.',
    },
    soft: [
      {
        id: 'SYN-01-S1',
        text: 'Prefers experienced operators, with at least three completed projects in the same asset class.',
        signal: { kind: 'min-prior-deals', min: 3 },
      },
      {
        id: 'SYN-01-S2',
        text: 'Cautious on ground-up construction; prefers stabilized or lightly repositioned business plans.',
        signal: { kind: 'stage-aversion', averse: ['ground-up-construction'] },
      },
    ],
  },

  {
    id: 'SYN-02',
    name: 'Sample Lender B',
    archetype: 'Small-balance retail and mixed-use lender',
    loanSize: {
      min: 750_000,
      max: 6_000_000,
      text: 'Loan size: $750,000 to $6,000,000.',
    },
    propertyTypes: {
      included: ['retail-strip', 'mixed-use', 'restaurant', 'office'],
      excluded: ['cannabis-related', 'gas-station-cstore'],
      text: 'Covers retail (strip/inline), mixed-use, restaurant, and office. Will not lend on cannabis-related or gas station / c-store assets.',
    },
    geography: {
      mode: 'nationwide-except',
      excludedStates: ['AK', 'HI'],
      text: 'Lends nationwide except AK and HI.',
    },
    ltv: { cap: 0.7, text: 'Maximum LTV of 70%.' },
    exposure: {
      capPerPropertyType: 12_000_000,
      committed: { 'retail-strip': 9_000_000 },
      text: 'Maximum $12,000,000 outstanding per property type. Currently $9,000,000 committed to retail (strip/inline).',
    },
    soft: [
      {
        id: 'SYN-02-S1',
        text: 'Prefers borrowers who are local to the market they are buying in.',
        signal: { kind: 'prefers-local-sponsor' },
      },
      {
        id: 'SYN-02-S2',
        text: 'Cautious on single-tenant deals with a short remaining lease term, under five years.',
        signal: { kind: 'min-lease-term', minYears: 5, onlyIfSingleTenantSharePct: 0.6 },
      },
    ],
  },

  {
    id: 'SYN-03',
    name: 'Sample Lender C',
    archetype: 'Industrial and self-storage specialist, western states',
    loanSize: {
      min: 3_000_000,
      max: 25_000_000,
      text: 'Loan size: $3,000,000 to $25,000,000.',
    },
    propertyTypes: {
      included: ['industrial-warehouse', 'self-storage'],
      excluded: ['hospitality-hotel', 'restaurant', 'cannabis-related'],
      text: 'Covers industrial/warehouse and self-storage. Will not lend on hospitality/hotel, restaurant, or cannabis-related assets.',
    },
    geography: {
      mode: 'list',
      states: ['AZ', 'NV', 'UT', 'CA', 'OR', 'WA'],
      text: 'Lends in AZ, NV, UT, CA, OR, and WA only.',
    },
    ltv: { cap: 0.7, text: 'Maximum LTV of 70%.' },
    exposure: {
      capPerPropertyType: 60_000_000,
      committed: { 'industrial-warehouse': 21_000_000, 'self-storage': 8_000_000 },
      text: 'Maximum $60,000,000 outstanding per property type. Currently $21,000,000 committed to industrial/warehouse and $8,000,000 to self-storage.',
    },
    soft: [
      {
        id: 'SYN-03-S1',
        text: 'Prefers stabilized assets at 85% occupancy or better.',
        signal: { kind: 'min-occupancy', min: 0.85 },
      },
      {
        id: 'SYN-03-S2',
        text: 'Comfortable with light value-add business plans where the operator has done one before.',
        signal: { kind: 'stage-comfort', comfortable: ['stabilized', 'light-value-add'] },
      },
    ],
  },

  {
    id: 'SYN-04',
    name: 'Sample Lender D',
    archetype: 'Hospitality lender, flagged properties',
    loanSize: {
      min: 5_000_000,
      max: 40_000_000,
      text: 'Loan size: $5,000,000 to $40,000,000.',
    },
    propertyTypes: {
      included: ['hospitality-hotel'],
      excluded: ['cannabis-related', 'entertainment-special-purpose', 'restaurant'],
      text: 'Covers hospitality/hotel only. Will not lend on cannabis-related, entertainment/special-purpose, or standalone restaurant assets.',
    },
    geography: {
      mode: 'nationwide-except',
      excludedStates: ['AK', 'HI'],
      text: 'Lends nationwide except AK and HI.',
    },
    ltv: { cap: 0.65, text: 'Maximum LTV of 65%.' },
    exposure: {
      capPerPropertyType: 75_000_000,
      committed: { 'hospitality-hotel': 41_000_000 },
      text: 'Maximum $75,000,000 outstanding per property type. Currently $41,000,000 committed to hospitality/hotel.',
    },
    soft: [
      {
        id: 'SYN-04-S1',
        text: 'Prefers operators with prior experience running a franchise-flagged property.',
        signal: { kind: 'min-prior-deals', min: 2 },
      },
      {
        id: 'SYN-04-S2',
        text: 'Cautious on properties in markets with a single demand driver.',
        signal: { kind: 'narrative-flag', watchFor: ['single demand driver', 'one employer', 'seasonal only'] },
      },
    ],
  },

  {
    id: 'SYN-05',
    name: 'Sample Lender E',
    archetype: 'Regional office and medical-office lender, northeast',
    loanSize: {
      min: 1_500_000,
      max: 12_000_000,
      text: 'Loan size: $1,500,000 to $12,000,000.',
    },
    propertyTypes: {
      included: ['office', 'medical-office', 'mixed-use'],
      excluded: ['hospitality-hotel', 'restaurant', 'cannabis-related', 'gas-station-cstore'],
      text: 'Covers office, medical office, and mixed-use. Will not lend on hospitality/hotel, restaurant, cannabis-related, or gas station / c-store assets.',
    },
    geography: {
      mode: 'list',
      states: ['NY', 'NJ', 'CT', 'PA', 'MA'],
      text: 'Lends in NY, NJ, CT, PA, and MA only.',
    },
    ltv: { cap: 0.68, text: 'Maximum LTV of 68%.' },
    exposure: {
      capPerPropertyType: 30_000_000,
      committed: { office: 27_600_000, 'medical-office': 11_000_000 },
      text: 'Maximum $30,000,000 outstanding per property type. Currently $27,600,000 committed to office and $11,000,000 to medical office.',
    },
    soft: [
      {
        id: 'SYN-05-S1',
        text: 'Prefers medical office over general office.',
        signal: { kind: 'preferred-property-types', preferred: ['medical-office'] },
      },
      {
        id: 'SYN-05-S2',
        text: 'Cautious on office assets with more than 30% of the rent roll rolling within 24 months.',
        signal: { kind: 'max-rollover', maxPct: 0.3 },
      },
    ],
  },

  {
    id: 'SYN-06',
    name: 'Sample Lender F',
    archetype: 'Bridge lender for value-add multifamily, southeast',
    loanSize: {
      min: 4_000_000,
      max: 30_000_000,
      text: 'Loan size: $4,000,000 to $30,000,000.',
    },
    propertyTypes: {
      included: ['multifamily', 'mixed-use', 'self-storage'],
      excluded: ['gas-station-cstore', 'cannabis-related', 'entertainment-special-purpose'],
      text: 'Covers multifamily, mixed-use, and self-storage. Will not lend on gas station / c-store, cannabis-related, or entertainment/special-purpose assets.',
    },
    geography: {
      mode: 'list',
      states: ['GA', 'FL', 'NC', 'SC', 'TN', 'TX'],
      text: 'Lends in GA, FL, NC, SC, TN, and TX only.',
    },
    ltv: { cap: 0.8, text: 'Maximum LTV of 80%.' },
    exposure: {
      capPerPropertyType: 50_000_000,
      committed: { multifamily: 18_000_000, 'self-storage': 4_000_000 },
      text: 'Maximum $50,000,000 outstanding per property type. Currently $18,000,000 committed to multifamily and $4,000,000 to self-storage.',
    },
    soft: [
      {
        id: 'SYN-06-S1',
        text: 'Expects an operator who has completed at least two similar repositioning projects.',
        signal: { kind: 'min-prior-deals', min: 2 },
      },
      {
        id: 'SYN-06-S2',
        text: 'Comfortable with value-add and lease-up business plans.',
        signal: { kind: 'stage-comfort', comfortable: ['value-add', 'light-value-add', 'lease-up', 'stabilized'] },
      },
    ],
  },

  {
    id: 'SYN-07',
    name: 'Sample Lender G',
    archetype: 'Owner-occupied small business real estate lender',
    loanSize: {
      min: 500_000,
      max: 5_000_000,
      text: 'Loan size: $500,000 to $5,000,000.',
    },
    propertyTypes: {
      included: ['industrial-warehouse', 'office', 'retail-strip', 'restaurant', 'medical-office'],
      excluded: ['cannabis-related', 'entertainment-special-purpose', 'hospitality-hotel'],
      text: 'Covers industrial/warehouse, office, retail (strip/inline), restaurant, and medical office. Will not lend on cannabis-related, entertainment/special-purpose, or hospitality/hotel assets.',
    },
    geography: {
      mode: 'nationwide-except',
      excludedStates: ['AK', 'HI'],
      text: 'Lends nationwide except AK and HI.',
    },
    ltv: { cap: 0.85, text: 'Maximum LTV of 85%.' },
    exposure: {
      capPerPropertyType: 15_000_000,
      committed: { 'retail-strip': 4_500_000, restaurant: 2_000_000, 'industrial-warehouse': 6_000_000 },
      text: 'Maximum $15,000,000 outstanding per property type. Currently $4,500,000 committed to retail, $2,000,000 to restaurant, and $6,000,000 to industrial/warehouse.',
    },
    soft: [
      {
        id: 'SYN-07-S1',
        text: 'Prefers owner-occupants with at least two years of operating history in the business.',
        signal: { kind: 'owner-occupant-history', minYears: 2 },
      },
      {
        id: 'SYN-07-S2',
        text: 'Cautious on start-up concepts with no prior location.',
        signal: { kind: 'min-prior-deals', min: 1 },
      },
    ],
  },

  {
    id: 'SYN-08',
    name: 'Sample Lender H',
    archetype: 'Ground-up construction lender, mid-Atlantic',
    loanSize: {
      min: 8_000_000,
      max: 45_000_000,
      text: 'Loan size: $8,000,000 to $45,000,000.',
    },
    propertyTypes: {
      included: ['multifamily', 'industrial-warehouse', 'mixed-use'],
      excluded: ['hospitality-hotel', 'restaurant', 'cannabis-related', 'gas-station-cstore'],
      text: 'Covers multifamily, industrial/warehouse, and mixed-use. Will not lend on hospitality/hotel, restaurant, cannabis-related, or gas station / c-store assets.',
    },
    geography: {
      mode: 'list',
      states: ['VA', 'MD', 'DE', 'DC', 'NC'],
      text: 'Lends in VA, MD, DE, DC, and NC only.',
    },
    ltv: { cap: 0.6, text: 'Maximum LTV of 60%.' },
    exposure: {
      capPerPropertyType: 90_000_000,
      committed: { multifamily: 52_000_000 },
      text: 'Maximum $90,000,000 outstanding per property type. Currently $52,000,000 committed to multifamily.',
    },
    soft: [
      {
        id: 'SYN-08-S1',
        text: 'Requires a general contractor with completed projects of comparable scale.',
        signal: { kind: 'gc-track-record', required: 'comparable-scale' },
      },
      {
        id: 'SYN-08-S2',
        text: 'Cautious on first-time developers.',
        signal: { kind: 'min-prior-deals', min: 1 },
      },
    ],
  },

  {
    id: 'SYN-09',
    name: 'Sample Lender I',
    archetype: 'Net-lease and single-tenant lender, nationwide',
    loanSize: {
      min: 1_000_000,
      max: 20_000_000,
      text: 'Loan size: $1,000,000 to $20,000,000.',
    },
    propertyTypes: {
      included: ['retail-strip', 'industrial-warehouse', 'medical-office', 'gas-station-cstore'],
      excluded: ['cannabis-related', 'hospitality-hotel', 'entertainment-special-purpose'],
      text: 'Covers retail (strip/inline), industrial/warehouse, medical office, and gas station / c-store. Will not lend on cannabis-related, hospitality/hotel, or entertainment/special-purpose assets.',
    },
    geography: {
      mode: 'nationwide-except',
      excludedStates: [],
      text: 'Lends nationwide, all 50 states.',
    },
    ltv: { cap: 0.72, text: 'Maximum LTV of 72%.' },
    exposure: {
      capPerPropertyType: 35_000_000,
      committed: { 'retail-strip': 12_000_000, 'gas-station-cstore': 3_000_000 },
      text: 'Maximum $35,000,000 outstanding per property type. Currently $12,000,000 committed to retail and $3,000,000 to gas station / c-store.',
    },
    soft: [
      {
        id: 'SYN-09-S1',
        text: 'Prefers a long remaining lease term, ten years or more.',
        signal: { kind: 'min-lease-term', minYears: 10 },
      },
      {
        id: 'SYN-09-S2',
        text: 'Cautious on tenants without a public credit rating.',
        signal: { kind: 'prefers-credit-tenant' },
      },
    ],
  },
];

export function getLender(id) {
  return LENDERS.find((lender) => lender.id === id);
}

export function propertyTypeLabel(id) {
  return PROPERTY_TYPES.find((type) => type.id === id)?.label ?? id;
}
