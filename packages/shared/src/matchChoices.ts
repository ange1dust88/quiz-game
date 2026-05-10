// Catalogue of pre-match strategic choices presented to players in the lobby.
// Each entry corresponds to one row in `MatchChoice` keyed by `key`. The
// option `value`s are stored as-is in the DB and later read by game logic
// (e.g. capitalParamsForChoice) and by analytics queries.
//
// The list is small and explicit on purpose — adding a new card means adding
// an entry here, a translator function in match logic, and the lobby UI
// renders it automatically.

export type MatchChoiceOption = {
  value: string;
  emoji: string;
  label: string;
  description: string;
};

export type MatchChoiceCard = {
  key: string;
  title: string;
  subtitle: string;
  defaultValue: string;
  options: MatchChoiceOption[];
};

export const MATCH_CHOICES: MatchChoiceCard[] = [
  {
    key: "capital_style",
    title: "Capital style",
    subtitle:
      "Pick how your capital starts. Same total stake, different risk profile.",
    defaultValue: "standard",
    options: [
      {
        value: "standard",
        emoji: "🛡️",
        label: "Standard",
        description: "3 HP · 1000 pts — harder to lose, smaller payoff.",
      },
      {
        value: "risky",
        emoji: "⚔️",
        label: "Risky",
        description: "2 HP · 1500 pts — bigger reward, falls faster.",
      },
    ],
  },
];

export function isValidChoice(key: string, value: string): boolean {
  const card = MATCH_CHOICES.find((c) => c.key === key);
  if (!card) return false;
  return card.options.some((o) => o.value === value);
}

export function defaultChoiceValue(key: string): string | null {
  return MATCH_CHOICES.find((c) => c.key === key)?.defaultValue ?? null;
}

export function findChoiceOption(
  key: string,
  value: string,
): MatchChoiceOption | null {
  const card = MATCH_CHOICES.find((c) => c.key === key);
  return card?.options.find((o) => o.value === value) ?? null;
}

// Translates a player's `capital_style` choice into the actual capital stats
// applied when they claim a capital. Used by claimCapital, forceAutoCapital,
// and devSkipStage.
export function capitalParamsForChoice(
  choiceValue: string | null | undefined,
): { armies: number; points: number } {
  if (choiceValue === "risky") return { armies: 2, points: 1500 };
  return { armies: 3, points: 1000 };
}
