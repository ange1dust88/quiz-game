// Shared "frosted dark panel" container. Replaces the
// `bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl`
// block that was copy-pasted across ~20 places.
//
// `tone` controls the border emphasis:
//   default → neutral grey, used by most cards
//   accent  → purple highlight (use sparingly — picks the eye)
//   muted   → flat, no backdrop blur, slightly recessed
//
// `padding` defaults to comfortable. Pass `tight` for dense feeds
// (player lists, podium rows).

import { HTMLAttributes, ReactNode } from "react";

export type CardTone = "default" | "accent" | "muted";
export type CardPadding = "tight" | "default" | "loose";

type Props = HTMLAttributes<HTMLElement> & {
  tone?: CardTone;
  padding?: CardPadding;
  as?: "section" | "div" | "article";
  children?: ReactNode;
};

const TONES: Record<CardTone, string> = {
  default:
    "bg-[#1a1a1a]/70 backdrop-blur border border-[#3a3a45] hover:border-[#4f4f5a] transition-colors",
  accent:
    "bg-blue-500/8 backdrop-blur border border-blue-500/40 hover:border-blue-400/60 transition-colors",
  muted: "bg-[#141418] border border-[#23232b]",
};

const PADDING: Record<CardPadding, string> = {
  tight: "p-3",
  default: "p-5",
  loose: "p-7",
};

export default function Card({
  tone = "default",
  padding = "default",
  as = "section",
  className = "",
  children,
  ...rest
}: Props) {
  const Comp = as;
  return (
    <Comp
      {...rest}
      className={`rounded-2xl ${TONES[tone]} ${PADDING[padding]} ${className}`}
    >
      {children}
    </Comp>
  );
}
