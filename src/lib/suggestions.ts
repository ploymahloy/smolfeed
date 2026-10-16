export type UsageSlice = {
  sourceKey: string;
  label: string;
  minutes: number;
};

export type Suggestion = {
  id: string;
  title: string;
  detail: string;
};

export type SuggestionInput = {
  week: UsageSlice[];
  sessionLimitMinutes: number | null;
  sourceLimitMinutes: Record<string, number>;
  sessionPeaksMinutes: number[];
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

export function suggestions(input: SuggestionInput): Suggestion[] {
  const notes: Suggestion[] = [];
  const sessionLimited =
    input.sessionLimitMinutes != null && input.sessionLimitMinutes > 0;
  const sourceLimited = Object.values(input.sourceLimitMinutes).some(
    (minutes) => minutes > 0,
  );

  if (!sessionLimited && !sourceLimited) {
    notes.push({
      id: "no-limits",
      title: "Set a starting limit",
      detail:
        "A 20 minute session cap, and a 10 minute cap on the source you open most, gives the clock something to enforce.",
    });
  }

  const totals = new Map<string, UsageSlice>();
  for (const slice of input.week) {
    const current = totals.get(slice.sourceKey);
    if (current) {
      current.minutes += slice.minutes;
      if (slice.label) current.label = slice.label;
    } else {
      totals.set(slice.sourceKey, { ...slice });
    }
  }

  const ranked = [...totals.values()].sort(
    (left, right) => right.minutes - left.minutes,
  );
  const totalMinutes = ranked.reduce((sum, slice) => sum + slice.minutes, 0);
  const heaviest = ranked[0];
  if (heaviest && totalMinutes > 0 && heaviest.minutes / totalMinutes > 0.4) {
    const others = ranked.slice(1).map((slice) => slice.minutes);
    const middle = median(others);
    const suggested = Math.max(
      5,
      Math.round(middle > 0 ? middle : heaviest.minutes / 2),
    );
    const share = Math.round((heaviest.minutes / totalMinutes) * 100);
    notes.push({
      id: "heavy-source",
      title: `${heaviest.label} fills the week`,
      detail: `${heaviest.label} accounts for ${share}% of this week's screen time. A ${suggested} minute cap would pull it toward the rest of the feed.`,
    });
  }

  if (sessionLimited && input.sessionLimitMinutes) {
    const limit = input.sessionLimitMinutes;
    const near = input.sessionPeaksMinutes.filter(
      (minutes) => minutes >= limit * 0.9,
    );
    if (near.length > 0) {
      const shorter = Math.max(5, Math.round(limit * 0.75));
      const earlier =
        shorter < limit ? ` A ${shorter} minute session stops earlier.` : "";
      notes.push({
        id: "near-cap",
        title: "Sessions reach the cap",
        detail: `${near.length} session${near.length === 1 ? "" : "s"} this week reached 90% of the ${limit} minute limit.${earlier}`,
      });
    }
  }

  return notes;
}
