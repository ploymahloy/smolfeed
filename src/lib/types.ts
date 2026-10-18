export type SocialProviderId =
  | "instagram"
  | "x"
  | "reddit"
  | "linkedin"
  | "bluesky"
  | "mastodon";

export type ProviderId = SocialProviderId | "rss";

export type CategoryKind = "news" | "industry" | "custom";

export type Post = {
  id: string;
  provider: ProviderId;
  badge: string;
  sourceKey: string;
  sourceLabel: string;
  authorName: string;
  authorHandle: string;
  text: string;
  url: string;
  createdAt: string | null;
};

export type NoticeLevel = "error" | "notice";

export type SourceNotice = {
  sourceKey: string;
  sourceLabel: string;
  level: NoticeLevel;
  message: string;
};

export type Account = {
  id: string;
  provider: SocialProviderId;
  externalId: string;
  displayName: string;
  handle: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
  instanceUrl: string | null;
  createdAt: number;
};

export type PublicAccount = {
  id: string;
  provider: SocialProviderId;
  displayName: string;
  handle: string;
  instanceUrl: string | null;
};

export type RssFeed = {
  id: string;
  categoryId: string;
  url: string;
  title: string;
};

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  feeds: RssFeed[];
};

export type AppSettings = {
  sessionLimitMinutes: number | null;
  sourceLimits: Record<string, number>;
};

export type FetchBucket = {
  posts: Post[];
  notices: SourceNotice[];
};

export function isSocialProvider(value: string): value is SocialProviderId {
  return (
    value === "instagram" ||
    value === "x" ||
    value === "reddit" ||
    value === "linkedin" ||
    value === "bluesky" ||
    value === "mastodon"
  );
}

export function isCategoryKind(value: string): value is CategoryKind {
  return value === "news" || value === "industry" || value === "custom";
}

export function accountSourceKey(accountId: string): string {
  return `account:${accountId}`;
}

export function categorySourceKey(categoryId: string): string {
  return `category:${categoryId}`;
}

export function feedSourceKey(feedId: string): string {
  return `feed:${feedId}`;
}

export function feedLabel(feed: Pick<RssFeed, "title" | "url">): string {
  const title = feed.title.trim();
  if (title) return title;
  try {
    return new URL(feed.url).hostname.replace(/^www\./, "");
  } catch {
    return feed.url;
  }
}

export function publicAccount(account: Account): PublicAccount {
  return {
    id: account.id,
    provider: account.provider,
    displayName: account.displayName,
    handle: account.handle,
    instanceUrl: account.instanceUrl,
  };
}
