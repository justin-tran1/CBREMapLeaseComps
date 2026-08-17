import { fmtArea, fmtDate, fmtMonths, fmtRent, fmtText, EMPTY } from '../lib/format'
import { dealLabel, fullAddress, resolveBrokers, resolveEscalation } from '../lib/normalize'
import { IconChevronLeft, IconChevronRight } from './Icons'
import type { LeaseDeal, Site } from '../types'

interface RowProps {
  label: string
  value: string
}

function Row({ label, value }: RowProps) {
  const empty = value === EMPTY || value.trim() === ''
  return (
    <>
      <div className="pop__key">{label}</div>
      <div className={`pop__val${empty ? ' pop__val--muted' : ''}`}>{empty ? EMPTY : value}</div>
    </>
  )
}

function freeRentText(deal: LeaseDeal): string {
  if (deal.freeRent === null) return EMPTY
  if (deal.freeRent === 0) return 'None'
  const rounded = Math.round(deal.freeRent * 10) / 10
  return `${rounded} ${rounded === 1 ? 'month' : 'months'}`
}

/** Anything other than a plain "no" is worth flagging on a comp. */
function confidentialLabel(deal: LeaseDeal | undefined): string {
  const raw = (deal?.confidentiality ?? '').trim()
  if (!raw) return ''
  if (/^(no|none|n|false|public|not confidential|0)$/i.test(raw)) return ''
  return /^(yes|y|true|1|confidential)$/i.test(raw) ? 'Confidential' : raw
}

/** Free-text columns that only some exports carry, kept out of the fixed field order. */
function noteBlocks(deal: LeaseDeal): Array<{ label: string; text: string }> {
  return [
    { label: '', text: deal.notes },
    { label: 'TI notes', text: deal.tiNotes },
    { label: 'Other concessions', text: deal.otherConcessions },
  ].filter((block) => block.text.trim() !== '')
}

function tiText(deal: LeaseDeal): string {
  if (deal.tiAllowance === null) return EMPTY
  if (deal.tiAllowance === 0) return 'None'
  // A TI allowance is quoted per square foot unless it is clearly a lump sum.
  const perSf = deal.tiAllowance < 400
  return perSf ? `${fmtRent(deal.tiAllowance, 'annual')}`.replace('/SF/Yr', '/SF') : fmtRent(deal.tiAllowance, '')
}

/** The detail card for one deal, in the field order the desk asked for. */
function DealDetail({ deal }: { deal: LeaseDeal }) {
  const brokers = resolveBrokers(deal)

  return (
    <>
      <div className="pop__fields">
        <Row label="Lease date" value={fmtDate(deal.leaseDate)} />
        <Row label="Term length" value={fmtMonths(deal.termMonths)} />
        <Row label="Execution date" value={fmtDate(deal.executionDate)} />
        <Row label="Lease type" value={fmtText(deal.leaseType)} />
        <Row label="Property subtype" value={fmtText(deal.propertySubtype)} />
        <Row label="Rate type" value={fmtText(deal.rateType)} />
        <Row label="Area leased" value={fmtArea(deal.areaLeased)} />
        <Row label="Floor" value={fmtText(deal.floor)} />
        <Row label="Suite" value={fmtText(deal.suite)} />
        <Row label="Base rent" value={fmtRent(deal.baseRent, deal.rateType)} />
        <Row label="OpEx" value={fmtRent(deal.opex, deal.rateType)} />
        <Row label="Escalation" value={fmtText(resolveEscalation(deal))} />
        <Row label="Free rent" value={freeRentText(deal)} />
        <Row label="TI allowance" value={tiText(deal)} />
        {deal.tiAsIs.trim() && <Row label="TIs as-is" value={fmtText(deal.tiAsIs)} />}

        <div className="pop__section">Parties</div>
        <Row label="Lessor" value={fmtText(deal.lessor)} />
        {deal.sublessor.trim() && <Row label="Sublessor" value={fmtText(deal.sublessor)} />}
        <Row label="Lessee" value={fmtText(deal.lessee)} />
        <Row label="Brokers" value={fmtText(brokers)} />
      </div>

      {noteBlocks(deal).length > 0 && (
        <>
          <div className="pop__section" style={{ borderTop: '1px solid var(--border-hairline)' }}>
            Notes
          </div>
          {noteBlocks(deal).map((block) => (
            <div className="pop__notes" key={block.label}>
              {block.label && <span className="pop__notelabel">{block.label}</span>}
              {block.text}
            </div>
          ))}
        </>
      )}
    </>
  )
}

interface PropertyPopupProps {
  site: Site
  /** The chosen deal, or null to show the picker when the address holds several. */
  deal: LeaseDeal | null
  onSelectDeal: (dealId: string | null) => void
}

export function PropertyPopup({ site, deal, onSelectDeal }: PropertyPopupProps) {
  const multiple = site.deals.length > 1
  const index = deal ? site.deals.findIndex((d) => d.id === deal.id) : -1

  const address = fullAddress(site.deals[0] ?? { address: site.address, city: site.city, state: site.state, zip: site.zip })

  return (
    <div className="pop">
      <div className="pop__header">
        <div className="pop__eyebrow">
          {multiple
            ? `${site.deals.length} deals at this address`
            : site.deals[0]?.propertySubtype || site.deals[0]?.propertyType || 'Lease comp'}
        </div>
        {confidentialLabel(deal ?? site.deals[0]) && (
          <div className="pop__flag">{confidentialLabel(deal ?? site.deals[0])}</div>
        )}
        <div className="pop__title">{site.label}</div>
        {address && <div className="pop__address">{address}</div>}
      </div>

      <div className="pop__body">
        {!deal && multiple && (
          <div className="pop__picker">
            {site.deals.map((option) => (
              <button
                key={option.id}
                type="button"
                className="pop__pickitem"
                onClick={() => onSelectDeal(option.id)}
              >
                <div className="pop__pickmain">
                  <div className="pop__pickname">{dealLabel(option)}</div>
                  <div className="pop__pickmeta">
                    {[
                      fmtDate(option.leaseDate),
                      fmtArea(option.areaLeased),
                      fmtRent(option.baseRent, option.rateType),
                    ]
                      .filter((v) => v !== EMPTY)
                      .join(' · ') || `Row ${option.sourceRow}`}
                  </div>
                </div>
                <IconChevronRight size={14} className="muted" />
              </button>
            ))}
          </div>
        )}

        {deal && (
          <>
            {multiple && (
              <button type="button" className="pop__back" onClick={() => onSelectDeal(null)}>
                <IconChevronLeft size={12} />
                All {site.deals.length} deals at this address
              </button>
            )}
            <DealDetail deal={deal} />
          </>
        )}
      </div>

      <div className="pop__footer">
        <span>
          {deal
            ? [
                multiple ? `Deal ${index + 1} of ${site.deals.length}` : '',
                deal.compId.trim() ? `Comp ${deal.compId.trim()}` : `Row ${deal.sourceRow}`,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'Choose a deal to see its terms'}
        </span>

        {deal && multiple && (
          <span className="pop__nav">
            <button
              type="button"
              className="pop__navbtn"
              disabled={index <= 0}
              onClick={() => onSelectDeal(site.deals[index - 1]?.id ?? null)}
              aria-label="Previous deal at this address"
            >
              <IconChevronLeft size={13} />
            </button>
            <button
              type="button"
              className="pop__navbtn"
              disabled={index < 0 || index >= site.deals.length - 1}
              onClick={() => onSelectDeal(site.deals[index + 1]?.id ?? null)}
              aria-label="Next deal at this address"
            >
              <IconChevronRight size={13} />
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
