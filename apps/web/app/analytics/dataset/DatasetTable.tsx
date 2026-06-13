"use client";

// Wide research data table: one row per player, grouped columns
// (demographics / psychometrics / progression / behaviour). Supports a
// nickname filter, click-to-sort on any column, and a one-click CSV
// export of the (filtered) dataset. The first column is sticky so the
// player stays visible while scrolling the wide matrix horizontally.

import { useMemo, useState } from "react";

export type DatasetRow = {
  profileId: string;
  nickname: string;
  age: number | null;
  gender: string | null;
  country: string | null;
  city: string | null;
  education: string | null;
  occupation: string | null;
  mbti: string | null;
  iq: number | null;
  traits: string[];
  level: number;
  elo: number;
  coins: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  matches: number;
  warAccuracy: number | null;
  attackerAccuracy: number | null;
  defenderAccuracy: number | null;
  numericCloseness: number | null;
  avgThinkMs: number | null;
  avgHesitation: number | null;
  riskAppetite: number | null;
  aggression: number | null;
  autoPickRate: number | null;
  giantSlayerRate: number | null;
  bullyRate: number | null;
  capitalAggression: number | null;
  targetStrength: number | null;
  deliberateAttacks: number;
  warAnswers: number;
  numericAnswers: number;
  joined: string;
};

type Col = {
  key: keyof DatasetRow;
  label: string;
  group: string;
  // For CSV + sort: how to read the comparable / serialisable value.
  num?: boolean;
};

const COLS: Col[] = [
  { key: "nickname", label: "Player", group: "" },
  { key: "age", label: "Age", group: "Demographics", num: true },
  { key: "gender", label: "Gender", group: "Demographics" },
  { key: "country", label: "Country", group: "Demographics" },
  { key: "city", label: "City", group: "Demographics" },
  { key: "education", label: "Education", group: "Demographics" },
  { key: "occupation", label: "Occupation", group: "Demographics" },
  { key: "mbti", label: "MBTI", group: "Psychometrics" },
  { key: "iq", label: "IQ", group: "Psychometrics", num: true },
  { key: "traits", label: "Traits", group: "Psychometrics" },
  { key: "level", label: "Lvl", group: "Progression", num: true },
  { key: "elo", label: "ELO", group: "Progression", num: true },
  { key: "coins", label: "Coins", group: "Progression", num: true },
  { key: "gamesPlayed", label: "Games", group: "Progression", num: true },
  { key: "winRate", label: "Win%", group: "Progression", num: true },
  { key: "matches", label: "Matches", group: "Behaviour", num: true },
  { key: "warAccuracy", label: "War%", group: "Behaviour", num: true },
  { key: "attackerAccuracy", label: "Atk%", group: "Behaviour", num: true },
  { key: "defenderAccuracy", label: "Def%", group: "Behaviour", num: true },
  { key: "numericCloseness", label: "Numeric%", group: "Behaviour", num: true },
  { key: "avgThinkMs", label: "Think ms", group: "Behaviour", num: true },
  { key: "avgHesitation", label: "Hesit.", group: "Behaviour", num: true },
  { key: "riskAppetite", label: "Risk%", group: "Behaviour", num: true },
  { key: "aggression", label: "Aggr.", group: "Behaviour", num: true },
  { key: "autoPickRate", label: "Auto%", group: "Behaviour", num: true },
  { key: "giantSlayerRate", label: "Slayer%", group: "Targeting", num: true },
  { key: "bullyRate", label: "Bully%", group: "Targeting", num: true },
  { key: "capitalAggression", label: "CapAggr%", group: "Targeting", num: true },
  { key: "targetStrength", label: "TgtStr%", group: "Targeting", num: true },
  { key: "deliberateAttacks", label: "nAtk", group: "Targeting", num: true },
  { key: "warAnswers", label: "nWar", group: "Behaviour", num: true },
  { key: "numericAnswers", label: "nNum", group: "Behaviour", num: true },
  { key: "joined", label: "Joined", group: "Meta" },
];

const GROUP_COLOR: Record<string, string> = {
  Demographics: "var(--color-purple2)",
  Psychometrics: "var(--color-blue2)",
  Progression: "var(--color-gold)",
  Behaviour: "var(--color-accent)",
  Targeting: "var(--color-lose)",
  Meta: "var(--color-mute)",
  "": "var(--color-mute)",
};

function cell(row: DatasetRow, key: keyof DatasetRow): string {
  const v = row[key];
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join("; ");
  return String(v);
}

