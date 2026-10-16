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

const LABEL = "Your LinkedIn posts";
const VERSION = "202609";

export function linkedinStartUrl(): string {
  const state = createPending({ provider: "linkedin" });
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", envValue("LINKEDIN_CLIENT_ID"));
  url.searchParams.set("redirect_uri", callbackUrl("linkedin"));
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "openid profile");
  return url.toString();
}

async function exchangeLinkedIn(
  fields: Record<string, string>,
  existingRefresh: string | null,
) {
  const response = await fetchWithTimeout(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({
        client_id: envValue("LINKEDIN_CLIENT_ID"),
        client_secret: envValue("LINKEDIN_CLIENT_SECRET"),
        ...fields,
      }),
    },
  );
  const body = await readJson<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  }>(response);
  if (!response.ok) {
    throw new Error(body.error_description || "LinkedIn refused the token request");
  }
  return tokenBundle(body, existingRefresh);
}

export async function linkedinFinish(code: string, state: string): Promise<void> {
  const pending = takePending(state, "linkedin");
  if (!pending) throw new Error("LinkedIn sign-in expired. Try connecting again.");
  const tokens = await exchangeLinkedIn(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl("linkedin"),
    },
    null,
  );
  const me = await fetchWithTimeout("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  const profile = await readJson<{
    sub?: string;
    name?: string;
    given_name?: string;
    email?: string;
  }>(me);
  if (!me.ok || !profile.sub) throw new Error("LinkedIn did not return a profile");
  upsertAccount({
    provider: "linkedin",
    externalId: profile.sub,
    displayName: profile.name || profile.given_name || "LinkedIn",
    handle: profile.name || profile.sub,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    instanceUrl: null,
  });
}

type LinkedInElement = {
  id?: string;
  commentary?: string;
  publishedAt?: number;
};

export async function fetchLinkedIn(account: Account): Promise<FetchBucket> {
  const sourceKey = accountSourceKey(account.id);
  try {
    const fresh = account.refreshToken
      ? await ensureFreshToken(account, (refreshToken) =>
          exchangeLinkedIn(
            { grant_type: "refresh_token", refresh_token: refreshToken },
            refreshToken,
          ),
        )
      : account;
    if (!fresh.accessToken) throw new Error("LinkedIn is missing a token");
    const author = encodeURIComponent(`urn:li:person:${fresh.externalId}`);
    const response = await fetchWithTimeout(
      `https://api.linkedin.com/rest/posts?q=authors&authors=List(${author})&count=10&sortBy=LAST_MODIFIED`,
      {
        headers: {
          Authorization: `Bearer ${fresh.accessToken}`,
          "LinkedIn-Version": VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );
    if (response.status === 401) {
      return {
        posts: [],
        notices: [
          {
            sourceKey,
            sourceLabel: fresh.displayName,
            level: "error",
            message: "LinkedIn session expired. Connect the account again.",
          },
        ],
      };
    }
    if (response.status === 403) {
      return {
        posts: [],
        notices: [
          {
            sourceKey,
            sourceLabel: fresh.displayName,
            level: "notice",
            message: `LinkedIn is connected as ${fresh.displayName}. Member post reads were refused (403). LinkedIn does not offer a home feed to apps.`,
          },
        ],
      };
    }
    const body = await readJson<{
      elements?: LinkedInElement[];
      message?: string;
    }>(response);
    if (!response.ok) {
      throw new Error(body.message || `LinkedIn returned ${response.status}`);
    }
    const posts: Post[] = (body.elements ?? [])
      .filter((item) => item.commentary)
      .slice(0, 10)
      .map((item) => ({
        id: `linkedin:${item.id ?? crypto.randomUUID()}`,
        provider: "linkedin" as const,
        badge: "LinkedIn",
        sourceKey,
        sourceLabel: LABEL,
        authorName: fresh.displayName,
        authorHandle: fresh.handle,
        text: clip(item.commentary || ""),
        mediaUrls: [],
        url: "https://www.linkedin.com/feed/",
        createdAt: item.publishedAt
          ? new Date(item.publishedAt).toISOString()
          : null,
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
          message: errorMessage(error, "LinkedIn could not be read"),
        },
      ],
    };
  }
}
