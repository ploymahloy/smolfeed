import { NextResponse } from "next/server";
import { createCategory } from "@/lib/db";
import { isCategoryKind } from "@/lib/types";
import { errorMessage, parseHttpUrl } from "@/lib/text";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      name?: unknown;
      kind?: unknown;
      urls?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > 60) {
      return NextResponse.json(
        { error: "Name the category in 60 characters or fewer" },
        { status: 400 },
      );
    }
    if (typeof body.kind !== "string" || !isCategoryKind(body.kind)) {
      return NextResponse.json({ error: "Choose a category kind" }, { status: 400 });
    }
    const urls = Array.isArray(body.urls) ? body.urls : [];
    const feeds = urls
      .filter((url): url is string => typeof url === "string")
      .map((url) => parseHttpUrl(url))
      .filter((url): url is string => Boolean(url))
      .slice(0, 12)
      .map((url) => ({
        url,
        title: new URL(url).hostname.replace(/^www\./, ""),
      }));
    if (feeds.length === 0) {
      return NextResponse.json(
        { error: "Add at least one http or https feed URL" },
        { status: 400 },
      );
    }
    const category = createCategory({ name, kind: body.kind, feeds });
    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "The category could not be saved") },
      { status: 400 },
    );
  }
}
