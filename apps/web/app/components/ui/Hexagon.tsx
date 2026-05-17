// Level / rank hexagon, FACEIT-style. Scales by `size` (the polygon
// always fills a (size × size · 1.13) box) and accepts a fill colour
// per usage — gold for "your level", red for higher ranks, etc.

type Props = {
  value: number | string;
  size?: number;
  // Defines look. "filled" = solid hex (logo / chip use). "outlined" =
  // thick coloured stroke over the panel background (FACEIT-style
  // level badge in the rank widget + leaderboard rows).
  variant?: "filled" | "outlined";
  color?: string;
  textColor?: string;
};

export default function Hexagon({
  value,
  size = 56,
  variant = "filled",
  color = "#1ed3ff",
  textColor,
}: Props) {
  const width = size;
  const height = Math.round(size * 1.13);
  const isOutlined = variant === "outlined";
  const stroke = isOutlined ? color : "rgba(255,255,255,0.18)";
  const fill = isOutlined ? "transparent" : color;
  const textFill = textColor ?? (isOutlined ? color : "#ffffff");
  // Thicker stroke for outlined so it reads at small sizes.
  const strokeWidth = isOutlined ? 2.5 : 1;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 32 36"
      aria-hidden="true"
      className="shrink-0"
    >
      <polygon
        points="16,1 31,9 31,27 16,35 1,27 1,9"
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <text
        x="16"
        y="23"
        textAnchor="middle"
        fill={textFill}
        fontSize={String(value).length > 1 ? "12" : "14"}
        fontWeight="900"
        fontFamily="var(--font-geist-sans), system-ui"
      >
        {value}
      </text>
    </svg>
  );
}
