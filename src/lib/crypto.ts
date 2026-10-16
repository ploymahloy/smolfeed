import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (fromEnv) {
    cachedKey = scryptSync(fromEnv, "smolfeed-token-v1", 32);
    return cachedKey;
  }
  const file = path.join(process.cwd(), "data", "token.key");
  mkdirSync(path.dirname(file), { recursive: true });
  if (!existsSync(file)) {
    writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  const raw = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
  if (raw.length !== 32) {
    throw new Error("data/token.key must contain 32 bytes of base64");
  }
  cachedKey = raw;
  return cachedKey;
}

export function encryptString(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString("base64url");
}

export function decryptString(payload: string): string {
  const buf = Buffer.from(payload, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const body = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    "utf8",
  );
}
