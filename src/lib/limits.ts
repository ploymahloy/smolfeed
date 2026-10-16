export function isSessionCapped(
  elapsedMs: number,
  limitMinutes: number | null,
): boolean {
  if (limitMinutes == null || limitMinutes <= 0) return false;
  return elapsedMs >= limitMinutes * 60 * 1000;
}

export function cappedSourceKeys(
  elapsedBySourceMs: Record<string, number>,
  limitMinutesBySource: Record<string, number>,
): string[] {
  const capped: string[] = [];
  for (const [sourceKey, limitMinutes] of Object.entries(limitMinutesBySource)) {
    if (limitMinutes <= 0) continue;
    const elapsed = elapsedBySourceMs[sourceKey] ?? 0;
    if (elapsed >= limitMinutes * 60 * 1000) capped.push(sourceKey);
  }
  return capped;
}

export function formatSessionClock(
  elapsedMs: number,
  limitMinutes: number | null,
): string {
  const minutes = Math.floor(Math.max(0, elapsedMs) / 60_000);
  if (limitMinutes == null || limitMinutes <= 0) return `${minutes} min`;
  return `${minutes} / ${limitMinutes} min`;
}

export function parseLimitMinutes(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24 * 60) return null;
  return parsed;
}
