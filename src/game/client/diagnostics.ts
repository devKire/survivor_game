/** Opt in with sessionStorage['limiar.diagnostics'] = '1'. No production logs. */
export const diagnostics = {
  remoteGameInstances: 0, remoteGameCreated: 0, rafLoops: 0,
  reactGameMounts: 0, accountRenders: 0, canvasResizes: 0,
  snapshots: 0, fullSnapshots: 0, resyncRequests: 0, duplicateSnapshots: 0,
  inputs: 0, payloadBytes: 0, corrections: 0, rtt: 0, entities: 0,
  longTasks: 0, longTaskMs: 0,
  frames: [] as number[],
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
  if (!diagnostics.enabled || ms <= 0) return;
  diagnostics.frames.push(ms);
  if (diagnostics.frames.length > 36000) diagnostics.frames.splice(0, 6000);
}
