"use client";

import { useState } from "react";
import { devSkipStage } from "./actions";

type Props = {
  sessionId: string;
};

export default function DevPanel({ sessionId }: Props) {
  const [busy, setBusy] = useState(false);

  if (process.env.NODE_ENV === "production") return null;

  const skip = async (target: "expand" | "war") => {
    if (busy) return;
    setBusy(true);
    try {
      await devSkipStage(sessionId, target);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-yellow-400/10 border border-yellow-400/40 rounded-md px-3 py-2 flex items-center gap-2 text-xs">
      <span className="uppercase tracking-widest text-yellow-300 font-bold">
        Dev
      </span>
      <button
        onClick={() => skip("expand")}
        disabled={busy}
        className="bg-yellow-400/20 hover:bg-yellow-400/30 disabled:opacity-50 transition-colors px-2 py-1 rounded text-yellow-100 font-semibold"
      >
        → Expand
      </button>
      <button
        onClick={() => skip("war")}
        disabled={busy}
        className="bg-yellow-400/20 hover:bg-yellow-400/30 disabled:opacity-50 transition-colors px-2 py-1 rounded text-yellow-100 font-semibold"
      >
        → War
      </button>
    </div>
  );
}
