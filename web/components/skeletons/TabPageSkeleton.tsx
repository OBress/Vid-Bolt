import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton for tab-based pages (admin, settings) with a tab bar + content area.
 */
export function TabPageSkeleton() {
  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="border-b border-neutral-800 bg-neutral-900/50 px-6 py-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-1 bg-orange-500/40 rounded-full" />
          <Skeleton className="h-6 w-32 bg-neutral-800" />
          <div className="flex gap-2 ml-auto">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-9 w-24 bg-neutral-800 rounded-lg"
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 bg-neutral-800/40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
