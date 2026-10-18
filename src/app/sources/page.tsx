import { Suspense } from "react";
import { SourcesScreen } from "@/components/SourcesScreen";

export default function SourcesPage() {
  return (
    <Suspense
      fallback={
        <div className="spinner-center" role="status">
          <span className="spinner" aria-hidden="true" />
          <span className="sr-only">Loading sources</span>
        </div>
      }
    >
      <SourcesScreen />
    </Suspense>
  );
}
