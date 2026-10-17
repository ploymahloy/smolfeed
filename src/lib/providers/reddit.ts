import { callbackUrl, envValue } from "@/lib/env";
import { createPending, takePending, upsertAccount } from "@/lib/db";
import {
  accountSourceKey,
  type Account,
  type FetchBucket,
  type Post,
} from "@/lib/types";
import { clip, errorMessage, stripHtml } from "@/lib/text";
import {
  basicAuth,
  fetchWithTimeout,
  formBody,
  readJson,
  tokenBundle,
} from "@/lib/providers/http";
import { ensureFreshToken } from "@/lib/providers/oauth";

const USER_AGENT = "web:smolfeed:0.1.0 (local feed reader)";

type RedditPost = {
  id?: string;
  title?: string;
  selftext?: string;
  author?: string;
  permalink?: string;
  url?: string;
  thumbnail?: string;
  created_utc?: number;
  subreddit?: string;
};

function redditAuthHeader(): string {
  return basicAuth(envValue("REDDIT_CLIENT_ID"), envValue("REDDIT_CLIENT_SECRET"));
}

export function redditStartUrl(): string {
  const state = createPending({ provider: "reddit" });
  const url = new URL("https://www.reddit.com/api/v1/authorize");
  url.searchParams.set("client_id", envValue("REDDIT_CLIENT_ID"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", callbackUrl("reddit"));
  url.searchParams.set("duration", "permanent");
  url.searchParams.set("scope", "identity read");
  return url.toString();
}

async function exchangeReddit(
  fields: Record<string, string>,
  existingRefresh: string | null,
) {
  const response = await fetchWithTimeout(
    "https://www.reddit.com/api/v1/access_token",
    {
      method: "POST",
      headers: {
        Authorization: redditAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: formBody(fields),
    },
  );
  const body = await readJson<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    message?: string;
  }>(response);
  if (!response.ok || !body.access_token) {
    throw new Error(body.message || "Reddit refused the token request");
  }
  return tokenBundle(body, existingRefresh);
}

export async function redditFinish(code: string, state: string): Promise<void> {
  const pending = takePending(state, "reddit");
  if (!pending) throw new Error("Reddit sign-in expired. Try connecting again.");
  const tokens = await exchangeReddit(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl("reddit"),
    },
    null,
  );
  const me = await fetchWithTimeout("https://oauth.reddit.com/api/v1/me", {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "User-Agent": USER_AGENT,
    },
  });
  const profile = await readJson<{ id?: string; name?: string }>(me);
  if (!me.ok || !profile.name) throw new Error("Reddit did not return a profile");
  upsertAccount({
    provider: "reddit",
    externalId: profile.id || profile.name,
    displayName: profile.name,
    handle: profile.name,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    instanceUrl: null,
  });
}

function thumbnail(post: RedditPost): string[] {
  if (post.thumbnail && post.thumbnail.startsWith("http")) return [post.thumbnail];
  return [];
}

export async function fetchReddit(account: Account): Promise<FetchBucket> {
  const sourceKey = accountSourceKey(account.id);
  const sourceLabel = account.handle ? `u/${account.handle}` : "Reddit";
  try {
    const fresh = await ensureFreshToken(account, (refreshToken) =>
      exchangeReddit(
        { grant_type: "refresh_token", refresh_token: refreshToken },
        refreshToken,
      ),
    );
    if (!fresh.accessToken) throw new Error("Reddit is missing a token");
    const response = await fetchWithTimeout(
      "https://oauth.reddit.com/.json?limit=20&raw_json=1",
      {
        headers: {
          Authorization: `Bearer ${fresh.accessToken}`,
          "User-Agent": USER_AGENT,
        },
      },
    );
    const body = await readJson<{
      data?: { children?: { data?: RedditPost }[] };
      message?: string;
    }>(response);
    if (!response.ok) {
      throw new Error(body.message || `Reddit returned ${response.status}`);
    }
    const posts: Post[] = (body.data?.children ?? [])
      .slice(0, 20)
      .map((child) => child.data)
      .filter((post): post is RedditPost => Boolean(post?.id))
      .map((post) => {
        const bodyText = stripHtml(post.selftext || "");
        const text = clip(
          [post.title, bodyText].filter(Boolean).join("\n\n"),
          600,
        );
        return {
          id: `reddit:${post.id}`,
          provider: "reddit" as const,
          badge: "Reddit",
          sourceKey,
          sourceLabel,
          imageKey: sourceKey,
          authorName: post.subreddit ? `r/${post.subreddit}` : "Reddit",
          authorHandle: post.author || fresh.handle,
          text,
          mediaUrls: thumbnail(post),
          url: post.permalink
            ? `https://www.reddit.com${post.permalink}`
            : "https://www.reddit.com",
          createdAt: post.created_utc
            ? new Date(post.created_utc * 1000).toISOString()
            : null,
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
          message: errorMessage(error, "Reddit could not be read"),
        },
      ],
    };
  }
}
