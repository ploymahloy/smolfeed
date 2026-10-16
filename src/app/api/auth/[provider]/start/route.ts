import { NextResponse } from "next/server";
import { missingEnv, SOCIAL_SETUPS } from "@/lib/env";
import { isSocialProvider } from "@/lib/types";
import { errorMessage } from "@/lib/text";
import { sourcesRedirect } from "@/lib/redirects";
import { blueskyStartUrl } from "@/lib/providers/bluesky";
import { instagramStartUrl } from "@/lib/providers/instagram";
import { linkedinStartUrl } from "@/lib/providers/linkedin";
import { mastodonStartUrl } from "@/lib/providers/mastodon";
import { redditStartUrl } from "@/lib/providers/reddit";
import { xStartUrl } from "@/lib/providers/x";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };

function setupFor(provider: string) {
  return SOCIAL_SETUPS.find((setup) => setup.id === provider);
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { provider } = await context.params;
  if (!isSocialProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  const setup = setupFor(provider);
  const missing = setup ? missingEnv(setup.env) : [];
  if (missing.length > 0) {
    return sourcesRedirect({
      error: `Add ${missing.join(", ")} to .env and restart the dev server.`,
    });
  }
  try {
    switch (provider) {
      case "instagram":
        return NextResponse.redirect(instagramStartUrl());
      case "x":
        return NextResponse.redirect(xStartUrl());
      case "reddit":
        return NextResponse.redirect(redditStartUrl());
      case "linkedin":
        return NextResponse.redirect(linkedinStartUrl());
      case "bluesky":
        return sourcesRedirect({
          error: "Enter a Bluesky handle and use Connect.",
        });
      case "mastodon":
        return sourcesRedirect({
          error: "Enter a Mastodon instance and use Connect.",
        });
      default:
        return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
    }
  } catch (error) {
    return sourcesRedirect({
      error: errorMessage(error, "The connection could not be started"),
    });
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { provider } = await context.params;
  if (provider !== "bluesky" && provider !== "mastodon") {
    return NextResponse.json({ error: "Use the connect link" }, { status: 405 });
  }
  try {
    const body = (await request.json()) as { handle?: unknown; instance?: unknown };
    const redirectUrl =
      provider === "bluesky"
        ? await blueskyStartUrl(typeof body.handle === "string" ? body.handle : "")
        : await mastodonStartUrl(typeof body.instance === "string" ? body.instance : "");
    return NextResponse.json({ redirectUrl });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "The connection could not be started") },
      { status: 400 },
    );
  }
}
