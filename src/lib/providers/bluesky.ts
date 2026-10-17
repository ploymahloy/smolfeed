import { Agent } from "@atproto/api";
import {
  NodeOAuthClient,
  buildAtprotoLoopbackClientMetadata,
  requestLocalLock,
  type NodeSavedSession,
  type NodeSavedState,
  type OAuthSession,
} from "@atproto/oauth-client-node";
import { callbackUrl } from "@/lib/env";
import {
  deleteAtprotoSession,
  deleteAtprotoState,
  readAtprotoSession,
  readAtprotoState,
  upsertAccount,
  writeAtprotoSession,
  writeAtprotoState,
} from "@/lib/db";
import {
  accountSourceKey,
  type Account,
  type FetchBucket,
  type Post,
} from "@/lib/types";
import { clip, errorMessage } from "@/lib/text";

const SCOPE = "atproto";

let client: NodeOAuthClient | null = null;

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export function getBlueskyClient(): NodeOAuthClient {
  if (client) return client;
  const redirect = callbackUrl("bluesky");
  if (!redirect.startsWith("http://127.0.0.1")) {
    throw new Error(
      "Bluesky local sign-in needs APP_URL on http://127.0.0.1",
    );
  }
  client = new NodeOAuthClient({
    clientMetadata: buildAtprotoLoopbackClientMetadata({
      scope: SCOPE,
      redirect_uris: [redirect],
    }),
    requestLock: requestLocalLock,
    stateStore: {
      async get(key: string) {
        const json = readAtprotoState(key);
        return json ? parseJson<NodeSavedState>(json) : undefined;
      },
      async set(key: string, value: NodeSavedState) {
        writeAtprotoState(key, JSON.stringify(value));
      },
      async del(key: string) {
        deleteAtprotoState(key);
      },
    },
    sessionStore: {
      async get(key: string) {
        const json = readAtprotoSession(key);
        return json ? parseJson<NodeSavedSession>(json) : undefined;
      },
      async set(key: string, value: NodeSavedSession) {
        writeAtprotoSession(key, JSON.stringify(value));
      },
      async del(key: string) {
        deleteAtprotoSession(key);
      },
    },
  });
  return client;
}

function agentFor(session: OAuthSession): Agent {
  return new Agent({
    did: session.did,
    fetchHandler: (url, init) => session.fetchHandler(url, init),
  });
}

export async function blueskyStartUrl(handle: string): Promise<string> {
  const cleaned = handle.trim().replace(/^@/, "");
  if (!cleaned.includes(".")) {
    throw new Error("Enter a Bluesky handle such as you.bsky.social");
  }
  const url = await getBlueskyClient().authorize(cleaned, { scope: SCOPE });
  return url.toString();
}

export async function blueskyFinish(params: URLSearchParams): Promise<void> {
  const { session } = await getBlueskyClient().callback(params);
  const agent = agentFor(session);
  const profile = await agent.getProfile({ actor: session.did });
  const handle = profile.data.handle;
  upsertAccount({
    provider: "bluesky",
    externalId: session.did,
    displayName: profile.data.displayName || handle,
    handle,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    instanceUrl: null,
  });
}

export async function revokeBluesky(did: string): Promise<void> {
  try {
    await getBlueskyClient().revoke(did);
  } catch {
    deleteAtprotoSession(did);
  }
}

function mediaFromEmbed(embed: unknown): string[] {
  if (!embed || typeof embed !== "object") return [];
  const record = embed as {
    images?: { fullsize?: string; thumb?: string }[];
    media?: { images?: { fullsize?: string; thumb?: string }[] };
  };
  const images = record.images ?? record.media?.images ?? [];
  return images
    .map((image) => image.fullsize || image.thumb)
    .filter((url): url is string => Boolean(url))
    .slice(0, 4);
}

function recordText(record: unknown): { text: string; createdAt: string | null } {
  if (!record || typeof record !== "object") return { text: "", createdAt: null };
  const value = record as { text?: unknown; createdAt?: unknown };
  return {
    text: typeof value.text === "string" ? value.text : "",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
  };
}

export async function fetchBluesky(account: Account): Promise<FetchBucket> {
  const sourceKey = accountSourceKey(account.id);
  const sourceLabel = account.handle ? `@${account.handle}` : "Bluesky";
  try {
    const session = await getBlueskyClient().restore(account.externalId);
    const agent = agentFor(session);
    const timeline = await agent.getTimeline({ limit: 20 });
    const posts: Post[] = timeline.data.feed.slice(0, 20).map((item) => {
      const post = item.post;
      const record = recordText(post.record);
      const author = post.author;
      return {
        id: `bluesky:${post.uri}`,
        provider: "bluesky",
        badge: "Bluesky",
        sourceKey,
        sourceLabel,
        imageKey: sourceKey,
        authorName: author.displayName || author.handle,
        authorHandle: author.handle,
        text: clip(record.text),
        mediaUrls: mediaFromEmbed(post.embed),
        url: `https://bsky.app/profile/${author.handle}/post/${post.uri.split("/").pop() ?? ""}`,
        createdAt: record.createdAt,
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
          message: errorMessage(error, "Bluesky could not be read"),
        },
      ],
    };
  }
}
