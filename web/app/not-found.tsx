import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-center">
      <div className="text-8xl font-black text-neutral-800 tracking-tighter">
        404
      </div>
      <h1 className="text-xl font-bold text-white mt-4 uppercase tracking-widest">
        Route Not Found
      </h1>
      <p className="text-neutral-500 text-sm mt-2 max-w-md">
        The requested resource does not exist in this operational theater.
      </p>
      <Link
        href="/command-center"
        className="mt-8 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs tracking-widest rounded-lg transition-all"
      >
        RETURN TO COMMAND CENTER
      </Link>
    </div>
  );
}
