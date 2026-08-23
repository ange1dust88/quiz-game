/**
 * Seed synthetic players + played matches, up to a target player count.
 *
 * Every profile is created with `synthetic: true` (invisible in the app
 * UI; surfaced only in the admin dataset/CSV). Behaviour is generated
 * from latent traits (IQ, age, MBTI axes) with noise, so the analytics
 * pipeline has realistic structure to chew on. Matches are seeded ONLY
 * between synthetic players — real players' stats are never touched.
 *
 * Usage:  pnpm exec tsx scripts/seedSynthetic.mts [targetTotal=25]
 * Wipe :  pnpm exec tsx scripts/wipeSynthetic.mts
 */
import { prisma } from "@quiz/db";
import { evaluateAchievements } from "@quiz/shared/achievements";
import bcrypt from "bcrypt";

const TARGET = parseInt(process.argv[2] ?? "25", 10);
// Every synthetic player is topped up to this TOTAL match count range —
// existing seeded players included, so re-running the script after
// raising these adds matches without touching profiles.
const MIN_GAMES = parseInt(process.argv[3] ?? "10", 10);
const MAX_GAMES = parseInt(process.argv[4] ?? "15", 10);

// Esports-style tags (invented, not real people's identities).
const NICKS = [
  "zephyrOne", "KriegerX", "matt1x", "NovaRelic", "dxrkfate",
  "Yxngwolf", "perkzilla", "s0lstice", "F1zzer", "obsydian",
  "Lunatik22", "GhostQQ", "reyko", "Vantage_", "cyprusOG",
  "blitzkr1eg", "NoScopeNadia", "tundraFox", "m0nsoon", "HexaByte",
];
const COUNTRIES: Array<[string, string, "en"|"ru"|"uk"|"pl"]> = [
  ["Ukraine", "Kyiv", "uk"], ["Ukraine", "Lviv", "uk"], ["Ukraine", "Odesa", "uk"],
  ["Ukraine", "Kharkiv", "uk"], ["Ukraine", "Dnipro", "ru"],
  ["Poland", "Warsaw", "pl"], ["Poland", "Krakow", "pl"], ["Poland", "Wroclaw", "pl"],
  ["Poland", "Gdansk", "pl"], ["Poland", "Poznan", "pl"],
  ["Moldova", "Chisinau", "ru"], ["Moldova", "Balti", "ru"], ["Moldova", "Cahul", "en"],
];
const EDU = ["high_school", "vocational", "bachelor", "bachelor", "master", "master", "phd"];
const OCC = ["tech", "student", "student", "engineering", "business", "science", "service"];
const TRAITS = ["analytical","creative","organized","spontaneous","sociable","reserved","calm","energetic","ambitious","easygoing","pragmatic","curious","cautious","risk_taking","detail_oriented"];

