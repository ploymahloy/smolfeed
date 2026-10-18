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
  fetchWithTimeout,
  formBody,
  readJson,
  tokenBundle,
} from "@/lib/providers/http";
import { ensureFreshToken } from "@/lib/providers/oauth";

const LABEL = "Your Instagram posts";

type MediaItem = {
  id?: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  username?: string;
};

export function instagramStartUrl(): string {
  const state = createPending({ provider: "instagram" });
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", envValue("META_APP_ID"));
  url.searchParams.set("redirect_uri", callbackUrl("instagram"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function instagramFinish(code: string, state: string): Promise<void> {
  const pending = takePending(state, "instagram");
  if (!pending) throw new Error("Instagram sign-in expired. Try connecting again.");
  const cleanCode = code.split("#")[0] ?? code;
  const tokenResponse = await fetchWithTimeout(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({
        client_id: envValue("META_APP_ID"),
        client_secret: envValue("META_APP_SECRET"),
        grant_type: "authorization_code",
        redirect_uri: callbackUrl("instagram"),
        code: cleanCode,
      }),
    },
  );
  const tokenJson = await readJson<{
    access_token?: string;
    user_id?: string | number;
    expires_in?: number;
    data?: { access_token?: string; user_id?: string | number }[];
  }>(tokenResponse);
  if (!tokenResponse.ok) {
    throw new Error("Instagram refused the authorization code");
  }
  const shortToken =
    tokenJson.access_token ?? tokenJson.data?.[0]?.access_token ?? "";
  const userId = String(
    tokenJson.user_id ?? tokenJson.data?.[0]?.user_id ?? "",
  );
  if (!shortToken) throw new Error("Instagram did not return an access token");

  let accessToken = shortToken;
  let expiresAt = Date.now() + 60 * 60 * 1000;
  const longLived = await fetchWithTimeout(
    `https://graph.instagram.com/access_token?${new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: envValue("META_APP_SECRET"),
      access_token: shortToken,
    }).toString()}`,
  );
  if (longLived.ok) {
    const exchanged = await readJson<{
      access_token?: string;
      expires_in?: number;
    }>(longLived);
    if (exchanged.access_token) {
      accessToken = exchanged.access_token;
      expiresAt =
        Date.now() +
        (exchanged.expires_in ?? 60 * 24 * 60 * 60) * 1000;
    }
  }

  const profileResponse = await fetchWithTimeout(
    `https://graph.instagram.com/me?${new URLSearchParams({
      fields: "id,username,name",
      access_token: accessToken,
    }).toString()}`,
  );
  const profile = profileResponse.ok
    ? await readJson<{ id?: string; username?: string; name?: string }>(
        profileResponse,
      )
    : {};
  const externalId = profile.id || userId || "instagram-user";
  const handle = profile.username || "instagram";
  upsertAccount({
    provider: "instagram",
    externalId,
    displayName: profile.name || handle,
    handle,
    accessToken,
    refreshToken: accessToken,
    expiresAt,
    instanceUrl: null,
  });
}

async function refreshInstagram(
  refreshToken: string,
): Promise<ReturnType<typeof tokenBundle>> {
  const response = await fetchWithTimeout(
    `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: refreshToken,
    }).toString()}`,
  );
  const body = await readJson<{
    access_token?: string;
    expires_in?: number;
  }>(response);
  if (!response.ok) throw new Error("Instagram token refresh failed");
  return tokenBundle(
    { ...body, refresh_token: body.access_token },
    refreshToken,
  );
}

export async function fetchInstagram(account: Account): Promise<FetchBucket> {
  const sourceKey = accountSourceKey(account.id);
  try {
    const fresh = await ensureFreshToken(
      account,
      (token) => refreshInstagram(token),
      10 * 24 * 60 * 60 * 1000,
    );
    if (!fresh.accessToken) throw new Error("Instagram is missing a token");
    const response = await fetchWithTimeout(
      `https://graph.instagram.com/me/media?${new URLSearchParams({
        fields: "id,caption,permalink,timestamp,username",
        access_token: fresh.accessToken,
        limit: "15",
      }).toString()}`,
    );
    const body = await readJson<{
      data?: MediaItem[];
      error?: { message?: string };
    }>(response);
    if (!response.ok) {
      throw new Error(body.error?.message || `Instagram returned ${response.status}`);
    }
    const posts: Post[] = (body.data ?? []).slice(0, 15).map((item) => ({
      id: `instagram:${item.id ?? crypto.randomUUID()}`,
      provider: "instagram",
      badge: "Instagram",
      sourceKey,
      sourceLabel: LABEL,
      authorName: fresh.displayName,
      authorHandle: item.username || fresh.handle,
      text: clip(item.caption || ""),
      url: item.permalink || "https://www.instagram.com/",
      createdAt: item.timestamp ?? null,
    }));
    return { posts, notices: [] };
  } catch (error) {
    return {
      posts: [],
      notices: [
        {
          sourceKey,
          sourceLabel: LABEL,
          level: "error",
          message: errorMessage(error, "Instagram could not be read"),
        },
      ],
    };
  }
}
