import { callbackUrl } from "@/lib/env";
import {
  createPending,
  getMastodonApp,
  saveMastodonApp,
  takePending,
  upsertAccount,
} from "@/lib/db";
import {
  accountSourceKey,
  type Account,
  type FetchBucket,
  type Post,
} from "@/lib/types";
import { clip, errorMessage, parseHttpUrl, stripHtml } from "@/lib/text";
import {
  fetchWithTimeout,
  formBody,
  readJson,
  tokenBundle,
} from "@/lib/providers/http";
import { ensureFreshToken } from "@/lib/providers/oauth";

type Status = {
  id?: string;
  url?: string;
  content?: string;
  created_at?: string;
  sensitive?: boolean;
  account?: { display_name?: string; acct?: string };
  media_attachments?: { type?: string; url?: string; preview_url?: string }[];
  reblog?: Status | null;
};

export function normalizeInstance(raw: string): string {
  const trimmed = raw.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const parsed = parseHttpUrl(withProtocol);
  if (!parsed) throw new Error("Enter an instance host such as mastodon.social");
  const url = new URL(parsed);
  if (url.protocol !== "https:") {
    throw new Error("Mastodon instances need an https address");
  }
  return url.origin;
}

async function mastodonCredentials(instanceUrl: string): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  const existing = getMastodonApp(instanceUrl);
  if (existing) return existing;
  const response = await fetchWithTimeout(`${instanceUrl}/api/v1/apps`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      client_name: "Smolfeed",
      redirect_uris: callbackUrl("mastodon"),
      scopes: "read:accounts read:statuses",
      website: new URL(callbackUrl("mastodon")).origin,
    }),
  });
  const body = await readJson<{
    client_id?: string;
    client_secret?: string;
    error?: string;
  }>(response);
  if (!response.ok || !body.client_id || !body.client_secret) {
    throw new Error(body.error || "The instance refused app registration");
  }
  saveMastodonApp({
    instanceUrl,
    clientId: body.client_id,
    clientSecret: body.client_secret,
  });
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

export async function mastodonStartUrl(instanceRaw: string): Promise<string> {
  const instanceUrl = normalizeInstance(instanceRaw);
  const app = await mastodonCredentials(instanceUrl);
  const state = createPending({
    provider: "mastodon",
    payload: { instanceUrl },
  });
  const url = new URL(`${instanceUrl}/oauth/authorize`);
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", callbackUrl("mastodon"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "read:accounts read:statuses");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function mastodonFinish(code: string, state: string): Promise<void> {
  const pending = takePending(state, "mastodon");
  const instanceUrl = pending?.payload.instanceUrl;
  if (!pending || !instanceUrl) {
    throw new Error("Mastodon sign-in expired. Try connecting again.");
  }
  const app = await mastodonCredentials(instanceUrl);
  const tokenResponse = await fetchWithTimeout(`${instanceUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      grant_type: "authorization_code",
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: callbackUrl("mastodon"),
      scope: "read:accounts read:statuses",
    }),
  });
  const tokenJson = await readJson<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  }>(tokenResponse);
  if (!tokenResponse.ok) {
    throw new Error(tokenJson.error || "Mastodon refused the authorization code");
  }
  const tokens = tokenBundle(tokenJson, null);
  const me = await fetchWithTimeout(
    `${instanceUrl}/api/v1/accounts/verify_credentials`,
    { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
  );
  const profile = await readJson<{
    id?: string;
    display_name?: string;
    username?: string;
    acct?: string;
  }>(me);
  if (!me.ok || !profile.id) throw new Error("Mastodon did not return a profile");
  const handle = profile.acct || profile.username || profile.id;
  upsertAccount({
    provider: "mastodon",
    externalId: `${instanceUrl}:${profile.id}`,
    displayName: profile.display_name || handle,
    handle,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    instanceUrl,
  });
}

function statusMedia(status: Status): string[] {
  if (status.sensitive) return [];
  return (status.media_attachments ?? [])
    .filter((item) => item.type === "image")
    .map((item) => item.url || item.preview_url)
    .filter((url): url is string => Boolean(url))
    .slice(0, 4);
}

export async function fetchMastodon(account: Account): Promise<FetchBucket> {
  const sourceKey = accountSourceKey(account.id);
  const sourceLabel = account.handle || "Mastodon";
  const instanceUrl = account.instanceUrl;
  try {
    if (!instanceUrl) throw new Error("Mastodon account is missing its instance");
    const fresh = account.refreshToken
      ? await ensureFreshToken(account, async (refreshToken) => {
          const app = await mastodonCredentials(instanceUrl);
          const response = await fetchWithTimeout(`${instanceUrl}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formBody({
              grant_type: "refresh_token",
              refresh_token: refreshToken,
              client_id: app.clientId,
              client_secret: app.clientSecret,
            }),
          });
          const body = await readJson<{
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
          }>(response);
          if (!response.ok) throw new Error("Mastodon token refresh failed");
          return tokenBundle(body, refreshToken);
        })
      : account;
    if (!fresh.accessToken) throw new Error("Mastodon is missing a token");
    const response = await fetchWithTimeout(
      `${instanceUrl}/api/v1/timelines/home?limit=20`,
      { headers: { Authorization: `Bearer ${fresh.accessToken}` } },
    );
    if (!response.ok) throw new Error(`Mastodon returned ${response.status}`);
    const statuses = await readJson<Status[]>(response);
    const posts: Post[] = (Array.isArray(statuses) ? statuses : [])
      .slice(0, 20)
      .map((status) => {
        const inner = status.reblog ?? status;
        const author = inner.account;
        return {
          id: `mastodon:${status.id ?? crypto.randomUUID()}`,
          provider: "mastodon" as const,
          badge: "Mastodon",
          sourceKey,
          sourceLabel,
          imageKey: sourceKey,
          authorName: author?.display_name || author?.acct || "Mastodon",
          authorHandle: author?.acct || fresh.handle,
          text: clip(stripHtml(inner.content || ""), 600),
          mediaUrls: statusMedia(inner),
          url: inner.url || status.url || instanceUrl,
          createdAt: inner.created_at ?? status.created_at ?? null,
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
          message: errorMessage(error, "Mastodon could not be read"),
        },
      ],
    };
  }
}
