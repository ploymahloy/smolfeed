import { listAccounts, listCategories } from "@/lib/db";
import { weave } from "@/lib/feed/weave";
import { fetchBluesky } from "@/lib/providers/bluesky";
import { fetchInstagram } from "@/lib/providers/instagram";
import { fetchLinkedIn } from "@/lib/providers/linkedin";
import { fetchMastodon } from "@/lib/providers/mastodon";
import { fetchReddit } from "@/lib/providers/reddit";
import { fetchRss } from "@/lib/providers/rss";
import { fetchX } from "@/lib/providers/x";
import type { Account, FetchBucket, Post, SourceNotice } from "@/lib/types";

async function fetchAccount(account: Account): Promise<FetchBucket> {
  switch (account.provider) {
    case "instagram":
      return fetchInstagram(account);
    case "x":
      return fetchX(account);
    case "reddit":
      return fetchReddit(account);
    case "linkedin":
      return fetchLinkedIn(account);
    case "bluesky":
      return fetchBluesky(account);
    case "mastodon":
      return fetchMastodon(account);
    default:
      return { posts: [], notices: [] };
  }
}

export async function loadFeed(): Promise<{
  posts: Post[];
  notices: SourceNotice[];
}> {
  const accounts = listAccounts();
  const categories = listCategories();
  const jobs: Promise<FetchBucket>[] = accounts.map((account) => fetchAccount(account));
  for (const category of categories) {
    for (const feed of category.feeds) {
      jobs.push(fetchRss(feed, category));
    }
  }
  const buckets = await Promise.all(jobs);
  return {
    posts: weave(buckets.map((bucket) => bucket.posts)),
    notices: buckets.flatMap((bucket) => bucket.notices),
  };
}
