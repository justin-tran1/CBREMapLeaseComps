import type { ColumnMap, FieldDef, FieldKey } from '../types'

/**
 * Canonical field catalogue.
 *
 * `synonyms` are matched against normalized headers (lowercase, punctuation collapsed to
 * single spaces). Earlier entries score higher, so put the most specific phrasing first:
 * "base rent" must outrank the generic "rent" so an `Effective Rent` column never
 * captures the base rent slot.
 */
export const FIELDS: FieldDef[] = [
  // ---------------------------------------------------------------- Location
  {
    key: 'propertyName',
    label: 'Property name',
    group: 'Location',
    kind: 'text',
    hint: 'Building or project name',
    synonyms: [
      'property name',
      'building name',
      'property',
      'building',
      'project name',
      'asset name',
      'site name',
      'name',
    ],
    avoid: ['tenant', 'lessee', 'lessor', 'landlord', 'broker', 'owner', 'type', 'subtype'],
  },
  {
    key: 'address',
    label: 'Street address',
    group: 'Location',
    kind: 'text',
    hint: 'Used for geocoding',
    synonyms: [
      'street address',
      'property address',
      'address 1',
      'address line 1',
      'addr',
      'address',
      'street',
      'location',
      'full address',
      'site address',
      'building address',
    ],
    avoid: ['email', 'city', 'state', 'zip', 'postal', 'county', 'country', 'address 2'],
    required: true,
  },
  {
    key: 'city',
    label: 'City',
    group: 'Location',
    kind: 'text',
    synonyms: ['city', 'town', 'municipality', 'city name'],
    avoid: ['county'],
  },
  {
    key: 'state',
    label: 'State',
    group: 'Location',
    kind: 'text',
    synonyms: ['state', 'st', 'province', 'state province', 'state code'],
    avoid: ['estate', 'status', 'statement'],
  },
  {
    key: 'zip',
    label: 'ZIP code',
    group: 'Location',
    kind: 'text',
    synonyms: ['zip', 'zip code', 'zipcode', 'postal code', 'post code', 'postcode', 'zip 5'],
  },
  {
    key: 'county',
    label: 'County',
    group: 'Location',
    kind: 'text',
    synonyms: ['county', 'parish', 'borough'],
  },
  {
    key: 'market',
    label: 'Market',
    group: 'Location',
    kind: 'text',
    synonyms: ['market', 'metro', 'msa', 'market name', 'cbre market'],
    avoid: ['submarket', 'sub market'],
  },
  {
    key: 'submarket',
    label: 'Submarket',
    group: 'Location',
    kind: 'text',
    synonyms: ['submarket', 'sub market', 'sub-market', 'micro market', 'submarket name'],
  },
  {
    key: 'district',
    label: 'District',
    group: 'Location',
    kind: 'text',
    synonyms: ['district', 'district name', 'leasing district', 'micromarket', 'neighborhood', 'neighbourhood'],
  },
  {
    key: 'latitude',
    label: 'Latitude',
    group: 'Location',
    kind: 'coord',
    hint: 'Skips geocoding when present',
    synonyms: ['latitude', 'lat', 'y coord', 'y coordinate', 'geo lat'],
  },
  {
    key: 'longitude',
    label: 'Longitude',
    group: 'Location',
    kind: 'coord',
    hint: 'Skips geocoding when present',
    synonyms: ['longitude', 'long', 'lng', 'lon', 'x coord', 'x coordinate', 'geo lon', 'geo lng'],
  },

  // ------------------------------------------------------------------- Asset
  {
    key: 'propertyType',
    label: 'Property type',
    group: 'Asset',
    kind: 'text',
    synonyms: [
      'property type',
      'asset type',
      'building type',
      'product type',
      'sector',
      'space type',
      'property use',
    ],
    avoid: ['sub', 'lease', 'rate', 'transaction', 'deal'],
  },
  {
    key: 'propertySubtype',
    label: 'Property subtype',
    group: 'Asset',
    kind: 'text',
    synonyms: [
      'property subtype',
      'property sub type',
      'property sub-type',
      'asset subtype',
      'building subtype',
      'subtype',
      'sub type',
      'sub-type',
      'secondary type',
    ],
  },
  {
    key: 'buildingClass',
    label: 'Building class',
    group: 'Asset',
    kind: 'text',
    synonyms: ['building class', 'class', 'property class', 'bldg class'],
  },
  {
    key: 'yearBuilt',
    label: 'Year built',
    group: 'Asset',
    kind: 'number',
    synonyms: ['year built', 'yr built', 'built', 'construction year', 'year constructed'],
  },

  // ----------------------------------------------------------- Dates & term
  {
    key: 'leaseDate',
    label: 'Lease date',
    group: 'Dates & term',
    kind: 'date',
    hint: 'Commencement date drives the timeline',
    synonyms: [
      'lease date',
      'commencement date',
      'rent commencement date',
      'lease commencement',
      'rent commencement',
      'commencement',
      'lease start date',
      'lease start',
      'start date',
      'occupancy date',
      'transaction date',
      'deal date',
      'date',
    ],
    avoid: ['expiration', 'expiry', 'end', 'execution', 'executed', 'signed', 'entered', 'created'],
  },
  {
    key: 'executionDate',
    label: 'Signed date',
    group: 'Dates & term',
    kind: 'date',
    synonyms: [
      'execution date',
      'date executed',
      'lease execution date',
      'executed date',
      'signed date',
      'date signed',
      'signing date',
      'execution',
      'executed',
      'signature date',
    ],
  },
  {
    key: 'expirationDate',
    label: 'Expiration date',
    group: 'Dates & term',
    kind: 'date',
    hint: 'Used to derive term length when term is blank',
    synonyms: [
      'expiration date',
      'lease expiration',
      'lease expiration date',
      'expiry date',
      'expiration',
      'lease end date',
      'end date',
      'lease end',
      'termination date',
    ],
  },
  {
    key: 'termMonths',
    label: 'Term length',
    group: 'Dates & term',
    kind: 'months',
    hint: 'Months or years; both are recognised',
    synonyms: [
      'term months',
      'term in months',
      'lease term months',
      'term length months',
      'term length',
      'lease term',
      'term years',
      'term in years',
      'lease term years',
      'term yrs',
      'term',
      'months',
      'duration',
    ],
    avoid: ['remaining', 'free', 'abatement', 'option'],
  },

  // ---------------------------------------------------------- Deal structure
  {
    key: 'leaseType',
    label: 'Lease type',
    group: 'Deal structure',
    kind: 'text',
    hint: 'NNN, full service, modified gross, sublease',
    synonyms: [
      'lease type',
      'lease structure',
      'lease basis',
      'type of lease',
      'lease category',
      'expense structure',
      'lease kind',
    ],
    avoid: ['rate', 'property', 'asset', 'building', 'transaction'],
  },
  {
    key: 'rateType',
    label: 'Rate type',
    group: 'Deal structure',
    kind: 'text',
    hint: 'How the base rent is quoted, e.g. annual $/SF NNN',
    synonyms: [
      'rate type',
      'rent type',
      'rate basis',
      'rent basis',
      'quote type',
      'quoted rate type',
      'rate structure',
      'service type',
      'rent structure',
      'rate frequency',
      'rent frequency',
      'rate unit',
      'rent unit',
      'rate period',
    ],
  },
  {
    key: 'transactionType',
    label: 'Transaction type',
    group: 'Deal structure',
    kind: 'text',
    hint: 'New, renewal, expansion, relocation',
    synonyms: [
      'transaction type',
      'deal type',
      'transaction',
      'lease transaction type',
      'new or renewal',
      'renewal type',
      'deal category',
    ],
  },

  // ------------------------------------------------------------------- Space
  {
    key: 'suite',
    label: 'Suite',
    group: 'Space',
    kind: 'text',
    synonyms: ['suite', 'suite number', 'suite no', 'unit', 'unit number', 'space', 'space id', 'suite name'],
    avoid: ['size', 'sf', 'area'],
  },
  {
    key: 'floor',
    label: 'Floor',
    group: 'Space',
    kind: 'text',
    synonyms: ['floor', 'floor number', 'floors', 'level', 'story', 'storey', 'floor no'],
    avoid: ['area', 'plate', 'total floors', 'stories'],
  },
  {
    key: 'areaLeased',
    label: 'Area leased',
    group: 'Space',
    kind: 'area',
    hint: 'Square feet on this deal',
    synonyms: [
      'area leased',
      'leased area',
      'leased sf',
      'sf leased',
      'square feet leased',
      'transaction size',
      'deal size',
      'leased square feet',
      'rentable area',
      'rentable sf',
      'rsf',
      'square footage',
      'square feet',
      'size sf',
      'area sf',
      'size',
      'area',
      'sf',
    ],
    avoid: ['building', 'total', 'lot', 'land', 'available', 'vacant', 'plate', 'site', 'deprecated'],
    required: true,
  },
  {
    key: 'officeArea',
    label: 'Office area',
    group: 'Space',
    kind: 'area',
    hint: 'A secondary area column. Never treated as the leased area.',
    synonyms: ['office area deprecated', 'office area', 'office sf', 'office square feet', 'office rsf'],
  },

  // -------------------------------------------------------------- Economics
  {
    key: 'baseRent',
    label: 'Base rent',
    group: 'Economics',
    kind: 'currency',
    hint: 'Starting rent as quoted',
    synonyms: [
      'base rent',
      'starting base rent',
      'starting rent',
      'initial rent',
      'base rental rate',
      'base rate',
      'starting rate',
      'contract rent',
      'net rent',
      'face rent',
      'asking rent',
      'quoted rent',
      'rent psf',
      'rent per sf',
      'rental rate',
      'base rent psf',
      'rent',
      'rate',
    ],
    avoid: [
      'effective',
      'free',
      'escalat',
      'increase',
      'bump',
      'opex',
      'operating',
      'expense',
      'cam',
      'tax',
      'type',
      'total',
      'annual rent',
      'ti',
      'concession',
    ],
    required: true,
  },
  {
    key: 'effectiveRent',
    label: 'Effective rent',
    group: 'Economics',
    kind: 'currency',
    hint: 'Net effective rent, kept separate from base rent',
    synonyms: [
      'net effective rent',
      'effective rent',
      'ner',
      'effective rate',
      'net effective rate',
      'average effective rent',
    ],
  },
  {
    key: 'opex',
    label: 'OpEx',
    group: 'Economics',
    kind: 'currency',
    hint: 'Operating expenses / CAM / NNN load',
    synonyms: [
      'opex',
      'op ex',
      'operating expenses',
      'operating expense',
      'operating costs',
      'expense reimbursement',
      'expenses psf',
      'cam',
      'cam charges',
      'nnn charges',
      'nnn expenses',
      'additional rent',
      'expense load',
      'expense stop',
      'triple net expenses',
      'taxes and opex',
      'expenses',
    ],
    avoid: ['type', 'base rent'],
  },
  {
    key: 'escalation',
    label: 'Escalation',
    group: 'Economics',
    kind: 'text',
    hint: 'The escalation column to display. Pick the descriptive one if the sheet has several.',
    synonyms: [
      'annual escalation',
      'rent escalation',
      'escalations',
      'escalation',
      'annual increase',
      'annual increases',
      'rent increases',
      'rent bumps',
      'bumps',
      'increases',
      'annual bump',
      'escalation schedule',
      'escalation detail',
      'escalation description',
    ],
    avoid: ['type', 'basis', 'comment', 'note', 'percent', 'pct', 'value', 'amount'],
  },
  {
    key: 'escalationType',
    label: 'Escalation type',
    group: 'Economics',
    kind: 'text',
    hint: 'Fixed %, fixed $, CPI',
    synonyms: [
      'escalation type',
      'escalation basis',
      'escalation structure',
      'bump type',
      'increase type',
      'escalation method',
    ],
  },
  {
    key: 'escalationPercent',
    label: 'Escalation percent',
    group: 'Economics',
    kind: 'percent',
    hint: 'The percentage escalation, shown with the type',
    synonyms: [
      'escalation percent',
      'escalation percentage',
      'escalation pct',
      'escalation rate',
      'annual escalation percent',
      'annual escalation rate',
      'increase percent',
      'bump percent',
      'escalation %',
    ],
    avoid: ['comment', 'note', 'value', 'amount'],
  },
  {
    key: 'escalationValue',
    label: 'Escalation value',
    group: 'Economics',
    kind: 'currency',
    hint: 'A per-SF dollar escalation, used when no percentage is given',
    synonyms: [
      'escalation value',
      'escalation amount',
      'escalation dollars',
      'escalation psf',
      'bump amount',
      'annual escalation amount',
    ],
    avoid: ['comment', 'note', 'percent', 'pct'],
  },
  {
    key: 'escalationComments',
    label: 'Escalation comments',
    group: 'Economics',
    kind: 'text',
    hint: 'Free text describing a stepped or unusual escalation',
    synonyms: [
      'escalation comments',
      'escalation comment',
      'escalation notes',
      'escalation note',
      'escalation description',
      'escalation detail',
      'escalation remarks',
      'escalation schedule',
    ],
  },
  {
    key: 'freeRent',
    label: 'Free rent',
    group: 'Economics',
    kind: 'months',
    hint: 'Abatement in months',
    synonyms: [
      'free rent months',
      'months free rent',
      'free rent',
      'rent abatement months',
      'rent abatement',
      'abatement months',
      'abatement',
      'months free',
      'free months',
      'concession months',
    ],
  },
  {
    key: 'tiAllowance',
    label: 'TI allowance',
    group: 'Economics',
    kind: 'currency',
    hint: 'Tenant improvement allowance per SF',
    synonyms: [
      'ti allowance',
      'tenant improvement allowance',
      'tenant improvement',
      'tenant improvements',
      'ti psf',
      'ti per sf',
      'ti allowance psf',
      'improvement allowance',
      'ti $',
      'ti',
      'tia',
    ],
    avoid: ['type', 'title', 'note', 'comment', 'as is'],
  },
  {
    key: 'tiAsIs',
    label: 'TIs as-is',
    group: 'Economics',
    kind: 'text',
    hint: 'Whether the space was taken in as-is condition',
    synonyms: ['tis as is', 'ti as is', 'tenant improvements as is', 'as is', 'as is condition', 'delivered as is'],
  },
  {
    key: 'tiNotes',
    label: 'TI notes',
    group: 'Economics',
    kind: 'text',
    synonyms: ['ti notes', 'ti note', 'ti comments', 'tenant improvement notes', 'ti allowance notes', 'improvement notes'],
  },
  {
    key: 'otherConcessions',
    label: 'Other concessions',
    group: 'Economics',
    kind: 'text',
    synonyms: [
      'other concessions',
      'other concession',
      'concessions',
      'concession',
      'additional concessions',
      'inducements',
    ],
  },

  // ---------------------------------------------------------------- Parties
  {
    key: 'lessor',
    label: 'Lessor',
    group: 'Parties',
    kind: 'text',
    hint: 'Landlord / owner',
    synonyms: [
      'lessor',
      'lessor name',
      'landlord',
      'landlord name',
      'property owner',
      'owner',
      'owner name',
      'building owner',
    ],
    avoid: ['broker', 'rep', 'agent', 'contact', 'representative'],
  },
  {
    key: 'sublessor',
    label: 'Sublessor',
    group: 'Parties',
    kind: 'text',
    hint: 'The party subletting the space out, on a sublease',
    synonyms: ['sublessor', 'sublessor name', 'sublandlord', 'sub landlord', 'sublease from'],
  },
  {
    key: 'lessee',
    label: 'Lessee',
    group: 'Parties',
    kind: 'text',
    hint: 'Tenant',
    synonyms: ['lessee', 'lessee name', 'tenant', 'tenant name', 'occupier', 'occupant', 'client'],
    avoid: ['broker', 'rep', 'agent', 'contact', 'representative', 'improvement'],
  },
  {
    key: 'lessorBroker',
    label: 'Lessor broker',
    group: 'Parties',
    kind: 'text',
    synonyms: [
      'lessor broker',
      'landlord broker',
      'landlord rep',
      'landlord representative',
      'listing broker',
      'listing agent',
      'lessor agent',
      'lessor rep',
      'owner broker',
      'landlord agent',
    ],
    avoid: ['representative firm', 'brokerage firm'],
  },
  {
    key: 'lessorBrokerFirm',
    label: 'Listing representative',
    group: 'Parties',
    kind: 'text',
    hint: 'The firm representing the lessor, as opposed to the named agents',
    synonyms: [
      'listing representative',
      'lessor representative',
      'landlord representative firm',
      'listing brokerage',
      'listing firm',
      'lessor brokerage',
      'landlord brokerage',
    ],
  },
  {
    key: 'lesseeBroker',
    label: 'Lessee broker',
    group: 'Parties',
    kind: 'text',
    synonyms: [
      'lessee broker',
      'tenant broker',
      'tenant rep',
      'tenant representative',
      'tenant rep broker',
      'lessee agent',
      'lessee rep',
      'occupier broker',
      'tenant agent',
    ],
    avoid: ['representative firm', 'brokerage firm'],
  },
  {
    key: 'lesseeBrokerFirm',
    label: 'Tenant representative',
    group: 'Parties',
    kind: 'text',
    hint: 'The firm representing the tenant, as opposed to the named agents',
    synonyms: [
      'tenant representative',
      'lessee representative',
      'tenant representative firm',
      'tenant brokerage',
      'tenant firm',
      'lessee brokerage',
      'occupier representative',
    ],
  },
  {
    key: 'brokers',
    label: 'Associated brokers',
    group: 'Parties',
    kind: 'text',
    synonyms: [
      'associated brokers',
      'associated broker',
      'brokers',
      'broker',
      'deal team',
      'agents',
      'agent',
      'cbre professionals',
      'cbre broker',
      'brokerage team',
      'professionals',
    ],
  },
  {
    key: 'naicsCode',
    label: 'Tenant NAICS code',
    group: 'Parties',
    kind: 'text',
    hint: 'Industry classification for the tenant',
    synonyms: ['tenant naics code', 'naics code', 'naics', 'tenant naics', 'industry code', 'sic code'],
  },

  // ------------------------------------------------------------------- Notes
  {
    key: 'notes',
    label: 'Notes / comments',
    group: 'Notes',
    kind: 'text',
    synonyms: [
      'notes',
      'comments',
      'comment',
      'remarks',
      'note',
      'deal notes',
      'lease notes',
      'additional notes',
      'description',
      'details',
    ],
  },

  // -------------------------------------------------------------- Reference
  {
    key: 'compId',
    label: 'Comp ID',
    group: 'Reference',
    kind: 'text',
    hint: 'Source system identifier, carried through to the export',
    synonyms: ['comp id', 'comparable id', 'comp number', 'comp no', 'record id', 'deal id', 'transaction id', 'lease id'],
  },
  {
    key: 'confidentiality',
    label: 'Confidentiality',
    group: 'Reference',
    kind: 'text',
    hint: 'Flagged in the popup and the table when a deal is restricted',
    synonyms: ['confidentiality', 'confidential', 'confidentiality flag', 'confidentiality status', 'restricted'],
  },
]

