"use client";

import { useEffect } from "react";

export default function CommandCenterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[CommandCenterError]", error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-5xl font-black text-red-500/30 tracking-tighter">
        ERROR
      </div>
      <h2 className="text-lg font-bold text-white mt-4 uppercase tracking-widest">
        Module Failure
      </h2>
      <p className="text-neutral-500 text-sm mt-2 max-w-sm">
        This section encountered an unexpected error.
      </p>
      <button
        onClick={reset}
        className="mt-6 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs tracking-widest rounded-lg transition-all cursor-pointer"
      >
        RETRY
      </button>
    </div>
  );
}
