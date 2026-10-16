import { createHash, randomBytes } from "node:crypto";
import { updateAccountTokens, type TokenUpdate } from "@/lib/db";
import type { Account } from "@/lib/types";
import { tokenBundle, type TokenBundle } from "@/lib/providers/http";

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function ensureFreshToken(
  account: Account,
  refresh: (refreshToken: string, account: Account) => Promise<TokenBundle>,
  leadMs = 60_000,
): Promise<Account> {
  if (!account.accessToken) return account;
  const expiresAt = account.tokenExpiresAt;
  if (expiresAt == null || expiresAt - Date.now() > leadMs) return account;
  if (!account.refreshToken) {
    throw new Error(`${account.displayName} needs to be connected again`);
  }
  const next = await refresh(account.refreshToken, account);
  const update: TokenUpdate = {
    accessToken: next.accessToken,
    refreshToken: next.refreshToken,
    expiresAt: next.expiresAt,
  };
  return updateAccountTokens(account.id, update);
}

export { tokenBundle };