function toCsv(rows: DatasetRow[]): string {
  const esc = (s: string) =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const header = COLS.map((c) => esc(c.label)).join(",");
  const body = rows
    .map((r) => COLS.map((c) => esc(cell(r, c.key))).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

export default function DatasetTable({ rows }: { rows: DatasetRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<keyof DatasetRow>("elo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => r.nickname.toLowerCase().includes(q))
      : rows;
    const col = COLS.find((c) => c.key === sortKey);
    const sorted = [...base].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // nulls always sort last.
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      let cmp: number;
      if (col?.num) cmp = Number(av) - Number(bv);
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, query, sortKey, sortDir]);

  // Coverage — how much of the high-signal psychometric data is filled.
  const coverage = useMemo(() => {
    const total = rows.length || 1;
    const has = (pred: (r: DatasetRow) => boolean) =>
      Math.round((rows.filter(pred).length / total) * 100);
    return {
      mbti: has((r) => Boolean(r.mbti)),
      iq: has((r) => r.iq !== null),
      age: has((r) => r.age !== null),
      traits: has((r) => r.traits.length > 0),
      behaviour: has((r) => r.matches > 0),
    };
  }, [rows]);

  const onSort = (key: keyof DatasetRow) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const downloadCsv = () => {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `europequiz-dataset-${filtered.length}players.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by nickname…"
          className="bg-canvas border border-stroke focus:border-accent focus:outline-none px-3 py-2 font-mono text-xs text-white placeholder:text-dim w-56"
        />
        <span className="font-mono text-[11px] text-dim">
          {filtered.length} / {rows.length} players
        </span>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <CoverageChip label="MBTI" pct={coverage.mbti} />
          <CoverageChip label="IQ" pct={coverage.iq} />
          <CoverageChip label="Age" pct={coverage.age} />
          <CoverageChip label="Traits" pct={coverage.traits} />
          <CoverageChip label="Played" pct={coverage.behaviour} />
          <button
            type="button"
            onClick={downloadCsv}
            className="font-head text-[11px] font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-4 py-2"
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-stroke overflow-x-auto bg-surface">
        <table className="border-collapse min-w-full">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  className={`text-left px-2.5 py-2 border-b border-stroke font-head text-[10px] whitespace-nowrap cursor-pointer select-none hover:bg-surface-hi transition-colors ${
                    c.key === "nickname"
                      ? "sticky left-0 bg-panel z-10"
                      : "bg-panel"
                  }`}
                  style={{ color: GROUP_COLOR[c.group] }}
                  title={c.group ? `${c.group} · click to sort` : "click to sort"}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="text-white ml-1">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={COLS.length}
                  className="px-4 py-8 text-center font-body text-sm text-dim"
                >
                  No players match the filter.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.profileId}
                  className="border-b border-stroke hover:bg-surface-hi transition-colors"
                >
                  {COLS.map((c) => {
                    const raw = cell(r, c.key);
                    const isName = c.key === "nickname";
                    return (
                      <td
                        key={c.key}
                        className={`px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap ${
                          isName
                            ? "sticky left-0 bg-surface z-10 font-head text-white"
                            : raw === ""
                              ? "text-dim"
                              : "text-mute"
                        }`}
                        title={c.group === "Psychometrics" ? raw : undefined}
                      >
                        {raw === "" ? "·" : raw}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[10px] text-dim leading-relaxed">
        Behaviour columns are pooled across this player&apos;s matches
        (last 500 snapshots). War% = MC war accuracy; Numeric% = closeness
        of numeric guesses; Think ms = time to first keystroke; Hesit. =
        avg input changes; Risk% = share of risky capital picks; Aggr. =
        attacks initiated per match; Auto% = picks that timed out.
        Targeting (deliberate attacks only, auto excluded, each %% over
        attacks where the option was reachable): Slayer% = attacked the
        leader; Bully% = picked the weakest of ≥2 options; CapAggr% =
        attacked a capital; TgtStr% = where in the reachable strength
        range the target sat (0 = weakest, 100 = strongest). nAtk / nWar
        / nNum are sample sizes. Empty cell (·) = not collected / no data.
      </p>
    </div>
  );
}

function CoverageChip({ label, pct }: { label: string; pct: number }) {
  const color =
    pct >= 60
      ? "var(--color-win)"
      : pct >= 30
        ? "var(--color-gold)"
        : "var(--color-lose)";
  return (
    <span
      className="font-mono text-[10px] border px-2 py-1 flex items-center gap-1.5"
      style={{ borderColor: "var(--color-stroke)" }}
      title={`${pct}% of players have ${label} data`}
    >
      <span className="text-dim">{label}</span>
      <span style={{ color }}>{pct}%</span>
    </span>
  );
}
