import { useEffect, useRef, useState } from 'react'
import {
  ArrowSquareOut,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  Clock,
  Columns,
  GitFork,
  Globe,
  Info,
  List,
  MagnifyingGlass,
  MapPin,
  Newspaper,
  Path,
  ShieldCheck,
  Sidebar,
  User,
  X,
} from '@phosphor-icons/react'
import {
  MISSING_EVIDENCE_GUIDANCE,
  WORKSPACE_TAB_VIEWS,
  handleWorkspaceDrawerKeyDown,
  restoreWorkspaceDrawerFocus,
} from '../lib/workspacePresentation'
import { investigationContextDomProps } from '../lib/investigationContext'
import '../styles/workspace.css'

const NAV_ICONS = {
  news: Newspaper,
  graph: GitFork,
  timeline: Clock,
  arcs: Path,
  world: Globe,
  compare: Columns,
  phase3: ShieldCheck,
  more: Sidebar,
}

function NavIcon({ viewKey, size = 18 }) {
  const Icon = NAV_ICONS[viewKey] ?? GitFork
  return <Icon size={size} weight="regular" />
}

function MobiusMark() {
  return (
    <img
      className="ws-mobius"
      src={`${import.meta.env.BASE_URL}assets/mip-mobius-logo.png`}
      width="33"
      height="33"
      alt=""
      aria-hidden="true"
    />
  )
}

function BrandWordmark() {
  return (
    <span className="ws-brand-wordmark">
      <span className="ws-brand-mip">MIP</span>
      <span className="ws-brand-name">Media Intelligence Platform</span>
    </span>
  )
}

