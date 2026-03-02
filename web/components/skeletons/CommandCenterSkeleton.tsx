import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic skeleton for standard command-center pages with a header + grid layout.
 */
export function CommandCenterSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 bg-neutral-800" />
          <Skeleton className="h-4 w-64 bg-neutral-800/60" />
        </div>
        <Skeleton className="h-10 w-36 bg-neutral-800 rounded-md" />
      </div>
      {/* Content grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 bg-neutral-800/40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
