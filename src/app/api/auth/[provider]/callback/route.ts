import { NextResponse } from "next/server";
import { isSocialProvider } from "@/lib/types";
import { errorMessage } from "@/lib/text";
import { sourcesRedirect } from "@/lib/redirects";
import { blueskyFinish } from "@/lib/providers/bluesky";
import { instagramFinish } from "@/lib/providers/instagram";
import { linkedinFinish } from "@/lib/providers/linkedin";
import { mastodonFinish } from "@/lib/providers/mastodon";
import { redditFinish } from "@/lib/providers/reddit";
import { xFinish } from "@/lib/providers/x";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { provider } = await context.params;
  if (!isSocialProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  const params = new URL(request.url).searchParams;
  const providerError = params.get("error_description") || params.get("error");
  if (providerError && provider !== "bluesky") {
    return sourcesRedirect({ error: providerError });
  }
  try {
    if (provider === "bluesky") {
      await blueskyFinish(params);
    } else {
      const code = params.get("code");
      const state = params.get("state");
      if (!code || !state) throw new Error("The authorization response was incomplete");
      switch (provider) {
        case "instagram":
          await instagramFinish(code, state);
          break;
        case "x":
          await xFinish(code, state);
          break;
        case "reddit":
          await redditFinish(code, state);
          break;
        case "linkedin":
          await linkedinFinish(code, state);
          break;
        case "mastodon":
          await mastodonFinish(code, state);
          break;
        default:
          throw new Error("Unknown provider");
      }
    }
    return sourcesRedirect({ connected: provider });
  } catch (error) {
    return sourcesRedirect({
      error: errorMessage(error, "The account could not be connected"),
    });
  }
}
