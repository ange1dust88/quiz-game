// Streamed by Next.js while the match server component is fetching the
// profile + verifying the PlayerInGame row. Shown for ~50-300ms after the
// redirect from the lobby — long enough that a blank page would feel like
// nothing happened.

import Spinner from "@/app/components/ui/Spinner";

export default function MatchLoading() {
  return (
    <div className="min-h-screen bg-canvas text-white flex flex-col items-center justify-center gap-4">
      <Spinner size={40} />
      <span className="font-mono text-sm text-mute">Preparing match…</span>
    </div>
  );
}
