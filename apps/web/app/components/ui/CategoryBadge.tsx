// Visual badge for the category of a quiz question. Colour + emoji per
// category make the topic instantly readable in the question UI and gather
// behavioural data ("which categories does this user click faster on?").

const CATEGORY_META: Record<
  string,
  { label: string; emoji: string; tone: string }
> = {
  geography: {
    label: "Geography",
    emoji: "🌍",
    tone: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  },
  history: {
    label: "History",
    emoji: "📜",
    tone: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  },
  math: {
    label: "Math",
    emoji: "🧮",
    tone: "bg-blue-500/15 text-blue-200 border-blue-500/30",
  },
  science: {
    label: "Science",
    emoji: "🔬",
    tone: "bg-cyan-500/15 text-cyan-200 border-cyan-500/30",
  },
  sports: {
    label: "Sports",
    emoji: "⚽",
    tone: "bg-orange-500/15 text-orange-200 border-orange-500/30",
  },
  pop_culture: {
    label: "Pop culture",
    emoji: "🎬",
    tone: "bg-pink-500/15 text-pink-200 border-pink-500/30",
  },
  language: {
    label: "Language",
    emoji: "🔤",
    tone: "bg-purple-500/15 text-purple-200 border-purple-500/30",
  },
  general: {
    label: "General",
    emoji: "❓",
    tone: "bg-gray-500/15 text-gray-300 border-gray-500/30",
  },
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
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border font-semibold ${meta.tone} ${className}`}
    >
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  );
}
