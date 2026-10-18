"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { cappedSourceKeys, isSessionCapped } from "@/lib/limits";
import type { AppSettings, ProviderId } from "@/lib/types";

const STORAGE_KEY = "smolfeed.session.v1";
const FLUSH_MS = 15_000;
const TICK_MS = 250;

type VisibleSource = {
  key: string;
  label: string;
  provider: string;
};

type PendingSource = {
  label: string;
  provider: string;
  ms: number;
};

type PersistedSession = {
  id: string;
  startedAt: number;
  elapsedMs: number;
  sourceElapsedMs: Record<string, number>;
  paused: boolean;
  started: boolean;
};

export type SessionPlan = {
  sessionLimitMinutes: number;
  sourceLimits: { sourceKey: string; limitMinutes: number }[];
};

type SessionContextValue = {
  ready: boolean;
  started: boolean;
  elapsedMs: number;
  paused: boolean;
  // True while the reader is on any page other than the feed. The clock holds
  // its value there and does not count time.
  awayFromFeed: boolean;
  // True while the feed shows its skeleton loader or refresh spinner. The
  // clock holds its value until the posts are on screen.
  feedLoading: boolean;
  setFeedLoading: (loading: boolean) => void;
  settings: AppSettings;
  cappedKeys: string[];
  applySettings: (settings: AppSettings) => void;
  beginSession: (plan: SessionPlan) => Promise<void>;
  startNewSession: () => Promise<void>;
};

const EMPTY_SETTINGS: AppSettings = {
  sessionLimitMinutes: null,
  sourceLimits: {},
};

const SessionContext = createContext<SessionContextValue | null>(null);

function freshSession(): PersistedSession {
  return {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    elapsedMs: 0,
    sourceElapsedMs: {},
    paused: false,
    started: false,
  };
}

function readStored(): PersistedSession {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return freshSession();
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    if (!parsed.id || typeof parsed.elapsedMs !== "number") return freshSession();
    return {
      id: parsed.id,
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : Date.now(),
      elapsedMs: Math.max(0, parsed.elapsedMs),
      sourceElapsedMs: parsed.sourceElapsedMs ?? {},
      paused: Boolean(parsed.paused),
      // Sessions stored before `started` existed were already running.
      started:
        typeof parsed.started === "boolean"
          ? parsed.started
          : parsed.elapsedMs > 0 || Boolean(parsed.paused),
    };
  } catch {
    return freshSession();
  }
}

