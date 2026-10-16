import { NextResponse } from "next/server";
import { loadFeed } from "@/lib/feed/load";
import { errorMessage } from "@/lib/text";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const feed = await loadFeed();
    return NextResponse.json(feed);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "The feed could not be loaded") },
      { status: 500 },
    );
  }
}
