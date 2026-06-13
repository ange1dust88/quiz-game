// Admin-only raw research dataset. One row per player joining every
// collected field — demographics, psychometrics, progression, and
// behavioural features derived from match telemetry — into a single flat
// matrix. This is the data export the diploma research consumes; the
// table is filterable and downloadable as CSV.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import Slash from "@/app/components/ui/Slash";
import {
  extractFeatures,
  type SnapshotLike,
} from "@/app/lib/analytics";
import DatasetTable, { type DatasetRow } from "./DatasetTable";

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const round = (x: number, dp = 0): number => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};

export default async function DatasetPage() {
  const me = await getProfileSafe();
  if (!me) redirect("/login");
  const adminEmails = parseAdminEmails();
  const user = await prisma.user.findUnique({
    where: { id: me.userId },
    select: { email: true },
  });
  if (!user || !adminEmails.includes(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  const [profiles, snapshots] = await Promise.all([
    prisma.playerProfile.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nickname: true,
        level: true,
        elo: true,
        experience: true,
        coins: true,
        gamesPlayed: true,
        gamesWon: true,
        gamesLost: true,
        country: true,
        birthYear: true,
        gender: true,
        city: true,
        education: true,
        occupation: true,
        mbti: true,
        iqScore: true,
        personalityTraits: true,
        createdAt: true,
      },
    }),
    prisma.matchSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { finalState: true, telemetry: true },
    }),
  ]);

  // Behavioural feature vectors keyed by profileId.
  const features = extractFeatures(snapshots as SnapshotLike[]);
  const featByProfile = new Map(features.map((f) => [f.profileId, f]));

  const currentYear = new Date().getFullYear();

  const rows: DatasetRow[] = profiles.map((p) => {
    const f = featByProfile.get(p.id);
    const winRate =
      p.gamesPlayed > 0 ? round((p.gamesWon / p.gamesPlayed) * 100) : 0;
    return {
      profileId: p.id,
      nickname: p.nickname,
      // Demographics
      age: p.birthYear ? currentYear - p.birthYear : null,
      gender: p.gender,
      country: p.country,
      city: p.city,
      education: p.education,
      occupation: p.occupation,
      // Psychometrics
      mbti: p.mbti,
      iq: p.iqScore,
      traits: p.personalityTraits ?? [],
      // Progression
      level: p.level,
      elo: p.elo,
      coins: p.coins,
      gamesPlayed: p.gamesPlayed,
      gamesWon: p.gamesWon,
      winRate,
      // Behaviour (null when the player has no telemetry yet)
      matches: f?.matches ?? 0,
      warAccuracy: f ? round(f.warAccuracy * 100) : null,
      attackerAccuracy: f && f.warAnswerCount > 0 ? round(f.attackerAccuracy * 100) : null,
      defenderAccuracy: f && f.warAnswerCount > 0 ? round(f.defenderAccuracy * 100) : null,
      numericCloseness: f && f.numericCount > 0 ? round(f.numericCloseness * 100) : null,
      avgThinkMs: f && f.avgThinkMs > 0 ? round(f.avgThinkMs) : null,
      avgHesitation: f ? round(f.avgHesitation, 1) : null,
      riskAppetite: f ? round(f.riskAppetite * 100) : null,
      aggression: f ? round(f.aggression, 2) : null,
      autoPickRate: f ? round(f.autoPickRate * 100) : null,
      giantSlayerRate: f && f.giantSlayerRate !== null ? round(f.giantSlayerRate * 100) : null,
      bullyRate: f && f.bullyRate !== null ? round(f.bullyRate * 100) : null,
      capitalAggression: f && f.capitalAggression !== null ? round(f.capitalAggression * 100) : null,
      targetStrength: f && f.avgTargetStrengthPct !== null ? round(f.avgTargetStrengthPct * 100) : null,
      deliberateAttacks: f?.deliberateAttacks ?? 0,
      warAnswers: f?.warAnswerCount ?? 0,
      numericAnswers: f?.numericCount ?? 0,
      joined: p.createdAt.toISOString().slice(0, 10),
    };
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-canvas text-white">
      <section className="relative overflow-hidden border-b border-stroke bg-gradient-to-br from-surface-hi via-panel to-canvas">
        <div
          className="absolute right-[-80px] top-0 bottom-0 w-[200px] bg-blue2/10"
          style={{ transform: "skewX(-12deg)" }}
          aria-hidden
        />
        <div className="relative max-w-[1800px] mx-auto px-4 sm:px-6 py-6 flex items-start justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-2 max-w-3xl">
            <Slash label="Research dataset" color="#7c8aff" />
            <h1 className="font-head text-4xl text-white leading-none">
              FULL PLAYER DATA MATRIX
            </h1>
            <p className="font-body text-sm text-mute leading-relaxed mt-1">
              Every collected field per player — demographics, psychometrics,
              progression, and behavioural features derived from match
              telemetry. {rows.length} players. Filter, sort, or export to
              CSV for analysis.
            </p>
          </div>
          <Link
            href="/analytics"
            className="font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-4 py-2 shrink-0"
          >
            ← Analytics
          </Link>
        </div>
      </section>

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-6">
        <DatasetTable rows={rows} />
      </div>
    </div>
  );
}
