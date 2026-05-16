// Single source of truth for the "user avatar" visual. If the profile
// has an avatarUrl (admin-approved upload), render the image; otherwise
// fall back to the initial letter on a coloured square / circle.
//
// Two style flavours are exposed via `shape`:
//   - "circle"  → round avatar (header / settings / floating chips)
//   - "square"  → rounded-md (PlayerPanel / lobby seats / leaderboard)
// Colour is either explicit (player seat colour) or a default gradient.

import { CSSProperties } from "react";

type Props = {
  nickname: string;
  avatarUrl?: string | null;
  // px — used for both width and height.
  size?: number;
  // "circle" = rounded-full, "square" = rounded-md.
  shape?: "circle" | "square";
  // Background when there's no image (e.g. seat colour). Defaults to a
  // blue→purple gradient.
  color?: string;
  className?: string;
};

export default function Avatar({
  nickname,
  avatarUrl,
  size = 32,
  shape = "circle",
  color,
  className = "",
}: Props) {
  const rounded = shape === "circle" ? "rounded-full" : "rounded-md";
  const initial = (nickname || "?").charAt(0).toUpperCase();
  const style: CSSProperties = { width: size, height: size };
  if (!avatarUrl && color) style.backgroundColor = color;

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={nickname}
        className={`${rounded} object-cover shrink-0 ${className}`}
        style={style}
      />
    );
  }

  const bgClass = color
    ? ""
    : "bg-gradient-to-br from-blue-400 to-blue-500";
  // Scale the initial letter so a 32px avatar gets a smaller letter than
  // a 80px one without callers tweaking it manually.
  const fontPx = Math.max(10, Math.round(size * 0.42));
  return (
    <div
      className={`${rounded} ${bgClass} flex items-center justify-center font-bold shrink-0 ${color ? "text-black" : "text-white"} ${className}`}
      style={{ ...style, fontSize: fontPx, lineHeight: 1 }}
    >
      {initial}
    </div>
  );
}
