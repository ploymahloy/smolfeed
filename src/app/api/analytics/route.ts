import { NextResponse } from "next/server";
import { buildAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(buildAnalytics());
}
