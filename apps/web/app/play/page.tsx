// Placeholder for the dedicated /play queue page. The dashboard's "Play
// now" button covers the actual create-room flow today — this route is
// reserved for a future solo queue with auto-matchmaking.

import PlaceholderPanel from "@/app/components/ui/PlaceholderPanel";

export default function PlayPlaceholder() {
  return (
    <PlaceholderPanel
      title="Play queue"
      description="A dedicated solo queue with auto-matchmaking by ELO will live here. For now use the dashboard to host or join custom rooms."
      accent="#1ed3ff"
    />
  );
}
