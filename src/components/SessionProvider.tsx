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
import { cappedSourceKeys, isSessionCapped } from "@/lib/limits";
import type { AppSettings, ProviderId } from "@/lib/types";

const STORAGE_KEY = "smolfeed.session.v1";
const FLUSH_MS = 15_000;

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
};

type SessionContextValue = {
  ready: boolean;
  elapsedMs: number;
  paused: boolean;
  settings: AppSettings;
  cappedKeys: string[];
  toggleDeter: () => Promise<void>;
  applySettings: (settings: AppSettings) => void;
  startNewSession: () => Promise<void>;
};

const EMPTY_SETTINGS: AppSettings = {
  sessionLimitMinutes: null,
  deterEnabled: false,
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
  };
}

function readStored(): PersistedSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshSession();
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    if (!parsed.id || typeof parsed.elapsedMs !== "number") return freshSession();
    return {
      id: parsed.id,
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : Date.now(),
      elapsedMs: Math.max(0, parsed.elapsedMs),
      sourceElapsedMs: parsed.sourceElapsedMs ?? {},
      paused: Boolean(parsed.paused),
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
  const [ready, setReady] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sourceElapsedMs, setSourceElapsedMs] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);

  const idRef = useRef("");
  const startedRef = useRef(0);
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
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, []);

  const applyStored = useCallback((session: PersistedSession) => {
    idRef.current = session.id;
    startedRef.current = session.startedAt;
    elapsedRef.current = session.elapsedMs;
    sourceRef.current = session.sourceElapsedMs;
    pausedRef.current = session.paused;
    setElapsedMs(session.elapsedMs);
    setSourceElapsedMs(session.sourceElapsedMs);
    setPaused(session.paused);
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current || !idRef.current) return;
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

  const toggleDeter = useCallback(async () => {
    const next = !settingsRef.current.deterEnabled;
    const optimistic = { ...settingsRef.current, deterEnabled: next };
    applySettings(optimistic);
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deterEnabled: next }),
    });
    if (!response.ok) {
      applySettings({ ...settingsRef.current, deterEnabled: !next });
      return;
    }
    applySettings((await response.json()) as AppSettings);
  }, [applySettings]);

  const startNewSession = useCallback(async () => {
    await flush();
    pendingRef.current = {};
    sinceFlushRef.current = 0;
    lastFlushedElapsed.current = -1;
    applyStored(freshSession());
    persist();
  }, [applyStored, flush, persist]);

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
    if (!ready) return;
    const capped = isSessionCapped(
      elapsedRef.current,
      settings.sessionLimitMinutes,
    );
    if (capped === pausedRef.current) return;
    pausedRef.current = capped;
    setPaused(capped);
    persist();
  }, [elapsedMs, persist, ready, settings.sessionLimitMinutes]);

  useEffect(() => {
    if (!ready) return;
    let last = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const delta = Math.min(Math.max(0, now - last), 5000);
      last = now;
      if (document.visibilityState !== "visible" || pausedRef.current) return;
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
      setElapsedMs(elapsedRef.current);
      setSourceElapsedMs({ ...sourceRef.current });
      persist();
      if (sinceFlushRef.current >= FLUSH_MS || pausedRef.current) {
        void flush();
      }
    }, 1000);
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

  const cappedKeys = useMemo(
    () => cappedSourceKeys(sourceElapsedMs, settings.sourceLimits),
    [settings.sourceLimits, sourceElapsedMs],
  );

  const value = useMemo(
    () => ({
      ready,
      elapsedMs,
      paused,
      settings,
      cappedKeys,
      toggleDeter,
      applySettings,
      startNewSession,
    }),
    [
      applySettings,
      cappedKeys,
      elapsedMs,
      paused,
      ready,
      settings,
      startNewSession,
      toggleDeter,
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
