// Shared button component. Replaces the ad-hoc Tailwind blocks that used
// to live inline on every page — Create Game and Join had wildly
// different paddings/radii/hover styles before this.
//
// Variants follow a deliberate visual hierarchy:
//   primary   → main CTA on the screen (one per view ideally)
//   secondary → an opt-in action that isn't the headline
//   ghost     → tertiary / cancel-style with no background until hover
//   danger    → destructive (Disband / Discard match / Reject)
//
// `asChild` isn't supported on purpose — for link-shaped buttons we use
// the Link-styled flavours via the `as` prop ("button" or "a"). Keeps
// the styled surface in one place.

import { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  // Optional leading icon (SVG or any node). Kept generic so callers can
  // drop in their own SVG components without us caring about the lib.
  icon?: ReactNode;
  children?: ReactNode;
};

const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0a0a0f]";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-500 hover:bg-blue-400 text-white shadow-sm shadow-blue-500/20 focus-visible:ring-blue-400",
  secondary:
    "bg-[#1a1a20] hover:bg-[#23232b] text-white border border-[#3a3a45] hover:border-[#4f4f5a] focus-visible:ring-blue-400/60",
  ghost:
    "bg-transparent hover:bg-[#1a1a20]/80 text-gray-300 hover:text-white focus-visible:ring-blue-400/40",
  danger:
    "bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-red-200 border border-red-500/40 hover:border-red-400/70 focus-visible:ring-red-400/60",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm px-4 py-2",
  lg: "text-base px-5 py-2.5",
};

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  icon,
  children,
  className = "",
  ...rest
}: Props) {
  const width = fullWidth ? "w-full" : "";
  return (
    <button
      {...rest}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${width} ${className}`}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
