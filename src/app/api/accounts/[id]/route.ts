import { NextResponse } from "next/server";
import { deleteAccount, getAccount } from "@/lib/db";
import { revokeBluesky } from "@/lib/providers/bluesky";
import { errorMessage } from "@/lib/text";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const account = getAccount(id);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  try {
    if (account.provider === "bluesky") {
      await revokeBluesky(account.externalId);
    }
    deleteAccount(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "The account could not be removed") },
      { status: 500 },
    );
  }
}
