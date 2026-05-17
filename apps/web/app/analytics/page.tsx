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
      select: { id: true, birthYear: true, education: true, gender: true },
    }),
  ]);

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
          <Link
            href="/dashboard"
            className="font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-4 py-2 shrink-0"
          >
            ← Dashboard
          </Link>
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
      </div>
    </div>
  );
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
