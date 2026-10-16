"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PostCard } from "@/components/PostCard";
import { useSession } from "@/components/SessionProvider";
import type { Post, SourceNotice } from "@/lib/types";

type FeedPayload = {
  posts: Post[];
  notices: SourceNotice[];
};

export function FeedScreen() {
  const { paused, cappedKeys, startNewSession } = useSession();
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/feed");
      const body = (await response.json()) as FeedPayload & { error?: string };
      if (!response.ok) throw new Error(body.error || "The feed could not be loaded");
      setFeed({ posts: body.posts ?? [], notices: body.notices ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The feed could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const posts = feed?.posts ?? [];
  const notices = feed?.notices ?? [];
  const capped = new Set(cappedKeys);
  const labels = new Map<string, string>();
  for (const post of posts) labels.set(post.sourceKey, post.sourceLabel);
  for (const notice of notices) labels.set(notice.sourceKey, notice.sourceLabel);
  const visiblePosts = posts.filter((post) => !capped.has(post.sourceKey));
  const pausedLabels = [...capped]
    .map((key) => labels.get(key))
    .filter((label): label is string => Boolean(label));

  return (
    <div className="column">
      <header className="page-head">
        <div>
          <h1>Feed</h1>
          <p>Sources woven together, without a ranking.</p>
        </div>
        {paused ? null : (
          <button type="button" className="button ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        )}
      </header>

      {error ? <p className="banner error">{error}</p> : null}
      {notices.map((notice) => (
        <p key={`${notice.sourceKey}-${notice.message}`} className={`banner ${notice.level}`}>
          {notice.message}
        </p>
      ))}
      {pausedLabels.length > 0 && !paused ? (
        <p className="banner notice">
          Paused for this session: {pausedLabels.join(", ")}
        </p>
      ) : null}

      {paused ? (
        <section className="pause">
          <h2>Session limit reached</h2>
          <p>The clock is stopped. Start a new session when you want the feed back.</p>
          <button type="button" className="button" onClick={() => void startNewSession()}>
            Start a new session
          </button>
        </section>
      ) : loading && !feed ? (
        <p className="status">Gathering the weave…</p>
      ) : visiblePosts.length === 0 ? (
        <section className="empty">
          <h2>Nothing in the weave yet</h2>
          <p>Connect a social account or add a news, industry, or custom feed.</p>
          <Link className="button" href="/sources">
            Add a source
          </Link>
        </section>
      ) : (
        <div className="feed">
          {visiblePosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
