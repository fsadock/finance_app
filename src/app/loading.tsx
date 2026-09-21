import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown instantly on navigation while a page queries its data (every page is rendered on request). */
export default function Loading() {
  return (
    <div role="status" aria-label="Carregando">
      <div className="mb-6 space-y-2 lg:mb-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="space-y-3 p-4 sm:p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-32 max-w-full" />
          </Card>
        ))}
      </div>
      <Card className="mt-4 space-y-3">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </Card>
    </div>
  );
}
