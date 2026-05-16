// Placeholder for the dedicated /play queue page. The dashboard's "Play
// now" button covers the actual create-room flow today — this route is
// reserved for a future ranked solo queue.

import Link from "next/link";

export default function PlayPlaceholder() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 text-white">
      <div className="max-w-md w-full text-center flex flex-col gap-4 bg-[#0d1117] border border-[#1f2230] rounded-2xl p-8">
        <span className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">
          Coming soon
        </span>
        <h1 className="text-2xl font-bold">Play queue</h1>
        <p className="text-sm text-gray-400">
          A dedicated ranked solo queue with auto-matchmaking by ELO will
          live here. For now use the dashboard to host or join custom
          rooms.
        </p>
        <Link
          href="/dashboard"
          className="text-sm bg-blue-500 hover:bg-blue-400 transition-colors text-white px-5 py-2 rounded-md font-semibold w-fit mx-auto"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
