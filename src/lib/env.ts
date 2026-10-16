import type { SocialProviderId } from "@/lib/types";

export type ProviderSetup = {
  id: SocialProviderId;
  label: string;
  hint: string;
  env: string[];
};

export const SOCIAL_SETUPS: ProviderSetup[] = [
  {
    id: "instagram",
    label: "Instagram",
    hint: "Reads the posts published on your account.",
    env: ["META_APP_ID", "META_APP_SECRET"],
  },
  {
    id: "x",
    label: "X",
    hint: "Reads your home timeline. The X API bills per read.",
    env: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  },
  {
    id: "reddit",
    label: "Reddit",
    hint: "Reads the front page of communities you subscribe to.",
    env: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    hint: "Connects your profile. Your posts appear when LinkedIn grants read access.",
    env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  },
  {
    id: "bluesky",
    label: "Bluesky",
    hint: "Reads your following timeline. Enter your handle to connect.",
    env: [],
  },
  {
    id: "mastodon",
    label: "Mastodon",
    hint: "Reads your home timeline. Enter the instance host, such as mastodon.social.",
    env: [],
  },
];

export function missingEnv(names: string[]): string[] {
  return names.filter((name) => !process.env[name]?.trim());
}

export function appOrigin(): string {
  const raw = process.env.APP_URL?.trim() || "http://127.0.0.1:3000";
  const url = new URL(raw);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin;
}

export function callbackUrl(provider: SocialProviderId): string {
  return `${appOrigin()}/api/auth/${provider}/callback`;
}

export function envValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
