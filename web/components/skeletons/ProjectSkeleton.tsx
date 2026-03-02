import { Skeleton } from "@/components/ui/skeleton";

/**
 * Heavy skeleton for the media project page with a header, main content area, and sidebar.
 */
export function ProjectSkeleton() {
  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="border-b border-neutral-800 bg-neutral-900/50 px-6 py-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-1 bg-orange-500/40 rounded-full" />
          <Skeleton className="h-6 w-48 bg-neutral-800" />
          <div className="flex gap-2 ml-auto">
            <Skeleton className="h-9 w-20 bg-neutral-800 rounded-lg" />
            <Skeleton className="h-9 w-20 bg-neutral-800 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-64 bg-neutral-800/40 rounded-xl" />
          <Skeleton className="h-32 bg-neutral-800/40 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 bg-neutral-800/40 rounded-xl" />
          <Skeleton className="h-24 bg-neutral-800/40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
