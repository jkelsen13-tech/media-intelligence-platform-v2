import { useRef, useEffect, useState } from 'react'
import {
  FIDELITY_CATEGORIES, FIDELITY_EFFECTS, FIDELITY_PRESETS,
  resolveVisualFidelityProfile, visualFidelityCategoryState,
} from '../lib/worldViewVisualFidelity.js'
import { TERRAIN_RELIEF_LEGEND_TEXT } from '../lib/worldViewMapStack.js'

function CategoryControl({ profile, category, capabilities, onAction }) {
  const [expanded, setExpanded] = useState(category.id === 'terrain')
  const checkbox = useRef(null)
  const state = visualFidelityCategoryState(profile, category.id, capabilities)
  const effective = resolveVisualFidelityProfile(profile, capabilities)
  useEffect(() => { if (checkbox.current) checkbox.current.indeterminate = state.mixed }, [state.mixed])
  const panelId = 'wv-fidelity-' + category.id
  return (
    <section className="wv-fidelity-category">
      <div className="wv-fidelity-row">
        <label>
          <input ref={checkbox} type="checkbox" aria-label={category.label + ' effects'}
            aria-checked={state.mixed ? 'mixed' : profile.enabled && !state.unavailable && profile.categories[category.id].enabled}
            checked={profile.enabled && !state.unavailable && profile.categories[category.id].enabled} disabled={!profile.enabled || state.unavailable}
            onChange={() => onAction({ type: 'category', category: category.id,
              enabled: !profile.categories[category.id].enabled })} />
          {category.label}
        </label>
        <button type="button" aria-expanded={expanded} aria-controls={panelId}
          onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Hide' : 'Show'} {category.label} settings
        </button>
      </div>
      <div id={panelId} hidden={!expanded}>
        {category.leaves.map(leaf => {
          const effect = FIDELITY_EFFECTS[leaf]
          const capability = capabilities?.[leaf]
          const supported = capability?.status === 'supported'
          const active = effective[leaf] === true
          const remembered = profile.categories[category.id][leaf] === true
          const descriptionId = 'wv-fidelity-reason-' + leaf
          return (
            <div key={leaf} className="wv-fidelity-leaf" data-fidelity-effect={leaf}
              data-effect-status={capability?.status ?? 'unavailable'} data-effect-active={active}>
              <label>
                <input type="checkbox" checked={active}
                  disabled={!supported || !profile.enabled || !profile.categories[category.id].enabled}
                  aria-describedby={descriptionId}
                  onChange={event => onAction({ type: 'leaf', category: category.id, leaf, enabled: event.target.checked })} />
                {effect.label}
              </label>
              <span className="wv-fidelity-cost">{effect.cost} estimated cost</span>
              <p id={descriptionId}>
                {!supported ? capability?.reason ?? 'Unavailable on this renderer.'
                  : active ? 'On' : remembered ? 'Off; your On preference is remembered.' : 'Off'}
                {leaf === 'fxaa' ? ' Optional edge smoothing; may soften map labels. Off in Performance, Balanced and Maximum.' : ''}
                {leaf === 'resolutionScale' ? ' Neutral 1.0×; supersampling is deferred.' : ''}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function WorldViewVisualFidelityPanel({ profile, capabilities, onAction }) {
  const [expanded, setExpanded] = useState(false)
  const effective = resolveVisualFidelityProfile(profile, capabilities)
  return (
    <section className="wv-fidelity" aria-label="Visual Fidelity" data-fidelity-version={profile.version}>
      <div className="wv-fidelity-row">
        <label><input type="checkbox" checked={profile.enabled}
          onChange={event => onAction({ type: 'master', enabled: event.target.checked })} />Photoreal</label>
        <span>{[effective.reliefShading && 'Terrain relief on', effective.fxaa && 'FXAA on'].filter(Boolean).join(' · ') || 'No additional effects active'}</span>
        <button type="button" aria-expanded={expanded} aria-controls="wv-fidelity-settings"
          onClick={() => setExpanded(value => !value)}>Visual Fidelity settings</button>
      </div>
      <div id="wv-fidelity-settings" hidden={!expanded}>
        <p>Display-only enhancements. Source detail, evidence and recorded time stay the same.
          Preferences last while this World View is open.</p>
        <label className="wv-fidelity-preset">Preset
          <select aria-label="Visual Fidelity preset" value={profile.preset}
            onChange={event => onAction({ type: 'preset', preset: event.target.value })}>
            {FIDELITY_PRESETS.map(preset => <option key={preset} value={preset}>{preset[0].toUpperCase() + preset.slice(1)}</option>)}
          </select>
        </label>
        <p>Performance adds no effects. Balanced and Maximum currently enable only approved terrain relief.
          FXAA can be selected in Custom when supported. Other enhancements await verification. Cost estimates are relative, not frame-rate measurements.</p>
        {FIDELITY_CATEGORIES.map(category => <CategoryControl key={category.id} category={category}
          profile={profile} capabilities={capabilities} onAction={onAction} />)}
        {effective.reliefShading && <p>{TERRAIN_RELIEF_LEGEND_TEXT}</p>}
      </div>
    </section>
  )
}
