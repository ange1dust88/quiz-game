"use client";

// Q-coin chip in the header + modal explaining how the currency works.
// The chip is a clickable button; tapping it opens a centered modal
// listing the balance and the ways to earn more. Spending sinks aren't
// built yet — modal copy reflects that.
//
// Polling: the chip self-syncs every POLL_INTERVAL_MS so coins credited
// in the background (match end, daily mission completion, achievement
// unlock) reflect without forcing a navigation. Also re-fetches on
// `visibilitychange` so coins appear instantly when the user tabs back
// in after a match.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  coins: number;
};

const POLL_INTERVAL_MS = 12_000;

export default function CoinPurse({ coins: initialCoins }: Props) {
  const [open, setOpen] = useState(false);
  const [coins, setCoins] = useState(initialCoins);
  // If the server-rendered initial value changes (e.g. layout
  // re-renders on navigation), prefer the fresh server value over our
  // stale state — both numbers come from the same DB column.
  useEffect(() => {
    setCoins(initialCoins);
  }, [initialCoins]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/me/coins", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { coins: number };
        if (!cancelled && typeof data.coins === "number") {
          setCoins(data.coins);
        }
      } catch {
        // network blip — next tick will retry
      }
    };
    const t = setInterval(load, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Lock body scroll while the modal is up; close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 hover:bg-surface-hi transition-colors px-2 py-1 cursor-pointer"
        title="Your Q-coins"
      >
        <CoinIcon />
        <span className="text-sm font-bold font-mono text-gold">
          {coins.toLocaleString()}
        </span>
      </button>

      {open && <CoinModal coins={coins} onClose={() => setOpen(false)} />}
    </>
  );
}

function CoinModal({
  coins,
  onClose,
}: {
  coins: number;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coin-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes coin-modal-in {
          0%   { opacity: 0; transform: scale(0.94) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .coin-modal-card { animation: coin-modal-in 0.2s ease-out forwards; }
      `}</style>
      <div
        className="coin-modal-card w-full max-w-md bg-surface border border-stroke shadow-2xl shadow-black/80 flex flex-col"
        style={{ borderTop: "4px solid var(--color-gold)" }}
      >
        <header className="px-6 py-5 border-b border-stroke flex items-center gap-4">
          <BigCoinIcon />
          <div className="flex-1 min-w-0">
            <span className="font-head text-xs text-gold">Your balance</span>
            <h2
              id="coin-modal-title"
              className="font-head text-4xl text-white leading-none mt-1"
            >
              {coins.toLocaleString()}
              <span className="text-gold ml-2">Q</span>
            </h2>
          </div>
        </header>

        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="font-body text-sm text-mute leading-relaxed">
            Q-coins are the in-game soft currency. You can&apos;t buy
            anything with them yet — the shop ships with the next
            update.
          </p>

          <div className="flex flex-col gap-2.5">
            <span className="font-head text-[11px] text-dim">
              How to earn
            </span>
            <EarnRow
              icon="↑"
              title="Level up"
              detail="A flat reward each time your XP bar fills."
              accent="var(--color-accent)"
            />
            <EarnRow
              icon="◎"
              title="Daily missions"
              detail="Three rotating goals on the dashboard — refresh every 24h."
              accent="var(--color-blue2)"
            />
            <EarnRow
              icon="★"
              title="Achievements"
              detail="One-off payouts when you cross a milestone (matches played, win streaks, ELO tiers)."
              accent="var(--color-gold)"
            />
          </div>
        </div>

        <div className="border-t border-stroke">
          <button
            type="button"
            onClick={onClose}
            className="w-full font-head text-sm text-mute hover:text-white hover:bg-surface-hi px-5 py-3.5 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EarnRow({
  icon,
  title,
  detail,
  accent,
}: {
  icon: string;
  title: string;
  detail: string;
  accent: string;
}) {
  return (
    <div className="flex items-start gap-3 bg-panel border border-stroke px-3 py-2.5">
      <span
        className="font-head text-base shrink-0 w-6 text-center"
        style={{ color: accent }}
        aria-hidden
      >
        {icon}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-head text-xs text-white">{title}</span>
        <span className="font-body text-[11px] text-mute leading-relaxed">
          {detail}
        </span>
      </div>
    </div>
  );
}

function CoinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="#ffc24a"
        strokeWidth="2"
      />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fill="#ffc24a"
        fontSize="11"
        fontWeight="800"
      >
        Q
      </text>
    </svg>
  );
}

function BigCoinIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="rgba(255,194,74,0.12)"
        stroke="#ffc24a"
        strokeWidth="1.5"
      />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fill="#ffc24a"
        fontSize="12"
        fontWeight="800"
      >
        Q
      </text>
    </svg>
  );
}
