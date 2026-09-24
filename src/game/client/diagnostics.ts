/** Opt in with sessionStorage['limiar.diagnostics'] = '1'. No production logs. */
export const diagnostics = {
  remoteGameInstances: 0, remoteGameCreated: 0, rafLoops: 0,
  reactGameMounts: 0, accountRenders: 0, canvasResizes: 0,
  snapshots: 0, fullSnapshots: 0, resyncRequests: 0, duplicateSnapshots: 0,
  inputs: 0, payloadBytes: 0, corrections: 0, rtt: 0, entities: 0,
  backpressureEvents: 0, extrapolations: 0, interpolationDelay: 0,
  entityUpserts: 0, entityRemovals: 0,
  longTasks: 0, longTaskMs: 0,
  frames: [] as number[],
  snapshotIntervals: [] as number[],
  snapshotApply: [] as number[],
  snapshotDecode: [] as number[],
  render: [] as number[],
  rttSamples: [] as number[],
  enabled: false,
};
if (typeof window !== 'undefined') {
  diagnostics.enabled = sessionStorage.getItem('limiar.diagnostics') === '1';
  if (diagnostics.enabled) {
    Object.assign(window, { limiarDiagnostics: diagnostics });
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          diagnostics.longTasks++;
          diagnostics.longTaskMs += entry.duration;
        }
      }).observe({ entryTypes: ['longtask'] });
    }
  }
}
export function recordFrame(ms: number) {
  recordMetric(diagnostics.frames, ms);
}

export function recordMetric(values: number[], value: number) {
  if (!diagnostics.enabled || !Number.isFinite(value) || value < 0) return;
  values.push(value);
  if (values.length > 36000) values.splice(0, 6000);
}
