"use client";

// Header search input with debounced player-nickname lookup. Hits
// /api/search/players (returns up to 8 profiles) and shows a dropdown
// of results — avatar + level hex + nickname + flag + ELO, each row a
// link to that player's profile. Keyboard nav with arrow keys + Enter.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/app/components/ui/Avatar";
import Hexagon from "@/app/components/ui/Hexagon";
import FlagTag from "@/app/components/ui/FlagTag";

type Result = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  level: number;
  elo: number;
  country: string | null;
};

const DEBOUNCE_MS = 200;

export default function PlayerSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  // Debounced fetch — every keystroke schedules a request, latest one
  // wins (a stale response can't overwrite newer results thanks to the
  // cancelled flag).
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/search/players?q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const data = (await r.json()) as { results: Result[] };
        if (!cancelled) {
          setResults(data.results);
          setHighlight(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Outside click → close
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlight];
      if (r) {
        router.push(`/profile/${encodeURIComponent(r.nickname)}`);
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-2 bg-panel border border-stroke px-3 py-1.5 w-[220px]">
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search players…"
          autoComplete="off"
          spellCheck={false}
          className="bg-transparent text-xs text-white placeholder:text-dim outline-none flex-1 font-mono"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="font-mono text-xs text-dim hover:text-mute"
            title="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full mt-1 bg-surface border border-stroke z-50 shadow-xl shadow-black/60 max-h-[360px] overflow-y-auto"
          style={{ borderTop: "3px solid var(--color-accent)" }}
        >
          {loading && results.length === 0 ? (
            <p className="font-mono text-[11px] text-dim px-3 py-4 text-center">
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="font-mono text-[11px] text-dim px-3 py-4 text-center">
              No players found.
            </p>
          ) : (
            results.map((r, idx) => (
              <Link
                key={r.id}
                href={`/profile/${encodeURIComponent(r.nickname)}`}
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                }}
                onMouseEnter={() => setHighlight(idx)}
                className="grid grid-cols-[28px_1fr_auto] items-center gap-2.5 px-3 py-2 border-t border-stroke first:border-t-0 transition-colors"
                style={{
                  background:
                    idx === highlight
                      ? "var(--color-surface-hi)"
                      : "transparent",
                }}
              >
                <Hexagon
                  value={r.level}
                  size={26}
                  variant="outlined"
                  color="var(--color-accent)"
                  textColor="var(--color-accent)"
                />
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar
                    nickname={r.nickname}
                    avatarUrl={r.avatarUrl}
                    size={28}
                    shape="square"
                  />
                  <div className="min-w-0 flex flex-col leading-tight">
                    <span className="font-head text-xs text-white truncate">
                      {r.nickname.toUpperCase()}
                    </span>
                    <FlagTag code={r.country} />
                  </div>
                </div>
                <span className="font-mono text-[11px] text-mute font-bold">
                  {r.elo.toLocaleString()}
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="11"
        cy="11"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-dim"
      />
      <line
        x1="20"
        y1="20"
        x2="16.5"
        y2="16.5"
        stroke="currentColor"
        strokeWidth="2"
        className="text-dim"
      />
    </svg>
  );
}
