// Shown by Next while the lobby server component loads the session +
// players + match choices from Postgres.

import Spinner from "@/app/components/ui/Spinner";

export default function LobbyLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)] text-white flex flex-col items-center justify-center gap-4">
      <Spinner size={40} />
      <span className="text-sm text-gray-400">Loading lobby…</span>
    </div>
  );
}
