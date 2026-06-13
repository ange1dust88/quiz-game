// FACEIT-style admin analytics dashboard. Aggregates behavioural +
// demographic data across the most recent 200 MatchSnapshots and the
// PlayerProfile demographic fields. Admin-only; non-admins redirect to
// /dashboard.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import PanelCard from "@/app/components/ui/PanelCard";
import StatBlock from "@/app/components/ui/StatBlock";
import Slash from "@/app/components/ui/Slash";
import {
  extractFeatures,
  groupMeans,
  kMeans,
  mbtiAxes,
  pearson,
  zNormalize,
  type PlayerFeatures,
  type SnapshotLike,
} from "@/app/lib/analytics";

const CATEGORY_LABELS: Record<string, string> = {
  geography: "Geography",
  history: "History",
  math: "Math",
  science: "Science",
  sports: "Sports",
  pop_culture: "Pop culture",
  language: "Language",
  general: "General",
};

const EDUCATION_LABELS: Record<string, string> = {
  high_school: "High school",
  vocational: "Vocational",
  bachelor: "Bachelor's",
  master: "Master's",
  phd: "PhD",
  other: "Other",
};

const AGE_BUCKETS = ["<18", "18–24", "25–34", "35–44", "45+"] as const;

function ageBucket(age: number): (typeof AGE_BUCKETS)[number] {
  if (age < 18) return "<18";
  if (age < 25) return "18–24";
  if (age < 35) return "25–34";
  if (age < 45) return "35–44";
  return "45+";
}

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Telemetry shapes — JSON-serialised by Colyseus at game_over.
type NumericAnswerT = {
  playerId: string;
  questionId: number;
  category: string;
  value: number;
  diff: number;
  timeMs: number;
  firstInputAtMs: number | null;
  inputChangeCount: number;
};
type WarAnswerT = {
  playerId: string;
  attackId: string;
  questionId: number;
  category: string;
  isCorrect: boolean;
  submittedAtMs: number;
};
type SnapshotTelemetry = {
  numericAnswers?: NumericAnswerT[];
  warAnswers?: WarAnswerT[];
};
type FinalStateT = {
  players?: Array<{ id: string; profileId: string; nickname: string }>;
};

