"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-center">
      <div className="text-6xl font-black text-red-500/30 tracking-tighter">
        ERROR
      </div>
      <h1 className="text-xl font-bold text-white mt-4 uppercase tracking-widest">
        System Malfunction
      </h1>
      <p className="text-neutral-500 text-sm mt-2 max-w-md">
        An unexpected error occurred. Our diagnostics have been notified.
      </p>
      <button
        onClick={reset}
        className="mt-8 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs tracking-widest rounded-lg transition-all cursor-pointer"
      >
        RETRY OPERATION
      </button>
    </div>
  );
}
