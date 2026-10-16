import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/env";

export function sourcesRedirect(params: Record<string, string>): NextResponse {
  const url = new URL("/sources", appOrigin());
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}
