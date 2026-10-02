import { newsContext, EPOCH, HOUR } from './newsStoryFixtures.mjs'
// Synthetic editorial scenarios were specified as risk constraints before the
// candidate comparison. They are neither observed news truth nor corpus fitting.
const scenario = (id, split, specs, nowHour, allowed, risk, options) => ({ id, split,
  context: newsContext(specs, options), now: EPOCH + nowHour * HOUR, allowed, risk })
export const NEWS_CALIBRATION_CORPUS = [
  scenario('rapid-new-event', 'calibration', [{ at: 0 }], 1, ['Breaking'], 'premature_decay'),
  scenario('review-latency-new-event', 'calibration', [{ at: 0, declaredAt: 1.5 }], 1.75, ['Breaking'], 'rapid_update_missed'),
  scenario('single-update-no-long-urgency', 'calibration', [{ at: 0 }], 4, ['UpdatedEstablished'], 'false_persistence'),
  scenario('rapid-continuing-phase', 'calibration', Array.from({ length: 10 }, (_, at) => ({ at })), 9.5, ['Developing'], 'false_persistence'),
  scenario('quiet-unresolved-phase', 'calibration', [{ at: 0, event_state: 'unresolved' }], 80, ['Historical'], 'quiet_unresolved_persistence'),
  scenario('correction-is-a-correction', 'calibration', [{ at: 0 }, { at: 1, kind: 'correction' }], 1.5, ['UpdatedEstablished'], 'correction_urgency'),
  scenario('material-single-update', 'calibration', [{ at: 0, importance: 'material' }], 1, ['UpdatedEstablished'], 'overstatement'),
  scenario('hourly-updates-stop-breaking', 'holdout', Array.from({ length: 15 }, (_, at) => ({ at })), 14.25, ['Developing'], 'false_persistence'),
  scenario('narrow-rapid-update', 'holdout', [{ at: 0 }], 0.75, ['Breaking'], 'rapid_update_missed'),
  scenario('two-updates-following-initial-phase', 'holdout', [{ at: 0 }, { at: 6.5, importance: 'material' }], 10, ['Developing'], 'premature_decay'),
  scenario('quiet-but-unresolved-holdout', 'holdout', [{ at: 0, event_state: 'unresolved' }], 100, ['Historical'], 'quiet_unresolved_persistence'),
  scenario('late-source-report', 'holdout', [{ at: 100, reportAt: 0 }], 101, ['SOURCE REPORT'], 'stale_report_urgency', { report: true }),
  scenario('permitted-new-source-report', 'holdout', [{ at: 0 }], 1.5, ['BREAKING • SOURCE REPORT'], 'rapid_update_missed', { report: true }),
  scenario('source-report-correction', 'holdout', [{ at: 0 }, { at: 1, kind: 'correction' }], 1.5, ['SOURCE REPORT'], 'correction_urgency', { report: true }),
  scenario('new-major-update-after-quiet-phase', 'holdout', [{ at: 0 }, { at: 100 }], 101, ['Breaking'], 'rapid_update_missed'),
]
