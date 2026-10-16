import { NextResponse } from "next/server";
import { deleteCategory } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  deleteCategory(id);
  return NextResponse.json({ ok: true });
}
