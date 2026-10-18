"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import {
  accountSourceKey,
  feedLabel,
  feedSourceKey,
  type AppSettings,
  type Category,
  type PublicAccount,
} from "@/lib/types";

const DEFAULT_MINUTES = 10;
const MIN_MINUTES = 1;
const MAX_MINUTES = 60;
const MAX_TOTAL_MINUTES = 24 * 60;

type SourcesPayload = {
  providers: {
    id: string;
    label: string;
    missing: string[];
    accounts: PublicAccount[];
  }[];
  categories: Category[];
  settings: AppSettings;
};

type SourceOption = {
  key: string;
  label: string;
  // A platform that can be connected but has no account yet. It counts toward
  // the total, but has no source key to cap, so no per-source limit is saved.
  unlinked?: boolean;
};

function toOptions(payload: SourcesPayload): SourceOption[] {
  const options: SourceOption[] = [];
  for (const provider of payload.providers) {
    for (const account of provider.accounts) {
      options.push({
        key: accountSourceKey(account.id),
        label: `${provider.label} · ${account.displayName || account.handle}`,
      });
    }
    if (provider.accounts.length === 0 && provider.missing.length === 0) {
      options.push({
        key: `provider:${provider.id}`,
        label: `${provider.label} (not connected)`,
        unlinked: true,
      });
    }
  }
  for (const category of payload.categories) {
    // One option per feed, labelled by the feed itself (for example
    // "Hacker News: Front Page"), matching the analytics chart.
    for (const feed of category.feeds) {
      options.push({
        key: feedSourceKey(feed.id),
        label: feedLabel(feed),
      });
    }
  }
  return options;
}

// `refreshKey` changes when the feed finishes loading, which is when feed names
// get remembered; the card then re-reads the labels without resetting sliders.
export function SessionSetupCard({ refreshKey }: { refreshKey?: unknown }) {
  const { beginSession } = useSession();
  const [options, setOptions] = useState<SourceOption[] | null>(null);
  const [minutes, setMinutes] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/sources");
        if (!response.ok) throw new Error("Sources could not be loaded");
        const payload = (await response.json()) as SourcesPayload;
        if (cancelled) return;
        const found = toOptions(payload);
        const initial: Record<string, number> = {};
        for (const option of found) {
          initial[option.key] =
            payload.settings.sourceLimits[option.key] ?? DEFAULT_MINUTES;
        }
        setMinutes((current) => ({ ...initial, ...current }));
        setOptions(found);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Sources could not be loaded");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const total = (options ?? []).reduce(
    (sum, option) => sum + (minutes[option.key] ?? 0),
    0,
  );
  const overLimit = total > MAX_TOTAL_MINUTES;

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (!options || options.length === 0 || overLimit) return;
    setStarting(true);
    setError("");
    try {
      await beginSession({
        sessionLimitMinutes: total,
        sourceLimits: options
          .filter((option) => !option.unlinked)
          .map((option) => ({
            sourceKey: option.key,
            limitMinutes: minutes[option.key] ?? DEFAULT_MINUTES,
          })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The session could not be started");
      setStarting(false);
    }
  }

  return (
    <section className="pause">
      <h2>Plan your session</h2>
      <p>Choose how many minutes each source gets. Your total becomes the session length.</p>
      {error ? <p className="banner error">{error}</p> : null}
      {options && options.length === 0 ? (
        <>
          <p>Connect a social account or add a feed to plan a session.</p>
          <Link className="button" href="/sources">
            Add a source
          </Link>
        </>
      ) : (
        <form className="session-plan" onSubmit={(event) => void start(event)}>
          {(options ?? []).map((option) => {
            const value = minutes[option.key] ?? DEFAULT_MINUTES;
            return (
              <label key={option.key} className="session-plan-row">
                <span className="session-plan-label">{option.label}</span>
                <input
                  type="range"
                  min={MIN_MINUTES}
                  max={Math.max(MAX_MINUTES, value)}
                  step={1}
                  value={value}
                  onChange={(event) =>
                    setMinutes((current) => ({
                      ...current,
                      [option.key]: Number(event.target.value),
                    }))
                  }
                />
                <output className="session-plan-value">{value} min</output>
              </label>
            );
          })}
          <p className="session-plan-total" aria-live="polite">
            Total: <strong>{total} min</strong>
            {overLimit ? ` (the most you can plan is ${MAX_TOTAL_MINUTES} min)` : ""}
          </p>
          <button
            type="submit"
            className="button"
            disabled={!options || starting || overLimit}
          >
            Start session
          </button>
        </form>
      )}
    </section>
  );
}
