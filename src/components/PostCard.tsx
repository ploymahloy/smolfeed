import { formatWhen } from "@/lib/text";
import type { Post } from "@/lib/types";

type PostCardProps = {
  post: Post;
};

export const PostCard = ({ post }: PostCardProps) => {
  const when = formatWhen(post.createdAt);
  return (
    <a
      className="card"
      href={post.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open post by ${post.authorName} on ${post.badge}`}
      data-provider={post.provider}
      data-source-key={post.sourceKey}
      data-source-label={post.sourceLabel}
    >
      <header className="card-meta">
        <span className="chip" data-provider={post.provider}>
          {post.badge}
        </span>
        {when ? <time dateTime={post.createdAt ?? undefined}>{when}</time> : null}
      </header>
      <p className="author">
        <span>{post.authorName}</span>
        {post.authorHandle && post.authorHandle !== post.authorName ? (
          <span className="handle">{post.authorHandle}</span>
        ) : null}
      </p>
      {post.text ? <p className="card-text">{post.text}</p> : null}
    </a>
  );
};
