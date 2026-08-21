// Shared route-level loading state (used by every loading.tsx). A
// centred spinner + label on the app canvas so navigation always gives
// immediate feedback instead of a frozen click.

import Spinner from "./Spinner";

export default function RouteLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-canvas text-white flex flex-col items-center justify-center gap-3">
      <Spinner size={28} />
      <span className="font-head text-[11px] text-dim tracking-widest">
        {label.toUpperCase()}…
      </span>
    </div>
  );
}
