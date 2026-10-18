"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import type { AppSettings, Category, PublicAccount, SocialProviderId } from "@/lib/types";

type ProviderRow = {
  id: SocialProviderId;
  label: string;
  hint: string;
  missing: string[];
  accounts: PublicAccount[];
};

type SourcesPayload = {
  origin: string;
  redirectPath: string;
  providers: ProviderRow[];
  categories: Category[];
  settings: AppSettings;
};

const PROVIDER_NAMES: Record<string, string> = {
  instagram: "Instagram",
  x: "X",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
};

export function SourcesScreen() {
  const params = useSearchParams();
  const { applySettings } = useSession();
  const [data, setData] = useState<SourcesPayload | null>(null);
  const [error, setError] = useState(params.get("error") ?? "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Category["kind"]>("news");
  const [urls, setUrls] = useState("");
  const [handles, setHandles] = useState<Record<string, string>>({});

  const connected = params.get("connected");

  const applyPayload = useCallback(
    (payload: SourcesPayload) => {
      setData(payload);
      applySettings(payload.settings);
    },
    [applySettings],
  );

  const load = useCallback(async () => {
    const response = await fetch("/api/sources");
    if (!response.ok) throw new Error("Sources could not be loaded");
    applyPayload((await response.json()) as SourcesPayload);
  }, [applyPayload]);

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Sources could not be loaded");
    });
  }, [load]);

  async function connectSpecial(provider: "bluesky" | "mastodon") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${provider}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          provider === "bluesky"
            ? { handle: handles.bluesky ?? "" }
            : { instance: handles.mastodon ?? "" },
        ),
      });
      const body = (await response.json()) as { redirectUrl?: string; error?: string };
      if (!response.ok || !body.redirectUrl) {
        throw new Error(body.error || "The connection could not be started");
      }
      window.location.href = body.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The connection could not be started");
      setBusy(false);
    }
  }

  async function disconnect(id: string) {
    setError("");
    const response = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error || "The account could not be removed");
      return;
    }
    await load();
  }

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const feedUrls = urls
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, urls: feedUrls }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error || "The category could not be saved");
      return;
    }
    setName("");
    setUrls("");
    setNotice("Category added.");
    await load();
  }

  async function removeCategory(id: string) {
    setError("");
    const response = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("The category could not be removed");
      return;
    }
    await load();
  }

  return (
    <div className="column wide">
      <header className="page-head">
        <div>
          <h1>Sources</h1>
          <p>Connect accounts and add feeds.</p>
        </div>
      </header>

      {connected ? (
        <p className="banner notice">
          {PROVIDER_NAMES[connected] ?? "Account"} is connected.
        </p>
      ) : null}
      {error ? <p className="banner error">{error}</p> : null}
      {notice ? <p className="banner notice">{notice}</p> : null}

      <section className="panel">
        <h2>Social accounts</h2>
        <p className="lede">
          Register{" "}
          <code>
            {data?.origin ?? "http://127.0.0.1:3000"}
            {data?.redirectPath ?? "/api/auth/{provider}/callback"}
          </code>{" "}
          as the redirect URI. The app runs without keys; a connect button stays off until its variables are in <code>.env</code>.
        </p>
        <ul className="source-list">
          {(data?.providers ?? []).map((provider) => (
            <li key={provider.id} className="source-row">
              <div>
                <h3>{provider.label}</h3>
                <p>{provider.hint}</p>
                {provider.missing.length > 0 ? (
                  <p className="missing">
                    Add {provider.missing.join(", ")} to .env and restart the dev server.
                  </p>
                ) : null}
                {provider.accounts.map((account) => (
                  <p key={account.id} className="connected">
                    <span>
                      {account.displayName}
                      {account.handle ? ` · ${account.handle}` : ""}
                      {account.instanceUrl ? ` · ${account.instanceUrl}` : ""}
                    </span>
                    <button type="button" className="text-button" onClick={() => void disconnect(account.id)}>
                      Disconnect
                    </button>
                  </p>
                ))}
              </div>
              {provider.missing.length > 0 ? null : provider.id === "bluesky" || provider.id === "mastodon" ? (
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void connectSpecial(provider.id as "bluesky" | "mastodon");
                  }}
                >
                  <label>
                    {provider.id === "bluesky" ? "Handle" : "Instance"}
                    <input
                      value={handles[provider.id] ?? ""}
                      onChange={(event) =>
                        setHandles((current) => ({
                          ...current,
                          [provider.id]: event.target.value,
                        }))
                      }
                      placeholder={provider.id === "bluesky" ? "you.bsky.social" : "mastodon.social"}
                      required
                    />
                  </label>
                  <button type="submit" className="button" disabled={busy}>
                    Connect
                  </button>
                </form>
              ) : (
                <a className="button" href={`/api/auth/${provider.id}/start`}>
                  Connect
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Categories</h2>
        <p className="lede">News, industry, or any other RSS or Atom feed. Each feed is its own strand in the weave.</p>
        <form className="stack-form" onSubmit={(event) => void addCategory(event)}>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} placeholder="News" />
          </label>
          <label>
            Kind
            <select value={kind} onChange={(event) => setKind(event.target.value as Category["kind"])}>
              <option value="news">News</option>
              <option value="industry">Industry</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Feed URLs
            <textarea
              value={urls}
              onChange={(event) => setUrls(event.target.value)}
              required
              rows={4}
              placeholder={"https://feeds.bbci.co.uk/news/rss.xml"}
            />
          </label>
          <button type="submit" className="button">
            Add category
          </button>
        </form>
        <ul className="category-list">
          {(data?.categories ?? []).map((category) => (
            <li key={category.id}>
              <div>
                <strong>{category.name}</strong>
                <span className="kind">{category.kind}</span>
                <ul>
                  {category.feeds.map((feed) => (
                    <li key={feed.id}>{feed.url}</li>
                  ))}
                </ul>
              </div>
              <button type="button" className="text-button" onClick={() => void removeCategory(category.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
