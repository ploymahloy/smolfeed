import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";
import { parseLimitMinutes } from "@/lib/limits";
export const dynamic = "force-dynamic";

const SOURCE_KEY = /^(account|category):[0-9a-f-]{36}$/i;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getSettings());
}

export async function PUT(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    sessionLimitMinutes?: unknown;
    sourceLimits?: unknown;
  };
  const patch: {
    sessionLimitMinutes?: number | null;
    sourceLimits?: { sourceKey: string; limitMinutes: number | null }[];
  } = {};

  if ("sessionLimitMinutes" in body) {
    if (body.sessionLimitMinutes == null || body.sessionLimitMinutes === "") {
      patch.sessionLimitMinutes = null;
    } else {
      const minutes = parseLimitMinutes(body.sessionLimitMinutes);
      if (minutes == null) {
        return NextResponse.json(
          { error: "Session limit must be a whole number of minutes from 1 to 1440" },
          { status: 400 },
        );
      }
      patch.sessionLimitMinutes = minutes;
    }
  }

  if ("sourceLimits" in body) {
    if (!Array.isArray(body.sourceLimits)) {
      return NextResponse.json({ error: "Source limits must be a list" }, { status: 400 });
    }
    const sourceLimits: { sourceKey: string; limitMinutes: number | null }[] = [];
    for (const entry of body.sourceLimits) {
      if (!entry || typeof entry !== "object") {
        return NextResponse.json({ error: "A source limit is malformed" }, { status: 400 });
      }
      const sourceKey = "sourceKey" in entry ? entry.sourceKey : undefined;
      const limitMinutes = "limitMinutes" in entry ? entry.limitMinutes : undefined;
      if (typeof sourceKey !== "string" || !SOURCE_KEY.test(sourceKey)) {
        return NextResponse.json({ error: "A source limit is missing its source" }, { status: 400 });
      }
      if (limitMinutes == null || limitMinutes === "") {
        sourceLimits.push({ sourceKey, limitMinutes: null });
        continue;
      }
      const minutes = parseLimitMinutes(limitMinutes);
      if (minutes == null) {
        return NextResponse.json(
          { error: "Each source limit must be a whole number of minutes from 1 to 1440" },
          { status: 400 },
        );
      }
      sourceLimits.push({ sourceKey, limitMinutes: minutes });
    }
    patch.sourceLimits = sourceLimits;
  }

  return NextResponse.json(saveSettings(patch));
}
