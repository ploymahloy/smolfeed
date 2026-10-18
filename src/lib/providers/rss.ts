import { XMLParser } from "fast-xml-parser";
import { feedLabel, feedSourceKey, type Category, type FetchBucket, type Post, type RssFeed } from "@/lib/types";
import { updateFeedTitle } from "@/lib/db";
import { clip, errorMessage, stripHtml, textOf } from "@/lib/text";
import { fetchWithTimeout } from "@/lib/providers/http";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function asList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object",
    );
  }
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function hrefOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as { "@_href"?: unknown; href?: unknown; "@_url"?: unknown };
  const href = record["@_href"] ?? record.href ?? record["@_url"];
  return typeof href === "string" ? href : "";
}

function linkFrom(record: Record<string, unknown>): string {
  const links = asList(record.link);
  const alternate = links.find((link) => {
    const rel = link["@_rel"];
    return rel == null || rel === "alternate";
  });
  return hrefOf(alternate ?? record.link) || hrefOf(record.guid);
}

function badgeFor(kind: Category["kind"]): string {
  if (kind === "news") return "News";
  if (kind === "industry") return "Industry";
  return "Feed";
}

function itemsFrom(doc: unknown): { title: string; entries: Record<string, unknown>[] } {
  if (!doc || typeof doc !== "object") return { title: "", entries: [] };
  const root = doc as { rss?: { channel?: Record<string, unknown> }; feed?: Record<string, unknown> };
  const channel = root.rss?.channel;
  if (channel) {
    return {
      title: textOf(channel.title),
      entries: asList(channel.item),
    };
  }
  if (root.feed) {
    return {
      title: textOf(root.feed.title),
      entries: asList(root.feed.entry),
    };
  }
  return { title: "", entries: [] };
}

export async function fetchRss(feed: RssFeed, category: Category): Promise<FetchBucket> {
  const sourceKey = feedSourceKey(feed.id);
  let sourceLabel = feedLabel(feed).slice(0, 80);
  try {
    const response = await fetchWithTimeout(feed.url, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);
    const xml = await response.text();
    const parsed = itemsFrom(parser.parse(xml));
    const host = new URL(feed.url).hostname.replace(/^www\./, "");
    // Remember the feed's own name so the UI can show it instead of the host.
    const channelTitle = parsed.title.trim().slice(0, 120);
    if (channelTitle) {
      sourceLabel = channelTitle.slice(0, 80);
      try {
        updateFeedTitle(feed.id, channelTitle);
      } catch {
        // A failed title write must not break reading the feed.
      }
    }
    const posts: Post[] = parsed.entries.slice(0, 12).map((entry, index) => {
      const title = textOf(entry.title);
      const summary = stripHtml(
        textOf(entry.description) ||
        textOf(entry.summary) ||
        textOf(entry["content:encoded"]) ||
        textOf(entry.content),
      )
        // Some feeds (e.g. Hacker News) pad summaries with link and score
        // metadata; keep only the real summary text.
        .replace(/^[ \t]*(Article URL|Comments URL|Points|#\s*Comments):.*$/gim, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      const text = clip([title, summary].filter(Boolean).join("\n\n"), 600);
      const url = linkFrom(entry) || feed.url;
      const id = textOf(entry.guid) || textOf(entry.id) || `${feed.id}:${index}:${url}`;
      return {
        id: `rss:${id}`,
        provider: "rss",
        badge: badgeFor(category.kind),
        sourceKey,
        sourceLabel,
        authorName: parsed.title || feed.title || host,
        authorHandle: host,
        text,
        url,
        createdAt: textOf(entry.pubDate) || textOf(entry.published) || textOf(entry.updated) || null,
      };
    });
    return { posts, notices: [] };
  } catch (error) {
    return {
      posts: [],
      notices: [
        {
          sourceKey,
          sourceLabel,
          level: "error",
          message: errorMessage(error, `${sourceLabel} could not be read`),
        },
      ],
    };
  }
}
