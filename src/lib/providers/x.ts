import { callbackUrl, envValue } from "@/lib/env";
import { createPending, takePending, upsertAccount } from "@/lib/db";
import {
  accountSourceKey,
  type Account,
  type FetchBucket,
  type Post,
} from "@/lib/types";
import { clip, errorMessage } from "@/lib/text";
import {
  basicAuth,
  fetchWithTimeout,
  formBody,
  readJson,
  tokenBundle,
} from "@/lib/providers/http";
import { ensureFreshToken, pkcePair } from "@/lib/providers/oauth";

type XUser = { id?: string; name?: string; username?: string };
type XMedia = { media_key?: string; url?: string; preview_image_url?: string };
type XTweet = {
  id?: string;
  text?: string;
  created_at?: string;
  author_id?: string;
  attachments?: { media_keys?: string[] };
};

function xAuthHeader(): string {
  return basicAuth(envValue("X_CLIENT_ID"), envValue("X_CLIENT_SECRET"));
}

export function xStartUrl(): string {
  const { verifier, challenge } = pkcePair();
  const state = createPending({ provider: "x", codeVerifier: verifier });
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", envValue("X_CLIENT_ID"));
  url.searchParams.set("redirect_uri", callbackUrl("x"));
  url.searchParams.set("scope", "tweet.read users.read offline.access");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function exchangeX(
  fields: Record<string, string>,
  existingRefresh: string | null,
) {
  const response = await fetchWithTimeout("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: xAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody({
      client_id: envValue("X_CLIENT_ID"),
      ...fields,
    }),
  });
  const body = await readJson<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  }>(response);
  if (!response.ok) {
    throw new Error(body.error_description || "X refused the token request");
  }
  return tokenBundle(body, existingRefresh);
}

export async function xFinish(code: string, state: string): Promise<void> {
  const pending = takePending(state, "x");
  if (!pending?.codeVerifier) {
    throw new Error("X sign-in expired. Try connecting again.");
  }
  const tokens = await exchangeX(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl("x"),
      code_verifier: pending.codeVerifier,
    },
    null,
  );
  const me = await fetchWithTimeout("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  const profile = await readJson<{ data?: XUser }>(me);
  if (!me.ok || !profile.data?.id) throw new Error("X did not return a profile");
  upsertAccount({
    provider: "x",
    externalId: profile.data.id,
    displayName: profile.data.name || profile.data.username || "X",
    handle: profile.data.username || profile.data.id,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    instanceUrl: null,
  });
}

export async function fetchX(account: Account): Promise<FetchBucket> {
  const sourceKey = accountSourceKey(account.id);
  const sourceLabel = account.handle ? `@${account.handle}` : "X";
  try {
    const fresh = await ensureFreshToken(account, (refreshToken) =>
      exchangeX(
        { grant_type: "refresh_token", refresh_token: refreshToken },
        refreshToken,
      ),
    );
    if (!fresh.accessToken) throw new Error("X is missing a token");
    const timeline = new URL(
      `https://api.x.com/2/users/${fresh.externalId}/timelines/reverse_chronological`,
    );
    timeline.searchParams.set("max_results", "20");
    timeline.searchParams.set("tweet.fields", "created_at,attachments,author_id");
    timeline.searchParams.set("expansions", "author_id,attachments.media_keys");
    timeline.searchParams.set("user.fields", "name,username");
    timeline.searchParams.set("media.fields", "url,preview_image_url,type");
    const response = await fetchWithTimeout(timeline.toString(), {
      headers: { Authorization: `Bearer ${fresh.accessToken}` },
    });
    const body = await readJson<{
      data?: XTweet[];
      includes?: { users?: XUser[]; media?: XMedia[] };
      title?: string;
      detail?: string;
    }>(response);
    if (!response.ok) {
      throw new Error(body.detail || body.title || `X returned ${response.status}`);
    }
    const users = new Map(
      (body.includes?.users ?? []).map((user) => [user.id, user]),
    );
    const media = new Map(
      (body.includes?.media ?? []).map((item) => [item.media_key, item]),
    );
    const posts: Post[] = (body.data ?? []).slice(0, 20).map((tweet) => {
      const author = users.get(tweet.author_id);
      const mediaUrls = (tweet.attachments?.media_keys ?? [])
        .map((key) => media.get(key))
        .map((item) => item?.url || item?.preview_image_url)
        .filter((url): url is string => Boolean(url));
      return {
        id: `x:${tweet.id ?? crypto.randomUUID()}`,
        provider: "x",
        badge: "X",
        sourceKey,
        sourceLabel,
        imageKey: sourceKey,
        authorName: author?.name || fresh.displayName,
        authorHandle: author?.username || fresh.handle,
        text: clip(tweet.text || ""),
        mediaUrls,
        url: tweet.id ? `https://x.com/i/status/${tweet.id}` : "https://x.com",
        createdAt: tweet.created_at ?? null,
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
          message: errorMessage(error, "X could not be read"),
        },
      ],
    };
  }
}