function readVisible(): VisibleSource[] {
  const found = new Map<string, VisibleSource>();
  const nodes = document.querySelectorAll<HTMLElement>("[data-source-key]");
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.height <= 0) continue;
    const visibleHeight =
      Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    if (visibleHeight < Math.min(rect.height, window.innerHeight) * 0.35) continue;
    const key = node.dataset.sourceKey;
    if (!key || found.has(key)) continue;
    found.set(key, {
      key,
      label: node.dataset.sourceLabel || key,
      provider: node.dataset.provider || "rss",
    });
  }
  return [...found.values()];
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const awayFromFeed = pathname !== "/";
  const awayRef = useRef(awayFromFeed);
  awayRef.current = awayFromFeed;
  const [feedLoading, setFeedLoadingState] = useState(false);
  const loadingRef = useRef(false);
  const setFeedLoading = useCallback((loading: boolean) => {
    loadingRef.current = loading;
    setFeedLoadingState(loading);
  }, []);
  const [ready, setReady] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sourceElapsedMs, setSourceElapsedMs] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const idRef = useRef("");
  const startedRef = useRef(0);
  const hasStartedRef = useRef(false);
  const elapsedRef = useRef(0);
  const sourceRef = useRef<Record<string, number>>({});
  const pausedRef = useRef(false);
  const settingsRef = useRef(settings);
  const pendingRef = useRef<Record<string, PendingSource>>({});
  const sinceFlushRef = useRef(0);
  const lastFlushedElapsed = useRef(-1);
  const flushingRef = useRef(false);

  const persist = useCallback(() => {
    const payload: PersistedSession = {
      id: idRef.current,
      startedAt: startedRef.current,
      elapsedMs: elapsedRef.current,
      sourceElapsedMs: sourceRef.current,
      paused: pausedRef.current,
      started: hasStartedRef.current,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, []);

  const applyStored = useCallback((session: PersistedSession) => {
    idRef.current = session.id;
    startedRef.current = session.startedAt;
    elapsedRef.current = session.elapsedMs;
    sourceRef.current = session.sourceElapsedMs;
    pausedRef.current = session.paused;
    hasStartedRef.current = session.started;
    setElapsedMs(session.elapsedMs);
    setSourceElapsedMs(session.sourceElapsedMs);
    setPaused(session.paused);
    setStarted(session.started);
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current || !idRef.current || !hasStartedRef.current) return;
    const taken: {
      sourceKey: string;
      sourceLabel: string;
      provider: ProviderId;
      seconds: number;
      ms: number;
    }[] = [];
    for (const [sourceKey, source] of Object.entries(pendingRef.current)) {
      const seconds = Math.floor(source.ms / 1000);
      if (seconds < 1) continue;
      const ms = seconds * 1000;
      source.ms -= ms;
      taken.push({
        sourceKey,
        sourceLabel: source.label,
        provider: source.provider as ProviderId,
        seconds,
        ms,
      });
    }
    const elapsedSeconds = Math.floor(elapsedRef.current / 1000);
    if (taken.length === 0 && elapsedSeconds === lastFlushedElapsed.current) return;
    flushingRef.current = true;
    try {
      const response = await fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          sessionId: idRef.current,
          startedAt: startedRef.current,
          elapsedSeconds,
          paused: pausedRef.current,
          samples: taken.map(({ sourceKey, sourceLabel, provider, seconds }) => ({
            sourceKey,
            sourceLabel,
            provider,
            seconds,
          })),
        }),
      });
      if (!response.ok) throw new Error("Usage was not recorded");
      lastFlushedElapsed.current = elapsedSeconds;
      sinceFlushRef.current = 0;
    } catch {
      for (const sample of taken) {
        const current = pendingRef.current[sample.sourceKey];
        if (current) current.ms += sample.ms;
        else {
          pendingRef.current[sample.sourceKey] = {
            label: sample.sourceLabel,
            provider: sample.provider,
            ms: sample.ms,
          };
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, []);

  const applySettings = useCallback((next: AppSettings) => {
    settingsRef.current = next;
    setSettings(next);
  }, []);

  const startNewSession = useCallback(async () => {
    await flush();
    pendingRef.current = {};
    sinceFlushRef.current = 0;
    lastFlushedElapsed.current = -1;
    applyStored(freshSession());
    persist();
  }, [applyStored, flush, persist]);

  const beginSession = useCallback(
    async (plan: SessionPlan) => {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      const body = (await response.json()) as AppSettings & { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "The session could not be started");
      }
      applySettings(body);
      startedRef.current = Date.now();
      hasStartedRef.current = true;
      setStarted(true);
      persist();
    },
    [applySettings, persist],
  );

  useEffect(() => {
    applyStored(readStored());
    setReady(true);
    void (async () => {
      const response = await fetch("/api/settings");
      if (!response.ok) return;
      applySettings((await response.json()) as AppSettings);
    })();
  }, [applySettings, applyStored]);

  useEffect(() => {
    if (!ready || !started) return;
    const capped = isSessionCapped(
      elapsedRef.current,
      settings.sessionLimitMinutes,
    );
    if (capped === pausedRef.current) return;
    pausedRef.current = capped;
    setPaused(capped);
    persist();
  }, [elapsedMs, persist, ready, settings.sessionLimitMinutes, started]);

  useEffect(() => {
    if (!ready) return;
    let last = Date.now();
    let shownSecond = Math.floor(elapsedRef.current / 1000);
    // Ticking faster than once a second keeps timer jitter from skipping a
    // displayed second: a 1s interval fires every ~1.005s, so the countdown
    // would otherwise drop two seconds at once every few minutes.
    const timer = window.setInterval(() => {
      const now = Date.now();
      const delta = Math.min(Math.max(0, now - last), 5000);
      last = now;
      if (
        document.visibilityState !== "visible" ||
        awayRef.current ||
        loadingRef.current ||
        pausedRef.current ||
        !hasStartedRef.current
      ) {
        return;
      }
      const limit = settingsRef.current.sessionLimitMinutes;
      const limitMs = limit != null && limit > 0 ? limit * 60_000 : null;
      let added = delta;
      if (limitMs != null) {
        const room = limitMs - elapsedRef.current;
        if (room <= 0) {
          pausedRef.current = true;
          setPaused(true);
          persist();
          void flush();
          return;
        }
        if (added > room) added = room;
      }
      if (added <= 0) return;
      elapsedRef.current += added;
      sinceFlushRef.current += added;
      for (const source of readVisible()) {
        sourceRef.current[source.key] = (sourceRef.current[source.key] ?? 0) + added;
        const pending = pendingRef.current[source.key] ?? {
          label: source.label,
          provider: source.provider,
          ms: 0,
        };
        pending.ms += added;
        pending.label = source.label;
        pending.provider = source.provider;
        pendingRef.current[source.key] = pending;
      }
      if (limitMs != null && elapsedRef.current >= limitMs) {
        pausedRef.current = true;
        setPaused(true);
      }
      // Time is counted every tick, but the clock only re-renders when its
      // visible second changes (or the session pauses).
      const second = Math.floor(elapsedRef.current / 1000);
      if (second === shownSecond && !pausedRef.current) return;
      shownSecond = second;
      setElapsedMs(elapsedRef.current);
      setSourceElapsedMs({ ...sourceRef.current });
      persist();
      if (sinceFlushRef.current >= FLUSH_MS || pausedRef.current) {
        void flush();
      }
    }, TICK_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        persist();
        void flush();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flush, persist, ready]);

  // Leaving the feed stops the clock; write out what was counted so the
  // analytics page sees it right away.
  useEffect(() => {
    if (!ready || !awayFromFeed) return;
    persist();
    void flush();
  }, [awayFromFeed, flush, persist, ready]);

  const cappedKeys = useMemo(
    () => cappedSourceKeys(sourceElapsedMs, settings.sourceLimits),
    [settings.sourceLimits, sourceElapsedMs],
  );

  const value = useMemo(
    () => ({
      ready,
      started,
      elapsedMs,
      paused,
      awayFromFeed,
      feedLoading,
      setFeedLoading,
      settings,
      cappedKeys,
      applySettings,
      beginSession,
      startNewSession,
    }),
    [
      applySettings,
      awayFromFeed,
      beginSession,
      cappedKeys,
      elapsedMs,
      feedLoading,
      setFeedLoading,
      paused,
      ready,
      settings,
      startNewSession,
      started,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}
