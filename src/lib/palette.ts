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

// Chart colors for individual sources. They stay inside the app's warm paper
// palette, and each has at least 4.5:1 contrast against the card background
// (#fffdf8), above the 3:1 WCAG 1.4.11 minimum for graphical objects.
export const SOURCE_PALETTE = [
  "#0f6e6b", // teal 5.97
  "#c2410c", // rust 5.09
  "#b83b7a", // magenta 5.24
  "#0a66c2", // blue 5.59
  "#5b4dc7", // purple 6.20
  "#8a6a0a", // ochre 4.98
  "#4d7c0f", // green 4.91
  "#4a5d78", // slate 6.60
  "#a8322d", // brick 6.54
  "#7a3b6e", // plum 7.71
] as const;

export type SourceColor = {
  color: string;
  // Sources past the end of the palette reuse a color with a hatch overlay so
  // they stay distinguishable without relying on hue alone.
  hatched: boolean;
};

// Assigns colors by sorted source key so a source keeps its color between
// loads unless a new source appears.
export function sourceColors(keys: Iterable<string>): Map<string, SourceColor> {
  const sorted = [...new Set(keys)].sort();
  const colors = new Map<string, SourceColor>();
  sorted.forEach((key, index) => {
    colors.set(key, {
      color: SOURCE_PALETTE[index % SOURCE_PALETTE.length] as string,
      hatched: index >= SOURCE_PALETTE.length,
    });
  });
  return colors;
}
