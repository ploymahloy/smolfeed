import { XMLParser } from "fast-xml-parser";
import { categorySourceKey, type Category, type FetchBucket, type Post, type RssFeed } from "@/lib/types";
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

function imageFrom(record: Record<string, unknown>): string[] {
  const enclosure = record.enclosure;
  const enclosureUrl = hrefOf(enclosure);
  const enclosureType =
    enclosure && typeof enclosure === "object"
      ? String((enclosure as { "@_type"?: unknown })["@_type"] ?? "")
      : "";
  if (enclosureUrl.startsWith("http") && enclosureType.startsWith("image")) {
    return [enclosureUrl];
  }
  const media = record["media:content"] ?? record["media:thumbnail"];
  const mediaUrl = hrefOf(Array.isArray(media) ? media[0] : media);
  return mediaUrl.startsWith("http") ? [mediaUrl] : [];
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
  const sourceKey = categorySourceKey(category.id);
  const sourceLabel = category.name;
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
    const posts: Post[] = parsed.entries.slice(0, 12).map((entry, index) => {
      const title = textOf(entry.title);
      const summary = stripHtml(
        textOf(entry.description) ||
          textOf(entry.summary) ||
          textOf(entry["content:encoded"]) ||
          textOf(entry.content),
      );
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
        mediaUrls: imageFrom(entry),
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
