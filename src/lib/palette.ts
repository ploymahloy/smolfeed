export const PROVIDER_COLOR: Record<string, string> = {
  instagram: "#b83b7a",
  x: "#1c1915",
  reddit: "#d4531b",
  linkedin: "#0a66c2",
  bluesky: "#1d7fe0",
  mastodon: "#5b4dc7",
  rss: "#0f6e6b",
};

export function providerColor(provider: string): string {
  return PROVIDER_COLOR[provider] ?? "#6d655c";
}
