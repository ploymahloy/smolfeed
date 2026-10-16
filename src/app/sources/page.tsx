import { Suspense } from "react";
import { SourcesScreen } from "@/components/SourcesScreen";

export default function SourcesPage() {
  return (
    <Suspense fallback={<p className="status">Loading sources…</p>}>
      <SourcesScreen />
    </Suspense>
  );
}