// Deterministic RNG so reseeding is reproducible.
let rngState = 1337;
const rnd = () => { rngState = (rngState * 1103515245 + 12345) % 2 ** 31; return rngState / 2 ** 31; };
const gauss = (m: number, sd: number) => { const u = Math.max(rnd(), 1e-9), v = rnd(); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

type Latent = {
  iq: number; age: number; E: boolean; N: boolean; T: boolean; J: boolean;
  skill: number; // 0..1 overall play quality derived from iq + noise
};

// Curated MBTI pool covering all four axes with real variety — dealt
// round-robin (shuffled) so a batch never collapses into 2-3 types.
// Behaviour is still driven by the axes of the dealt type.
const MBTI_POOL = [
  "INTJ","ENTP","ISTP","ENFJ","ISFJ","ESTP","INFP","ESFJ",
  "ENTJ","INTP","ESFP","INFJ","ISTJ","ENFP","ISFP","ESTJ",
];
let mbtiDeal: string[] = [];
function dealMbti(): string {
  if (mbtiDeal.length === 0) mbtiDeal = [...MBTI_POOL].sort(() => rnd() - 0.5);
  return mbtiDeal.pop()!;
}

function makeLatent(): Latent & { mbtiType: string } {
  const iq = clamp(Math.round(gauss(104, 13)), 78, 142);
  const t = dealMbti();
  return {
    iq, age: int(16, 41), mbtiType: t,
    E: t[0] === "E", N: t[1] === "N", T: t[2] === "T", J: t[3] === "J",
    skill: clamp(0.5 + (iq - 104) / 80 + gauss(0, 0.12), 0.05, 0.95),
  };
}

async function main() {
  const existing = await prisma.playerProfile.count();
  const need = TARGET - existing;
  if (need <= 0) console.log(`already ${existing} players (target ${TARGET}) — topping up matches only`);
  console.log(`players: ${existing} → target ${TARGET} (creating ${need} synthetic)`);

  const templates = await prisma.countryTemplate.findMany({ select: { id: true, svgId: true } });
  const questions = await prisma.question.findMany({ where: { language: "en" }, select: { id: true, answer: true, category: true }, take: 400 });
  const warQs = await prisma.warQuestion.findMany({ where: { language: "en" }, select: { id: true, category: true }, take: 400 });
  if (!templates.length || !questions.length || !warQs.length) throw new Error("need CountryTemplate + Question + WarQuestion rows");

  const hash = await bcrypt.hash(`synthetic-${Date.now()}`, 10);
  // Nicknames must be unique across seeding runs — earlier batches may
  // have consumed the base pool, so suffix until free.
  const taken = new Set(
    (await prisma.playerProfile.findMany({ select: { nickname: true } })).map(
      (p) => p.nickname.toLowerCase(),
    ),
  );
  const freeNick = (base: string): string => {
    let cand = base;
    let n = 2;
    while (taken.has(cand.toLowerCase())) cand = `${base}${n++}`;
    taken.add(cand.toLowerCase());
    return cand;
  };
  const created: Array<{ profileId: string; nickname: string; lat: Latent; elo: number; xp: number; wins: number; losses: number; }> = [];

  for (let i = 0; i < need; i++) {
    const nickname = freeNick(NICKS[i % NICKS.length]);
    const lat = makeLatent();
    const [country, city, language] = pick(COUNTRIES);
    const nTraits = int(2, 5);
    const traits = [...TRAITS].sort(() => rnd() - 0.5).slice(0, nTraits);
    // ~80% fill MBTI, ~60% IQ, ~85% age — mirrors voluntary-form reality.
    const mbti = rnd() < 0.85 ? (lat as { mbtiType: string }).mbtiType : null;
    const iqScore = rnd() < 0.7 ? lat.iq + int(-3, 3) : null;
    const birthYear = rnd() < 0.85 ? 2026 - lat.age : null;

    const user = await prisma.user.create({
      data: { email: `${nickname.toLowerCase()}@seed.synthetic.local`, passwordHash: hash },
    });
    const profile = await prisma.playerProfile.create({
      data: {
        userId: user.id, nickname, synthetic: true,
        country, city, language,
        birthYear, gender: rnd() < 0.78 ? (rnd() < 0.82 ? "male" : "female") : null,
        education: rnd() < 0.8 ? pick(EDU) : null,
        occupation: rnd() < 0.75 ? pick(OCC) : null,
        mbti, iqScore, personalityTraits: traits,
        coins: int(50, 900),
        createdAt: new Date(Date.now() - int(20, 45) * 86400_000),
      },
    });
    created.push({ profileId: profile.id, nickname, lat, elo: 1000, xp: 0, wins: 0, losses: 0 });
  }
  console.log(`created ${created.length} profiles`);

  // ---- roster: new + existing synthetic players ------------------------
  // Latents for existing players are rebuilt from their stored MBTI/IQ,
  // so extra matches keep each player's behavioural style consistent
  // with what they already played.
  const knownIds = new Set(created.map((c) => c.profileId));
  const existingSynths = await prisma.playerProfile.findMany({
    where: { synthetic: true, id: { notIn: [...knownIds] } },
    select: { id: true, nickname: true, mbti: true, iqScore: true, birthYear: true,
              elo: true, level: true, experience: true, gamesWon: true, gamesLost: true },
  });
  for (const e of existingSynths) {
    const iq = e.iqScore ?? clamp(Math.round(gauss(104, 13)), 78, 142);
    const m = e.mbti && e.mbti.length === 4 ? e.mbti : dealMbti();
    created.push({
      profileId: e.id, nickname: e.nickname,
      lat: { iq, age: e.birthYear ? 2026 - e.birthYear : int(16, 41), mbtiType: m,
             E: m[0] === "E", N: m[1] === "N", T: m[2] === "T", J: m[3] === "J",
             skill: clamp(0.5 + (iq - 104) / 80 + gauss(0, 0.12), 0.05, 0.95) } as never,
      elo: e.elo, xp: (e.level - 1) * 1000 + e.experience,
      wins: e.gamesWon, losses: e.gamesLost,
    });
  }

  // ---- matches: top everyone up to MIN..MAX total games ----------------
  const gamesTarget = new Map(created.map((c) => [c.profileId, int(MIN_GAMES, MAX_GAMES)]));
  const gamesDone = new Map(created.map((c) => [c.profileId, c.wins + c.losses]));
  let sessionsMade = 0;

  while (true) {
    const pool = created.filter((c) => (gamesDone.get(c.profileId) ?? 0) < (gamesTarget.get(c.profileId) ?? 0));
    if (pool.length < 2) break;
    const size = Math.min(pool.length, rnd() < 0.55 ? 2 : rnd() < 0.75 ? 3 : 4);
    const party = [...pool].sort(() => rnd() - 0.5).slice(0, size);
    party.forEach((p) => gamesDone.set(p.profileId, (gamesDone.get(p.profileId) ?? 0) + 1));

    const daysAgo = int(1, 19);
    const createdAt = new Date(Date.now() - daysAgo * 86400_000 - int(0, 86_000_000));
    const session = await prisma.gameSession.create({
      data: { status: "completed", stage: "ended", createdAt, maxPlayers: size, warTurns: size * int(3, 5), ranked: true },
    });
    const pigs = [] as Array<{ id: string; profileId: string; nickname: string; lat: Latent }>;
    for (let t = 0; t < party.length; t++) {
      const pig = await prisma.playerInGame.create({
        data: { gameSessionId: session.id, profileId: party[t].profileId, role: t === 0 ? "host" : "player", turnOrder: t, joinedAt: createdAt },
      });
      pigs.push({ id: pig.id, profileId: party[t].profileId, nickname: party[t].nickname, lat: party[t].lat });
    }

    // Winner: best skill wins ~60% of the time, else random upset.
    const bySkill = [...pigs].sort((a, b) => b.lat.skill - a.lat.skill);
    const winner = rnd() < 0.6 ? bySkill[0] : pick(pigs);

    // Countries: shuffle templates, deal 6-10 per player, capital first.
    const shuffledT = [...templates].sort(() => rnd() - 0.5);
    const countries: Array<{ svgId: string; templateId: number; ownerId: string | null; isCapital: boolean; armies: number; maxArmies: number; points: number }> = [];
    let ti = 0;
    const capitalStyleOf = new Map<string, string>();
    for (const pg of pigs) {
      const style = rnd() < 0.3 ? "risky" : "standard";
      capitalStyleOf.set(pg.id, style);
      const isWin = pg.id === winner.id;
      const n = clamp(int(4, 7) + (isWin ? int(2, 4) : 0), 3, 12);
      for (let k = 0; k < n && ti < shuffledT.length; k++, ti++) {
        const t = shuffledT[ti];
        countries.push({ svgId: t.svgId, templateId: t.id, ownerId: pg.id, isCapital: k === 0, armies: k === 0 ? int(1, 3) : 1, maxArmies: k === 0 ? 3 : 1, points: int(2, 8) * 100 });
      }
    }

    // ---- telemetry ----
    const numericAnswers: object[] = []; const capitalPicks: object[] = []; const territoryPicks: object[] = [];
    const warAnswers: object[] = []; const attacks: object[] = [];
    for (const pg of pigs) capitalPicks.push({ playerId: pg.id, svgId: pick(shuffledT).svgId, auto: rnd() < 0.05, capitalStyle: capitalStyleOf.get(pg.id) });

    const rounds = int(5, 8);
    const qs = [...questions].sort(() => rnd() - 0.5).slice(0, rounds);
    for (const q of qs) {
      for (const pg of pigs) {
        const { lat } = pg;
        const relErr = clamp(Math.abs(gauss(0.45 - lat.skill * 0.4, 0.18)), 0.005, 1.2);
        const value = Math.round(q.answer * (1 + (rnd() < 0.5 ? -1 : 1) * relErr) * 100) / 100;
        const think = clamp(Math.round(gauss(2600 - (lat.iq - 104) * 28 + (lat.age - 27) * 35, 700)), 350, 9000);
        numericAnswers.push({
          playerId: pg.id, questionId: q.id, category: q.category,
          value, diff: Math.abs(value - q.answer), correctAnswer: q.answer,
          timeMs: clamp(think + int(600, 3200), 800, 9900),
          firstInputAtMs: rnd() < 0.94 ? think : null,
          inputChangeCount: clamp(Math.round(gauss(lat.J ? 1.6 : 3.1, 1.1)), 0, 9),
        });
        if (rnd() < 0.85) territoryPicks.push({ playerId: pg.id, svgId: pick(shuffledT).svgId, auto: rnd() < 0.06 });
      }
    }

    const warTurnsN = session.warTurns;
    for (let w = 0; w < warTurnsN; w++) {
      const attacker = pigs[w % pigs.length];
      const defender = pick(pigs.filter((p) => p.id !== attacker.id));
      const targets = int(1, 4);
      const setMin = int(1, 2), setMax = clamp(setMin + int(0, 2), setMin, 4);
      const tgtStrengthBias = attacker.lat.T ? 0.65 : 0.35;
      const targetArmies = rnd() < tgtStrengthBias ? setMax : setMin;
      const leaderReachable = rnd() < 0.5;
      const attackId = `atk-${session.id}-${w}`;
      const auto = rnd() < 0.07;
      const country = pick(countries.filter((c) => c.ownerId === defender.id)) ?? countries[0];
      attacks.push({
        attackerId: attacker.id, defenderId: defender.id, countryId: country.svgId, outcome: "started", auto,
        decision: {
          targetArmies, targetPoints: int(2, 8) * 100, targetIsCapital: rnd() < 0.2,
          targetIsLeader: leaderReachable && rnd() < (attacker.lat.E ? 0.55 : 0.28),
          numTargets: targets, capitalAvailable: rnd() < 0.4, leaderAvailable: leaderReachable,
          pickedWeakestArmies: targetArmies === setMin, pickedStrongestArmies: targetArmies === setMax,
          pickedHighestValue: rnd() < 0.4, setMinArmies: setMin, setMaxArmies: setMax,
          attackerRank: int(1, pigs.length), playersWithLand: pigs.length,
        },
      });
      const q = pick(warQs);
      const aCorrect = rnd() < clamp(0.35 + attacker.lat.skill * 0.5, 0.2, 0.92);
      const dCorrect = rnd() < clamp(0.35 + defender.lat.skill * 0.5, 0.2, 0.92);
      warAnswers.push({ playerId: attacker.id, attackId, questionId: q.id, category: q.category, isCorrect: aCorrect, role: "attacker", submittedAtMs: int(1500, 13000) });
      warAnswers.push({ playerId: defender.id, attackId, questionId: q.id, category: q.category, isCorrect: dCorrect, role: "defender", submittedAtMs: int(1500, 13000) });
      const outcome = aCorrect && !dCorrect ? "attacker_won" : !aCorrect && dCorrect ? "defender_held" : aCorrect && dCorrect ? (rnd() < 0.5 ? "attacker_won" : "defender_held") : "no_change";
      attacks.push({ attackerId: attacker.id, defenderId: defender.id, countryId: country.svgId, outcome, auto: false, capitalFell: outcome === "attacker_won" && rnd() < 0.12 });
    }

    const finalState = {
      stage: "ended", status: "completed", winnerId: winner.id, warTurns: warTurnsN,
      players: pigs.map((pg, idx) => ({ id: pg.id, profileId: pg.profileId, nickname: pg.nickname, turnOrder: idx, capitalStyle: capitalStyleOf.get(pg.id), abandoned: false })),
      countries,
    };
    await prisma.gameSession.update({ where: { id: session.id }, data: { winnerId: winner.id } });
    await prisma.matchSnapshot.create({
      data: { sessionId: session.id, winnerId: winner.id, duration: int(6, 14) * 60_000, createdAt, finalState: finalState as never, telemetry: { numericAnswers, capitalPicks, territoryPicks, warAnswers, attacks } as never },
    });

    // ---- ELO + W/L + history ----
    for (const pg of pigs) {
      const rec = created.find((c) => c.profileId === pg.profileId)!;
      const isWin = pg.id === winner.id;
      const delta = isWin ? int(18, 30) : -int(10, 22);
      rec.elo += delta; rec.xp += isWin ? int(120, 200) : int(40, 90);
      if (isWin) rec.wins += 1; else rec.losses += 1;
      await prisma.eloHistoryEntry.create({ data: { profileId: pg.profileId, sessionId: session.id, eloAfter: rec.elo, delta, isWinner: isWin, createdAt } });
    }
    sessionsMade++;
  }

  for (const rec of created) {
    const level = 1 + Math.floor(rec.xp / 1000);
    await prisma.playerProfile.update({
      where: { id: rec.profileId },
      data: { elo: rec.elo, experience: rec.xp % 1000, level, gamesPlayed: rec.wins + rec.losses, gamesWon: rec.wins, gamesLost: rec.losses },
    });
    // Achievements — run the real catalog against the seeded stats so
    // every unlock is exactly consistent with the player's record
    // (games played, wins, ELO tier, streaks, profile completeness).
    const profileRow = await prisma.playerProfile.findUnique({
      where: { id: rec.profileId },
      select: { birthYear: true, gender: true, education: true, occupation: true, mbti: true, createdAt: true },
    });
    const history = await prisma.eloHistoryEntry.findMany({
      where: { profileId: rec.profileId },
      orderBy: { createdAt: "desc" }, take: 10, select: { isWinner: true },
    });
    const codes = evaluateAchievements({
      gamesPlayed: rec.wins + rec.losses,
      gamesWon: rec.wins,
      elo: rec.elo,
      recentWins: history.map((h) => h.isWinner),
      demographicComplete: Boolean(
        profileRow?.birthYear && profileRow.gender && profileRow.education && profileRow.occupation && profileRow.mbti,
      ),
    });
    if (codes.length) {
      // Backdate unlocks between account creation and now.
      const base = profileRow?.createdAt?.getTime() ?? Date.now() - 30 * 86400_000;
      await prisma.achievement.createMany({
        data: codes.map((code, i) => ({
          profileId: rec.profileId, code,
          unlockedAt: new Date(base + (i + 1) * int(1, 4) * 86400_000),
        })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`created ${sessionsMade} completed matches`);
  const total = await prisma.playerProfile.count();
  const synth = await prisma.playerProfile.count({ where: { synthetic: true } });
  console.log(`done: ${total} players total (${synth} synthetic)`);
}

main().finally(() => prisma.$disconnect());
