export const DEFAULT_DETER_RAMP_MS = 20 * 60 * 1000;

export function grayscaleAmount(
  elapsedMs: number,
  sessionLimitMinutes: number | null,
  enabled: boolean,
): number {
  if (!enabled) return 0;
  const rampMs =
    sessionLimitMinutes != null && sessionLimitMinutes > 0
      ? sessionLimitMinutes * 60 * 1000
      : DEFAULT_DETER_RAMP_MS;
  if (rampMs <= 0) return 0;
  const progress = Math.max(0, elapsedMs) / rampMs;
  return Math.min(1, progress);
}
