import "server-only";
const counts: Record<string, number> = Object.create(null);
const durations: number[] = [];
export function recordCraftingMetric(
  event: string,
  operation: string,
  durationMs?: number,
) {
  const key = operation + ":" + event;
  counts[key] = (counts[key] ?? 0) + 1;
  if (durationMs !== undefined) {
    durations.push(durationMs);
    if (durations.length > 2000) durations.splice(0, 500);
  }
  if (process.env.REALTIME_DIAGNOSTICS === "1")
    console.info(JSON.stringify({ scope: "rpg-commerce", operation, event }));
}
export function craftingMetrics() {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    counts: { ...counts },
    durationP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
  };
}