export const FIELD_BY_KEY: Record<FieldKey, FieldDef> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f]),
) as Record<FieldKey, FieldDef>

export const FIELD_GROUPS = [
  'Location',
  'Asset',
  'Dates & term',
  'Deal structure',
  'Space',
  'Economics',
  'Parties',
  'Notes',
  'Reference',
] as const

/** lowercase, punctuation to spaces, collapse whitespace. `Base Rent ($/SF/Yr)` -> `base rent sf yr`. */
export function normalizeHeader(header: string): string {
  return String(header ?? '')
    .toLowerCase()
    .replace(/[‘’“”]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Very common noise words that should not drive a match on their own. */
const NOISE = new Set([
  'the', 'of', 'a', 'in', 'per', 'is', 'and', 'or', 'for', 'to',
  'usd', 'yr', 'year', 'yearly', 'annual', 'annually', 'mo', 'month', 'monthly',
  'psf', 'sf', 'sqft', 'amt', 'amount', 'value', 'no', 'num', 'number', 'id',
])

function tokens(s: string): string[] {
  return s.split(' ').filter(Boolean)
}

function containsPhrase(haystackTokens: string[], phrase: string): boolean {
  const needle = tokens(phrase)
  if (needle.length === 0 || needle.length > haystackTokens.length) return false
  for (let i = 0; i + needle.length <= haystackTokens.length; i++) {
    let ok = true
    for (let j = 0; j < needle.length; j++) {
      if (haystackTokens[i + j] !== needle[j]) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

/**
 * Score how well `header` names `field`. 0 means no match.
 * The ceiling is 1000 for an exact synonym hit on the first synonym.
 */
export function scoreHeader(header: string, field: FieldDef): number {
  const norm = normalizeHeader(header)
  if (!norm) return 0

  const headerTokens = tokens(norm)
  const squashed = norm.replace(/ /g, '')

  // A disqualifying word anywhere in the header rules the field out entirely,
  // unless the header is an exact hit on one of the field's own synonyms.
  const exactIndex = field.synonyms.findIndex(
    (s) => s === norm || s.replace(/ /g, '') === squashed,
  )
  if (exactIndex === -1 && field.avoid) {
    for (const bad of field.avoid) {
      if (norm.includes(bad)) return 0
    }
  }

  if (exactIndex >= 0) {
    // Exact match. Earlier synonyms win over later ones.
    return 1000 - exactIndex * 5
  }

  let best = 0
  field.synonyms.forEach((syn, i) => {
    const synTokens = tokens(syn)
    const rank = i * 4

    // Whole-phrase containment: "starting base rent psf" contains "base rent".
    if (containsPhrase(headerTokens, syn)) {
      // Longer phrases are more meaningful; extra words in the header dilute it.
      const coverage = synTokens.length / headerTokens.length
      const score = 600 + synTokens.length * 25 + coverage * 100 - rank
      best = Math.max(best, score)
      return
    }

    // Squashed containment catches `basrent`-style headers and `Rent(PSF)`.
    const synSquashed = syn.replace(/ /g, '')
    if (synSquashed.length >= 4 && squashed.includes(synSquashed)) {
      const coverage = synSquashed.length / squashed.length
      best = Math.max(best, 420 + coverage * 120 - rank)
      return
    }

    // Token overlap for reordered headers such as "Rent Base Starting".
    const meaningful = synTokens.filter((t) => !NOISE.has(t))
    if (meaningful.length >= 2) {
      const hits = meaningful.filter((t) => headerTokens.includes(t)).length
      if (hits === meaningful.length) {
        best = Math.max(best, 380 + hits * 20 - rank)
      }
    }
  })

  return Math.max(0, Math.round(best))
}

const MIN_SCORE = 340

/**
 * Assign headers to fields with a greedy best-first pass over every
 * (field, header) pair, so a header only lands on its strongest field.
 */
export function autoMapColumns(headers: string[]): ColumnMap {
  type Candidate = { field: FieldKey; header: string; score: number }
  const candidates: Candidate[] = []

  for (const field of FIELDS) {
    for (const header of headers) {
      const score = scoreHeader(header, field)
      if (score >= MIN_SCORE) candidates.push({ field: field.key, header, score })
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.header.localeCompare(b.header))

  const map: ColumnMap = {}
  const usedHeaders = new Set<string>()

  for (const c of candidates) {
    if (map[c.field] !== undefined) continue
    if (usedHeaders.has(c.header)) continue
    map[c.field] = c.header
    usedHeaders.add(c.header)
  }

  return map
}

/** Fields that must be present for the app to do anything useful. */
export function missingRequiredFields(map: ColumnMap): FieldDef[] {
  return FIELDS.filter((f) => f.required && !map[f.key])
}
