import { pathToFileURL } from 'node:url'
import { NEWS_STATE_CANDIDATES, NEWS_STATE_POLICY } from '../src/lib/newsStatePolicy.js'
import { evaluateNewsStoryState, newsSourceReports } from '../src/lib/newsStoryState.js'
import { NEWS_CALIBRATION_CORPUS } from '../tests/fixtures/newsStateCalibrationCorpus.mjs'
export function runNewsStateCalibration() {
  const candidates = NEWS_STATE_CANDIDATES.map(policy => {
    const cases = NEWS_CALIBRATION_CORPUS.map(item => {
      const report = item.context.story.members[0].admission_kind === 'source_report'
      const result = report ? newsSourceReports(item.context, item.now, policy)[0]?.label : evaluateNewsStoryState(item.context, item.now, policy).state
      return { id: item.id, split: item.split, risk: item.risk, result, allowed: item.allowed, passes: item.allowed.includes(result) }
    })
    const errors = split => cases.filter(item => item.split === split && !item.passes).length
    return { policy, calibration_errors: errors('calibration'), holdout_errors: errors('holdout'), cases }
  })
  return { contract: 'mip-news-state-synthetic-calibration-v1', date: '2026-10-02', selected_policy: NEWS_STATE_POLICY.version,
    scope: 'synthetic risk constraints only; no production corpus or observed accuracy claim',
    selection_rule: 'Retain the simplest candidate satisfying every predeclared calibration risk constraint; evaluate untouched holdout and adversarial regressions separately. No label-volume target or learned model.',
    thresholds_approved_for_live_use: false, candidates }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) console.log(JSON.stringify(runNewsStateCalibration(), null, 2))
