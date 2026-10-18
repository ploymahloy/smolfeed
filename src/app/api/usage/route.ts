import { NextResponse } from "next/server";
import { recordUsage } from "@/lib/db";
import type { ProviderId } from "@/lib/types";

export const dynamic = "force-dynamic";

const PROVIDERS = new Set<ProviderId>([
  "instagram",
  "x",
  "reddit",
  "linkedin",
  "bluesky",
  "mastodon",
  "rss",
]);
const SOURCE_KEY = /^(account|category|feed):[0-9a-f-]{36}$/i;
const SESSION_ID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    sessionId?: unknown;
    startedAt?: unknown;
    elapsedSeconds?: unknown;
    paused?: unknown;
    samples?: unknown;
  };
  if (typeof body.sessionId !== "string" || !SESSION_ID.test(body.sessionId)) {
    return NextResponse.json({ error: "Session id is invalid" }, { status: 400 });
  }
  if (typeof body.startedAt !== "number" || body.startedAt <= 0) {
    return NextResponse.json({ error: "Session start is invalid" }, { status: 400 });
  }
  if (
    typeof body.elapsedSeconds !== "number" ||
    body.elapsedSeconds < 0 ||
    body.elapsedSeconds > 24 * 60 * 60
  ) {
    return NextResponse.json({ error: "Elapsed time is invalid" }, { status: 400 });
  }
  if (typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "Paused must be true or false" }, { status: 400 });
  }
  if (!Array.isArray(body.samples) || body.samples.length > 20) {
    return NextResponse.json({ error: "Usage samples are invalid" }, { status: 400 });
  }
  const samples: {
    sourceKey: string;
    sourceLabel: string;
    provider: string;
    seconds: number;
  }[] = [];
  for (const sample of body.samples) {
    if (!sample || typeof sample !== "object") {
      return NextResponse.json({ error: "A usage sample is malformed" }, { status: 400 });
    }
    const sourceKey = "sourceKey" in sample ? sample.sourceKey : undefined;
    const sourceLabel = "sourceLabel" in sample ? sample.sourceLabel : undefined;
    const provider = "provider" in sample ? sample.provider : undefined;
    const seconds = "seconds" in sample ? sample.seconds : undefined;
    if (typeof sourceKey !== "string" || !SOURCE_KEY.test(sourceKey)) {
      return NextResponse.json({ error: "A usage sample is missing its source" }, { status: 400 });
    }
    if (typeof sourceLabel !== "string" || sourceLabel.length < 1 || sourceLabel.length > 80) {
      return NextResponse.json({ error: "A usage sample is missing its label" }, { status: 400 });
    }
    if (typeof provider !== "string" || !PROVIDERS.has(provider as ProviderId)) {
      return NextResponse.json({ error: "A usage sample has an unknown provider" }, { status: 400 });
    }
    if (typeof seconds !== "number" || seconds < 1 || seconds > 60) {
      return NextResponse.json({ error: "A usage sample has an invalid duration" }, { status: 400 });
    }
    samples.push({
      sourceKey,
      sourceLabel: sourceLabel.trim(),
      provider,
      seconds: Math.floor(seconds),
    });
  }
  recordUsage({
    sessionId: body.sessionId,
    startedAt: body.startedAt,
    elapsedSeconds: Math.floor(body.elapsedSeconds),
    paused: body.paused,
    samples,
  });
  return NextResponse.json({ ok: true });
}
