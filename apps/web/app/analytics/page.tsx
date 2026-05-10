import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";

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

  // Build (playerInGameId → profileId) lookup from finalState across all
  // snapshots so we can join answer rows back to demographics.
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
    <div className="min-h-screen text-white">
      <div className="max-w-6xl mx-auto px-8 py-10 flex flex-col gap-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-widest text-gray-400">
              Analytics
            </p>
            <h1 className="text-3xl font-bold mt-1">Research dashboard</h1>
            <p className="text-sm text-gray-500 mt-2 max-w-2xl">
              Aggregate behavioural and demographic data across all players.
              Telemetry comes from MatchSnapshot rows written by the Colyseus
              game server at game_over.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-xs text-gray-400 hover:text-white transition-colors px-4 py-2 border border-[#4f4f4f] rounded-lg shrink-0"
          >
            ← Dashboard
          </Link>
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Players" value={playerCount} />
          <StatCard label="Completed games" value={snapshotCount} />
          <StatCard label="Numeric answers" value={totalNumericAnswers} />
          <StatCard label="War answers" value={totalWarAnswers} />
        </section>

        <BarSection
          title="War MC accuracy by category"
          subtitle="% correct on the multiple-choice questions during attacks"
          data={warAccArr}
          unit="%"
          color="bg-emerald-400"
          empty="No war answers yet."
        />

        <BarSection
          title="Avg thinking time before typing — by education"
          subtitle="Milliseconds from question shown to first keystroke"
          data={inputByEduArr}
          unit="ms"
          color="bg-blue-400"
          empty="No typing telemetry yet."
        />

        <BarSection
          title="Avg input changes per numeric answer — by category"
          subtitle="Higher = more keystrokes / corrections (proxy for hesitation)"
          data={changesByCatArr}
          unit=""
          color="bg-amber-400"
          empty="No numeric answers yet."
        />

        <section>
          <h2 className="text-lg font-semibold mb-4">Player demographics</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SmallBarCard
              title="Age groups"
              data={ageArr}
              color="bg-pink-400"
            />
            <SmallBarCard
              title="Education"
              data={eduArr}
              color="bg-purple-400"
            />
            <SmallBarCard title="Gender" data={genderArr} color="bg-cyan-400" />
          </div>
        </section>
      </div>
    </div>
  );
}

type Bar = { label: string; value: number; sample?: number };

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <span className="text-2xl font-bold text-white">{value}</span>
    </div>
  );
}

function BarSection({
  title,
  subtitle,
  data,
  unit,
  color,
  empty,
}: {
  title: string;
  subtitle?: string;
  data: Bar[];
  unit: string;
  color: string;
  empty: string;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  return (
    <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-gray-500 italic">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((d) => (
            <div key={d.label} className="flex items-center gap-3">
              <span className="w-32 text-xs text-gray-300 shrink-0 truncate">
                {d.label}
              </span>
              <div className="flex-1 bg-[#2a2a32] h-6 rounded relative overflow-hidden">
                <div
                  className={`${color} h-full rounded transition-all`}
                  style={{
                    width: max > 0 ? `${(d.value / max) * 100}%` : "0%",
                  }}
                />
              </div>
              <span className="w-24 text-right text-sm font-mono tabular-nums">
                {d.value}
                {unit && <span className="text-gray-500 ml-0.5">{unit}</span>}
              </span>
              {d.sample !== undefined && (
                <span className="w-16 text-right text-[10px] text-gray-600 font-mono">
                  n={d.sample}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SmallBarCard({
  title,
  data,
  color,
}: {
  title: string;
  data: Bar[];
  color: string;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  return (
    <div className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-xl p-4 flex flex-col gap-3">
      <h3 className="text-xs uppercase tracking-widest text-gray-400">
        {title}
      </h3>
      {data.length === 0 ? (
        <p className="text-xs text-gray-600 italic">No data yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.map((d) => (
            <div key={d.label} className="flex items-center gap-2">
              <span className="w-20 text-xs text-gray-300 shrink-0 truncate">
                {d.label}
              </span>
              <div className="flex-1 bg-[#2a2a32] h-3 rounded relative overflow-hidden">
                <div
                  className={`${color} h-full rounded`}
                  style={{
                    width: max > 0 ? `${(d.value / max) * 100}%` : "0%",
                  }}
                />
              </div>
              <span className="w-8 text-right text-xs font-mono tabular-nums text-gray-300">
                {d.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
