import { formatWhen } from "@/lib/text";
import type { Post } from "@/lib/types";

export function PostCard({ post }: { post: Post }) {
  const when = formatWhen(post.createdAt);
  return (
    <article
      className="card"
      data-provider={post.provider}
      data-source-key={post.sourceKey}
      data-source-label={post.sourceLabel}
    >
      <header className="card-meta">
        <span className="chip" data-provider={post.provider}>
          {post.badge}
        </span>
        <span className="source-name">{post.sourceLabel}</span>
        {when ? <time dateTime={post.createdAt ?? undefined}>{when}</time> : null}
      </header>
      <p className="author">
        <span>{post.authorName}</span>
        {post.authorHandle && post.authorHandle !== post.authorName ? (
          <span className="handle">{post.authorHandle}</span>
        ) : null}
      </p>
      {post.text ? <p className="card-text">{post.text}</p> : null}
      {post.mediaUrls.length > 0 ? (
        <div className={post.mediaUrls.length > 1 ? "media grid" : "media"}>
          {post.mediaUrls.map((url) => (
            // Remote feeds use arbitrary image hosts, so a plain img keeps them visible.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" />
          ))}
        </div>
      ) : null}
      <a className="open" href={post.url} target="_blank" rel="noreferrer">
        Open
      </a>
    </article>
  );
}
