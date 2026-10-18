export const PostCardSkeleton = () => (
  <div className="card card-skeleton" aria-hidden="true">
    <div className="card-meta">
      <span className="skeleton skeleton-chip" />
      <span className="skeleton skeleton-source" />
      <span className="skeleton skeleton-time" />
    </div>
    <span className="skeleton skeleton-author" />
    <span className="skeleton skeleton-line" />
    <span className="skeleton skeleton-line" />
    <span className="skeleton skeleton-line" style={{ width: "60%" }} />
  </div>
);