function EvidenceDimensionGrid({ dimensions, compact = false }) {
  return (
    <div
      className={`workspace-evidence-strip ws-dimensions${compact ? ' ws-dimensions-compact' : ''}`}
      aria-label="Evidence dimensions"
    >
      {(dimensions ?? []).map((dim) => (
        <div key={dim.key} className={`ws-dimension ws-dimension-${dim.tone ?? 'unavailable'}`}>
          <span className="ws-dimension-label">{dim.label}</span>
          <span className="ws-dimension-value">{dim.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function InvestigationWorkspace({
  view,
  onChangeView,
  investigationContext,
  header,
  nodeDimensions,
  selectedChild = null,
  leftNav,
  searchSlot,
  corpusLine,
  accountSlot,
  infoSlot,
  inspectorOccupied = false,
  hasNativeInspector = false,
  onChangeInvestigation,
  details,
  children,
}) {
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const drawerRef = useRef(null)
  const drawerBtnRef = useRef(null)
  const drawerPrimed = useRef(false)

  const closeDrawer = () => setDrawerOpen(false)

  useEffect(() => {
    if (drawerOpen) {
      drawerPrimed.current = true
      const first = drawerRef.current?.querySelector?.('button, [href], input')
      first?.focus?.()
      return
    }
    if (drawerPrimed.current) {
      drawerPrimed.current = false
      restoreWorkspaceDrawerFocus(drawerBtnRef.current)
    }
  }, [drawerOpen])

  const ic = investigationContext
  const hasSubject = Boolean(ic?.canonical_subject_id)

  return (
    <div
      className={`workspace-app ws-shell${navCollapsed ? ' nav-collapsed ws-nav-collapsed' : ''}`}
      data-workspace="investigation"
    >
      <aside className="ws-nav" aria-label="Investigation views">
        <div className="ws-nav-brand">
          <MobiusMark />
          {!navCollapsed && <BrandWordmark />}
        </div>
        <div className="ws-nav-links">{leftNav}</div>
        <div className="ws-nav-active">
          {!navCollapsed && (
            <>
              <p className="ws-nav-kicker">Active investigation</p>
              <p className="ws-nav-subject">{header?.title}</p>
              <p className="ws-nav-note">Your subject stays with you across views.</p>
              <button type="button" className="ws-change-btn" onClick={onChangeInvestigation}>
                Change investigation
                <ArrowSquareOut size={14} />
              </button>
            </>
          )}
          <button
            type="button"
            className="ws-collapse-btn"
            aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={() => setNavCollapsed((v) => !v)}
          >
            {navCollapsed ? <CaretRight size={14} /> : <CaretLeft size={14} />}
            {!navCollapsed && <span>Follow the evidence.</span>}
          </button>
        </div>
      </aside>

      <header className="ws-topbar">
        <button
          type="button"
          className="ws-menu-btn"
          ref={drawerBtnRef}
          aria-label="Open investigation navigation"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <List size={20} />
        </button>
        <div className="ws-search-wrap">
          {searchSlot}
        </div>
        <div className="ws-top-meta">
          {corpusLine ? <span className="ws-corpus">{corpusLine}</span> : null}
          {accountSlot}
          {infoSlot}
        </div>
      </header>

      {drawerOpen && (
        <div className="ws-drawer-backdrop" onClick={closeDrawer}>
          <div
            ref={drawerRef}
            className="ws-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Investigation navigation"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) =>
              handleWorkspaceDrawerKeyDown(e, { dialogEl: drawerRef.current, onDismiss: closeDrawer })
            }
          >
            <div className="ws-drawer-head">
              <MobiusMark />
              <button type="button" className="ws-icon-btn" aria-label="Close navigation" onClick={closeDrawer}>
                <X size={18} />
              </button>
            </div>
            <div className="ws-drawer-nav" onClick={closeDrawer}>
              {leftNav}
            </div>
          </div>
        </div>
      )}

      <div className="ws-workspace-head">
        <section
          className="ws-canonical"
          aria-label="Investigation workspace"
          {...investigationContextDomProps(ic)}
        >
          <div className="ws-canonical-head">
            <div>
              <p className="ws-eyebrow">{header?.eyebrow ?? 'Investigation workspace'}</p>
              <h1 className="ws-title">{header?.title}</h1>
              <p className="ws-meta-row">
                <span>
                  <MapPin size={14} /> {header?.location}
                </span>
                <span>
                  <CalendarBlank size={14} /> {header?.when}
                </span>
              </p>
              {header?.description && <p className="ws-description">{header.description}</p>}
            </div>
            <button type="button" className="ws-change-btn" onClick={onChangeInvestigation}>
              Change investigation
              <ArrowSquareOut size={14} />
            </button>
          </div>
          <EvidenceDimensionGrid dimensions={header?.dimensions} />
        </section>

        <div className="ws-tabs" role="tablist" aria-label="Evidence views">
          {WORKSPACE_TAB_VIEWS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={view === tab.key}
              className={`ws-tab${view === tab.key ? ' active' : ''}`}
              onClick={() => onChangeView(tab.key)}
            >
              <NavIcon viewKey={tab.key} size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`workspace-body ws-body${hasNativeInspector ? ' has-native-inspector' : ''}`}>
        <div className="ws-content">{children}</div>
        {!inspectorOccupied && !hasNativeInspector && (
          <aside className={`ws-inspector${inspectorOpen ? '' : ' collapsed'}`} aria-label="Investigation inspector">
            <button
              type="button"
              className="ws-inspector-toggle"
              aria-expanded={inspectorOpen}
              onClick={() => setInspectorOpen((v) => !v)}
            >
              Investigation inspector
              <CaretDown size={14} />
            </button>
            {inspectorOpen && (
              <div className="ws-inspector-body">
                <h2>{header?.title}</h2>
                <p className="ws-nav-note">The same investigation, in every view.</p>
                {selectedChild?.label && (
                  <p className="ws-child-note">
                    Selected record: {selectedChild.label}. The canonical subject header is unchanged.
                  </p>
                )}
                <section>
                  <h3>Recorded context</h3>
                  <dl className="ws-inspector-dl">
                    <div>
                      <dt>Subject type</dt>
                      <dd>{ic?.canonical_subject_type ?? 'not recorded'}</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{header?.location}</dd>
                    </div>
                    <div>
                      <dt>As of</dt>
                      <dd>{header?.when}</dd>
                    </div>
                  </dl>
                </section>
                {nodeDimensions && (
                  <section>
                    <h3>Node evidence state</h3>
                    <EvidenceDimensionGrid dimensions={nodeDimensions} compact />
                  </section>
                )}
                <section>
                  <h3>Reading the evidence</h3>
                  <p>
                    {hasSubject
                      ? 'Select a record to inspect sources, relationships, support, uncertainty, and review status. Those axes stay separate.'
                      : 'No canonical subject. Absence is explicit — no event is invented.'}
                  </p>
                  <p className="ws-guidance">
                    <ShieldCheck size={16} />
                    {MISSING_EVIDENCE_GUIDANCE}
                  </p>
                </section>
                <details className="ws-provenance">
                  <summary>Provenance identifiers &amp; history</summary>
                  <dl className="ws-inspector-dl">
                    <div>
                      <dt>canonical_subject_id</dt>
                      <dd className="ws-provenance-id">{ic?.canonical_subject_id ?? 'not recorded'}</dd>
                    </div>
                    <div>
                      <dt>canonical_subject_type</dt>
                      <dd>{ic?.canonical_subject_type ?? 'not recorded'}</dd>
                    </div>
                  </dl>
                </details>
              </div>
            )}
          </aside>
        )}
      </div>
      {details}
    </div>
  )
}

export function WorkspaceNavButton({
  item,
  active,
  collapsed = false,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`ws-nav-btn${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <NavIcon viewKey={item.key} />
      <span className="ws-nav-label">{item.label}</span>
    </button>
  )
}

export function WorkspaceSearch({
  exploreBtnRef,
  exploreOpen,
  onOpenExplore,
  dialogId,
}) {
  return (
    <div className="ws-search">
      <MagnifyingGlass size={16} />
      <input
        type="search"
        placeholder="Search events, claims, sources, places..."
        aria-label="Search events, claims, sources, places..."
        readOnly
        onFocus={onOpenExplore}
        onClick={onOpenExplore}
      />
      <button
        type="button"
        ref={exploreBtnRef}
        className="ws-explore-btn"
        aria-label="Explore / Change Topic"
        aria-haspopup="dialog"
        aria-expanded={exploreOpen}
        aria-controls={dialogId}
        data-explore-trigger="true"
        onClick={onOpenExplore}
      >
        Explore
      </button>
    </div>
  )
}

export function WorkspaceAccountButton({ onClick, enabled }) {
  return (
    <button type="button" className="ws-account-btn" aria-label="Account" onClick={onClick} disabled={!enabled && !onClick}>
      <User size={16} />
      Account
    </button>
  )
}

export function WorkspaceInfoButton({ onClick }) {
  return (
    <button type="button" className="ws-icon-btn" aria-label="About this app" onClick={onClick}>
      <Info size={16} />
    </button>
  )
}