export default async function AnalyticsPage() {
  const profile = await getProfileSafe();
  if (!profile) redirect("/login");
  const adminEmails = parseAdminEmails();
  const user = await prisma.user.findUnique({
    where: { id: profile.userId },
    select: { email: true },
  });
  if (!user || !adminEmails.includes(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  const [playerCount, snapshotCount, snapshots, profiles] = await Promise.all([
    prisma.playerProfile.count(),
    prisma.matchSnapshot.count(),
    prisma.matchSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.playerProfile.findMany({
      select: {
        id: true,
        birthYear: true,
        education: true,
        gender: true,
        mbti: true,
        iqScore: true,
        personalityTraits: true,
      },
    }),
  ]);

  // ---- Analytical model: behavioural features → clustering + correlation
  // Per-player behavioural vectors pooled across the loaded snapshots,
  // joined to each player's demographic + psychometric profile.
  const features = extractFeatures(snapshots as SnapshotLike[]);
  const metaById = new Map(profiles.map((p) => [p.id, p]));
  const currentYearForAge = new Date().getFullYear();

  const clusterAnalysis = buildClusters(features, metaById);
  const correlations = buildCorrelations(features, metaById, currentYearForAge);
  const mbtiSplits = buildMbtiSplits(features, metaById);

  const profileByPlayer = new Map<string, string>();
  let totalNumericAnswers = 0;
  let totalWarAnswers = 0;
  for (const snap of snapshots) {
    const fs = (snap.finalState ?? {}) as FinalStateT;
    fs.players?.forEach((p) => profileByPlayer.set(p.id, p.profileId));
    const t = (snap.telemetry ?? {}) as SnapshotTelemetry;
    totalNumericAnswers += t.numericAnswers?.length ?? 0;
    totalWarAnswers += t.warAnswers?.length ?? 0;
  }

  const eduByProfile = new Map<string, string>();
  profiles.forEach((p) => {
    if (p.education) eduByProfile.set(p.id, p.education);
  });

  const warAccByCat = new Map<string, { correct: number; total: number }>();
  const inputByEdu = new Map<string, { sum: number; count: number }>();
  const changesByCat = new Map<string, { sum: number; count: number }>();

  for (const snap of snapshots) {
    const t = (snap.telemetry ?? {}) as SnapshotTelemetry;
    for (const wa of t.warAnswers ?? []) {
      const e = warAccByCat.get(wa.category) ?? { correct: 0, total: 0 };
      e.total += 1;
      if (wa.isCorrect) e.correct += 1;
      warAccByCat.set(wa.category, e);
    }
    for (const na of t.numericAnswers ?? []) {
      const profileId = profileByPlayer.get(na.playerId);
      const edu = profileId ? eduByProfile.get(profileId) : undefined;
      if (na.firstInputAtMs !== null && edu) {
        const e = inputByEdu.get(edu) ?? { sum: 0, count: 0 };
        e.sum += na.firstInputAtMs;
        e.count += 1;
        inputByEdu.set(edu, e);
      }
      const c = changesByCat.get(na.category) ?? { sum: 0, count: 0 };
      c.sum += na.inputChangeCount;
      c.count += 1;
      changesByCat.set(na.category, c);
    }
  }

  const currentYear = new Date().getFullYear();
  const ageGroups = new Map<string, number>();
  const eduDist = new Map<string, number>();
  const genderDist = new Map<string, number>();
  for (const p of profiles) {
    if (p.birthYear) {
      const bucket = ageBucket(currentYear - p.birthYear);
      ageGroups.set(bucket, (ageGroups.get(bucket) ?? 0) + 1);
    }
    if (p.education)
      eduDist.set(p.education, (eduDist.get(p.education) ?? 0) + 1);
    if (p.gender) genderDist.set(p.gender, (genderDist.get(p.gender) ?? 0) + 1);
  }

  const warAccArr = Array.from(warAccByCat.entries())
    .map(([cat, v]) => ({
      label: CATEGORY_LABELS[cat] ?? cat,
      value: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      sample: v.total,
    }))
    .sort((a, b) => b.value - a.value);

  const inputByEduArr = Array.from(inputByEdu.entries())
    .map(([edu, v]) => ({
      label: EDUCATION_LABELS[edu] ?? edu,
      value: v.count > 0 ? Math.round(v.sum / v.count) : 0,
      sample: v.count,
    }))
    .sort((a, b) => a.value - b.value);

  const changesByCatArr = Array.from(changesByCat.entries())
    .map(([cat, v]) => ({
      label: CATEGORY_LABELS[cat] ?? cat,
      value: v.count > 0 ? Math.round((v.sum / v.count) * 10) / 10 : 0,
      sample: v.count,
    }))
    .sort((a, b) => b.value - a.value);

  const ageArr = AGE_BUCKETS.map((g) => ({
    label: g,
    value: ageGroups.get(g) ?? 0,
  })).filter((d) => d.value > 0);

  const eduArr = Array.from(eduDist.entries())
    .map(([edu, count]) => ({
      label: EDUCATION_LABELS[edu] ?? edu,
      value: count,
    }))
    .sort((a, b) => b.value - a.value);

  const genderArr = Array.from(genderDist.entries())
    .map(([g, count]) => ({
      label: g.charAt(0).toUpperCase() + g.slice(1),
      value: count,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-canvas text-white">
      <section className="relative overflow-hidden border-b border-stroke bg-gradient-to-br from-surface-hi via-panel to-canvas">
        <div
          className="absolute right-[-80px] top-0 bottom-0 w-[200px] bg-blue2/10"
          style={{ transform: "skewX(-12deg)" }}
          aria-hidden
        />
        <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex items-start justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-2 max-w-2xl">
            <Slash label="Analytics" color="#7c8aff" />
            <h1 className="font-head text-4xl text-white leading-none">
              RESEARCH DASHBOARD
            </h1>
            <p className="font-body text-sm text-mute leading-relaxed mt-1">
              Aggregate behavioural and demographic data across all players.
              Telemetry comes from MatchSnapshot rows written by the Colyseus
              game server at game_over.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/analytics/dataset"
              className="font-head text-[11px] font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-4 py-2"
            >
              Raw dataset →
            </Link>
            <Link
              href="/dashboard"
              className="font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-4 py-2"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBlock
            label="Players"
            value={playerCount.toLocaleString()}
            sub="total"
          />
          <StatBlock
            label="Games"
            value={snapshotCount.toLocaleString()}
            sub="completed"
            accent="var(--color-win)"
          />
          <StatBlock
            label="Numeric answers"
            value={totalNumericAnswers.toLocaleString()}
            sub="last 200"
            accent="var(--color-accent)"
          />
          <StatBlock
            label="War answers"
            value={totalWarAnswers.toLocaleString()}
            sub="last 200"
            accent="var(--color-lose)"
          />
        </section>

        <BarPanel
          title="War MC accuracy by category"
          subtitle="% correct on the multiple-choice questions during attacks"
          accent="#3fcf6c"
          data={warAccArr}
          unit="%"
          color="var(--color-win)"
          empty="No war answers yet."
        />

        <BarPanel
          title="Avg thinking time before typing — by education"
          subtitle="Milliseconds from question shown to first keystroke"
          accent="#1ed3ff"
          data={inputByEduArr}
          unit="ms"
          color="var(--color-accent)"
          empty="No typing telemetry yet."
        />

        <BarPanel
          title="Avg input changes per numeric answer — by category"
          subtitle="Higher = more keystrokes / corrections (proxy for hesitation)"
          accent="#ffc24a"
          data={changesByCatArr}
          unit=""
          color="var(--color-gold)"
          empty="No numeric answers yet."
        />

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MiniBarPanel
            title="Age groups"
            accent="#ff6cf3"
            data={ageArr}
            color="var(--color-purple2)"
          />
          <MiniBarPanel
            title="Education"
            accent="#7c8aff"
            data={eduArr}
            color="var(--color-blue2)"
          />
          <MiniBarPanel
            title="Gender"
            accent="#1ed3ff"
            data={genderArr}
            color="var(--color-accent)"
          />
        </section>

        <div className="border-t border-stroke pt-2 mt-2">
          <Slash label="Analytical model" color="#ff6cf3" />
        </div>

        <ClustersPanel clusters={clusterAnalysis} />

        <CorrelationsPanel rows={correlations} />

        <MbtiSplitPanel splits={mbtiSplits} />
      </div>
    </div>
  );
}

// ---- Analytical model builders -----------------------------------------

type ProfileMeta = {
  id: string;
  birthYear: number | null;
  education: string | null;
  gender: string | null;
  mbti: string | null;
  iqScore: number | null;
  personalityTraits: string[];
};

type ClusterDescriptor = {
  index: number;
  size: number;
  label: string;
  warAccuracy: number;
  numericCloseness: number;
  avgThinkMs: number;
  avgHesitation: number;
  riskAppetite: number;
  aggression: number;
  topEducation: string | null;
  topMbti: string | null;
  avgIq: number | null;
};

// Cluster the behavioural feature vectors (z-normalised so scales are
// comparable) into up to 3 archetypes, then describe each cluster by its
// mean behaviour + the demographic / psychometric profile that dominates
// it. A human-readable label is inferred from the cluster's standout
// behavioural traits.
function buildClusters(
  features: PlayerFeatures[],
  metaById: Map<string, ProfileMeta>,
): ClusterDescriptor[] {
  // Need enough players with real signal to cluster meaningfully.
  const usable = features.filter(
    (f) => f.warAnswerCount + f.numericCount >= 3,
  );
  if (usable.length < 3) return [];

  const DIMS: (keyof PlayerFeatures)[] = [
    "warAccuracy",
    "numericCloseness",
    "avgThinkMs",
    "avgHesitation",
    "riskAppetite",
    "aggression",
  ];
  const rows = usable.map((f) => DIMS.map((d) => f[d] as number));
  const { normalized } = zNormalize(rows);
  const k = Math.min(3, usable.length);
  const { assignments } = kMeans(normalized, k, 42);

  const groups = new Map<number, PlayerFeatures[]>();
  usable.forEach((f, i) => {
    const c = assignments[i];
    const arr = groups.get(c) ?? [];
    arr.push(f);
    groups.set(c, arr);
  });

  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  const mode = (xs: (string | null)[]): string | null => {
    const counts = new Map<string, number>();
    for (const x of xs) if (x) counts.set(x, (counts.get(x) ?? 0) + 1);
    let best: string | null = null;
    let bestN = 0;
    for (const [k2, n] of counts)
      if (n > bestN) {
        bestN = n;
        best = k2;
      }
    return best;
  };

  const out: ClusterDescriptor[] = [];
  for (const [index, members] of groups) {
    const metas = members
      .map((m) => metaById.get(m.profileId))
      .filter((m): m is ProfileMeta => Boolean(m));
    const iqs = metas
      .map((m) => m.iqScore)
      .filter((v): v is number => v !== null);
    const warAccuracy = avg(members.map((m) => m.warAccuracy));
    const riskAppetite = avg(members.map((m) => m.riskAppetite));
    const avgThinkMs = avg(members.map((m) => m.avgThinkMs));
    const aggression = avg(members.map((m) => m.aggression));
    out.push({
      index,
      size: members.length,
      label: clusterLabel({ warAccuracy, riskAppetite, avgThinkMs, aggression }),
      warAccuracy,
      numericCloseness: avg(members.map((m) => m.numericCloseness)),
      avgThinkMs,
      avgHesitation: avg(members.map((m) => m.avgHesitation)),
      riskAppetite,
      aggression,
      topEducation: mode(metas.map((m) => m.education)),
      topMbti: mode(metas.map((m) => m.mbti)),
      avgIq: iqs.length ? Math.round(avg(iqs)) : null,
    });
  }
  return out.sort((a, b) => b.size - a.size);
}

// Infer a short archetype name from a cluster's standout traits.
function clusterLabel(c: {
  warAccuracy: number;
  riskAppetite: number;
  avgThinkMs: number;
  aggression: number;
}): string {
  const speed = c.avgThinkMs > 0 && c.avgThinkMs < 1500 ? "Fast" : "Deliberate";
  const acc = c.warAccuracy >= 0.6 ? "accurate" : "scrappy";
  const risk = c.riskAppetite >= 0.5 ? "risk-taker" : "safe";
  return `${speed} ${acc} ${risk}`;
}

type CorrelationRow = { label: string; r: number; n: number };

// Pearson correlations between psychometric/demographic predictors and
// behavioural outcomes. Each row reports r ∈ [-1, 1] and the sample size.
function buildCorrelations(
  features: PlayerFeatures[],
  metaById: Map<string, ProfileMeta>,
  currentYear: number,
): CorrelationRow[] {
  const iq = (f: PlayerFeatures) => metaById.get(f.profileId)?.iqScore ?? null;
  const age = (f: PlayerFeatures) => {
    const by = metaById.get(f.profileId)?.birthYear;
    return by ? currentYear - by : null;
  };
  const pairOf = (
    xs: (f: PlayerFeatures) => number | null,
    ys: (f: PlayerFeatures) => number | null,
  ): Array<[number | null, number | null]> =>
    features.map((f) => [xs(f), ys(f)]);

  const rows: CorrelationRow[] = [
    {
      label: "IQ ↔ War accuracy",
      ...pearson(pairOf(iq, (f) => (f.warAnswerCount > 0 ? f.warAccuracy : null))),
    },
    {
      label: "IQ ↔ Numeric closeness",
      ...pearson(pairOf(iq, (f) => (f.numericCount > 0 ? f.numericCloseness : null))),
    },
    {
      label: "IQ ↔ Think time (lower = decisive)",
      ...pearson(pairOf(iq, (f) => (f.avgThinkMs > 0 ? f.avgThinkMs : null))),
    },
    {
      label: "IQ ↔ Hesitation",
      ...pearson(pairOf(iq, (f) => f.avgHesitation)),
    },
    {
      label: "Age ↔ Think time",
      ...pearson(pairOf(age, (f) => (f.avgThinkMs > 0 ? f.avgThinkMs : null))),
    },
    {
      label: "Age ↔ War accuracy",
      ...pearson(pairOf(age, (f) => (f.warAnswerCount > 0 ? f.warAccuracy : null))),
    },
    {
      label: "Risk appetite ↔ Aggression",
      ...pearson(pairOf((f) => f.riskAppetite, (f) => f.aggression)),
    },
  ];
  return rows.filter((r) => r.n >= 2);
}

type MbtiSplit = {
  axis: string;
  metric: string;
  groups: Array<{ key: string; mean: number; n: number }>;
};

// Behaviour split by MBTI binary axes. Directly tests personality
// hypotheses (e.g. do Judging types hesitate less than Perceiving?).
function buildMbtiSplits(
  features: PlayerFeatures[],
  metaById: Map<string, ProfileMeta>,
): MbtiSplit[] {
  const axisLetter =
    (which: "TF" | "JP" | "EI" | "SN") => (f: PlayerFeatures) => {
      const ax = mbtiAxes(metaById.get(f.profileId)?.mbti ?? null);
      return ax ? ax[which] : null;
    };
  const splits: MbtiSplit[] = [
    {
      axis: "Thinking vs Feeling",
      metric: "War accuracy %",
      groups: groupMeans(
        features.filter((f) => f.warAnswerCount > 0),
        axisLetter("TF"),
        (f) => Math.round(f.warAccuracy * 100),
      ),
    },
    {
      axis: "Judging vs Perceiving",
      metric: "Hesitation (input changes)",
      groups: groupMeans(
        features,
        axisLetter("JP"),
        (f) => Math.round(f.avgHesitation * 10) / 10,
      ),
    },
    {
      axis: "Judging vs Perceiving",
      metric: "Risk appetite %",
      groups: groupMeans(
        features.filter((f) => f.riskAppetite > 0 || f.aggression > 0),
        axisLetter("JP"),
        (f) => Math.round(f.riskAppetite * 100),
      ),
    },
  ];
  return splits.filter((s) => s.groups.length >= 2);
}

type Bar = { label: string; value: number; sample?: number };

function BarPanel({
  title,
  subtitle,
  accent,
  data,
  unit,
  color,
  empty,
}: {
  title: string;
  subtitle?: string;
  accent: string;
  data: Bar[];
  unit: string;
  color: string;
  empty: string;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  return (
    <PanelCard title={title} accent={accent}>
      {subtitle && (
        <p className="font-body text-xs text-mute mb-3 -mt-1">{subtitle}</p>
      )}
      {data.length === 0 ? (
        <p className="font-body text-sm text-dim italic">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((d) => (
            <div key={d.label} className="flex items-center gap-3">
              <span className="font-head text-[11px] text-mute w-32 shrink-0 truncate">
                {d.label}
              </span>
              <div className="flex-1 bg-panel h-5 relative overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: max > 0 ? `${(d.value / max) * 100}%` : "0%",
                    background: color,
                  }}
                />
              </div>
              <span className="font-mono text-sm font-bold tabular-nums w-20 text-right text-white">
                {d.value}
                {unit && <span className="text-dim ml-0.5">{unit}</span>}
              </span>
              {d.sample !== undefined && (
                <span className="font-mono text-[10px] text-dim w-14 text-right">
                  n={d.sample}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

function MiniBarPanel({
  title,
  accent,
  data,
  color,
}: {
  title: string;
  accent: string;
  data: Bar[];
  color: string;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  return (
    <PanelCard title={title} accent={accent}>
      {data.length === 0 ? (
        <p className="font-body text-xs text-dim italic">No data yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.map((d) => (
            <div key={d.label} className="flex items-center gap-2">
              <span className="font-head text-[10px] text-mute w-20 shrink-0 truncate">
                {d.label}
              </span>
              <div className="flex-1 bg-panel h-3 relative overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: max > 0 ? `${(d.value / max) * 100}%` : "0%",
                    background: color,
                  }}
                />
              </div>
              <span className="font-mono text-xs tabular-nums w-8 text-right text-white">
                {d.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

// ---- Analytical-model panels -------------------------------------------

function ClustersPanel({ clusters }: { clusters: ClusterDescriptor[] }) {
  return (
    <PanelCard
      title="Behavioural player clusters (k-means)"
      accent="#ff6cf3"
    >
      <p className="font-body text-xs text-mute mb-3 -mt-1">
        Players grouped by behaviour (war accuracy, numeric closeness,
        think time, hesitation, risk appetite, aggression — z-normalised).
        Each cluster is described by its mean behaviour and the
        demographic / psychometric profile that dominates it.
      </p>
      {clusters.length === 0 ? (
        <p className="font-body text-sm text-dim italic">
          Not enough match data to cluster yet (need ≥3 players with
          played answers).
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {clusters.map((c) => (
            <div
              key={c.index}
              className="bg-panel border border-stroke p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-head text-[11px] text-white">
                  {c.label}
                </span>
                <span className="font-mono text-[10px] text-dim">
                  {c.size} player{c.size === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <ClusterStat label="War acc" value={`${Math.round(c.warAccuracy * 100)}%`} />
                <ClusterStat label="Numeric" value={`${Math.round(c.numericCloseness * 100)}%`} />
                <ClusterStat label="Think" value={c.avgThinkMs > 0 ? `${Math.round(c.avgThinkMs)}ms` : "—"} />
                <ClusterStat label="Hesitation" value={c.avgHesitation.toFixed(1)} />
                <ClusterStat label="Risk" value={`${Math.round(c.riskAppetite * 100)}%`} />
                <ClusterStat label="Aggression" value={c.aggression.toFixed(2)} />
              </div>
              <div className="border-t border-stroke pt-2 mt-1 flex flex-col gap-0.5">
                <ClusterStat label="Avg IQ" value={c.avgIq !== null ? String(c.avgIq) : "n/a"} muted />
                <ClusterStat label="Top edu" value={c.topEducation ? (EDUCATION_LABELS[c.topEducation] ?? c.topEducation) : "n/a"} muted />
                <ClusterStat label="Top MBTI" value={c.topMbti ?? "n/a"} muted />
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

function ClusterStat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-head text-[10px] text-dim">{label}</span>
      <span
        className={`font-mono text-[11px] ${muted ? "text-mute" : "text-white"}`}
      >
        {value}
      </span>
    </div>
  );
}

function CorrelationsPanel({ rows }: { rows: CorrelationRow[] }) {
  return (
    <PanelCard
      title="Psychometric correlations (Pearson r)"
      accent="#1ed3ff"
    >
      <p className="font-body text-xs text-mute mb-3 -mt-1">
        Linear correlation between collected predictors (IQ, age) and
        behavioural outcomes. r ranges −1…+1; |r| ≥ 0.3 is a notable
        signal. n = players with both fields present.
      </p>
      {rows.length === 0 ? (
        <p className="font-body text-sm text-dim italic">
          Not enough paired data yet (need players with IQ / birth year
          set who have played).
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const pct = Math.min(100, Math.abs(row.r) * 100);
            const positive = row.r >= 0;
            return (
              <div key={row.label} className="flex items-center gap-3">
                <span className="font-head text-[11px] text-mute w-56 shrink-0">
                  {row.label}
                </span>
                {/* Diverging bar from a centre line: green right (+),
                    red left (−). */}
                <div className="flex-1 h-5 bg-panel relative overflow-hidden flex">
                  <div className="w-1/2 h-full flex justify-end">
                    {!positive && (
                      <div
                        className="h-full"
                        style={{ width: `${pct}%`, background: "var(--color-lose)" }}
                      />
                    )}
                  </div>
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-stroke" />
                  <div className="w-1/2 h-full">
                    {positive && (
                      <div
                        className="h-full"
                        style={{ width: `${pct}%`, background: "var(--color-win)" }}
                      />
                    )}
                  </div>
                </div>
                <span
                  className="font-mono text-sm font-bold tabular-nums w-16 text-right"
                  style={{
                    color: positive ? "var(--color-win)" : "var(--color-lose)",
                  }}
                >
                  {row.r >= 0 ? "+" : ""}
                  {row.r.toFixed(2)}
                </span>
                <span className="font-mono text-[10px] text-dim w-12 text-right">
                  n={row.n}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}

function MbtiSplitPanel({ splits }: { splits: MbtiSplit[] }) {
  return (
    <PanelCard title="Behaviour by MBTI axis" accent="#7c8aff">
      <p className="font-body text-xs text-mute mb-3 -mt-1">
        Behavioural metrics split by personality axis — tests whether
        self-reported type predicts in-game behaviour.
      </p>
      {splits.length === 0 ? (
        <p className="font-body text-sm text-dim italic">
          Not enough players with an MBTI type set yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {splits.map((s, i) => {
            const max = s.groups.reduce((m, g) => Math.max(m, g.mean), 0);
            return (
              <div
                key={`${s.axis}-${s.metric}-${i}`}
                className="bg-panel border border-stroke p-3 flex flex-col gap-2"
              >
                <div className="flex flex-col">
                  <span className="font-head text-[11px] text-white">
                    {s.axis}
                  </span>
                  <span className="font-mono text-[10px] text-dim">
                    {s.metric}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {s.groups.map((g) => (
                    <div key={g.key} className="flex items-center gap-2">
                      <span className="font-head text-[11px] text-mute w-6 shrink-0">
                        {g.key}
                      </span>
                      <div className="flex-1 bg-canvas h-4 relative overflow-hidden">
                        <div
                          className="h-full"
                          style={{
                            width: max > 0 ? `${(g.mean / max) * 100}%` : "0%",
                            background: "var(--color-blue2)",
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs tabular-nums w-12 text-right text-white">
                        {g.mean}
                      </span>
                      <span className="font-mono text-[10px] text-dim w-10 text-right">
                        n={g.n}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}
