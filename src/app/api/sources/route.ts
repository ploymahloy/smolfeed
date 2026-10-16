import { NextResponse } from "next/server";
import { appOrigin, missingEnv, SOCIAL_SETUPS } from "@/lib/env";
import { getSettings, listAccounts, listCategories } from "@/lib/db";
import { publicAccount } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const accounts = listAccounts().map(publicAccount);
  const origin = appOrigin();
  return NextResponse.json({
    origin,
    redirectPath: "/api/auth/{provider}/callback",
    providers: SOCIAL_SETUPS.map((setup) => ({
      id: setup.id,
      label: setup.label,
      hint: setup.hint,
      missing: missingEnv(setup.env),
      accounts: accounts.filter((account) => account.provider === setup.id),
    })),
    categories: listCategories(),
    settings: getSettings(),
  });
}
