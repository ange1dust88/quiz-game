// FACEIT-style category tag. Slash-style parallelogram with category
// colour as outline + soft fill. The category drives the topic colour
// so the topic is readable at a glance during the match.

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  geography: { label: "Geography", color: "var(--color-win)" },
  history: { label: "History", color: "var(--color-gold)" },
  math: { label: "Math", color: "var(--color-accent)" },
  science: { label: "Science", color: "var(--color-blue2)" },
  sports: { label: "Sports", color: "#ff8a2a" },
  pop_culture: { label: "Pop culture", color: "var(--color-purple2)" },
  language: { label: "Language", color: "#ff6cf3" },
  general: { label: "General", color: "var(--color-mute)" },
};

export default function CategoryBadge({
  category,
  className = "",
}: {
  category: string;
  className?: string;
}) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.general;
  return (
    <span
      className={`inline-flex items-center font-head text-[10px] px-3 py-0.5 border w-fit ${className}`}
      style={{
        background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${meta.color} 50%, transparent)`,
        color: meta.color,
        transform: "skewX(-10deg)",
      }}
    >
      <span style={{ display: "inline-block", transform: "skewX(10deg)" }}>
        {meta.label}
      </span>
    </span>
  );
}
