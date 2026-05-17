// Slashed FACEIT-style label. Uses a skew transform on the wrapper
// (content counter-skewed back to upright) so the parallelogram shape
// never clips characters off — the previous clip-path version was
// cropping the leading letter at narrow widths.
//
// `dark` flips it to a filled chip (used for Host badge, etc.).

import { CSSProperties } from "react";

type Props = {
  label: string;
  color?: string;
  dark?: boolean;
};

export default function Slash({
  label,
  color = "#1ed3ff",
  dark = false,
}: Props) {
  const outer: CSSProperties = {
    transform: "skewX(-12deg)",
    background: dark ? color : "transparent",
    border: dark ? "none" : `1px solid ${color}`,
    color: dark ? "#06141c" : color,
  };
  const inner: CSSProperties = {
    transform: "skewX(12deg)",
    display: "inline-block",
  };
  return (
    <span
      className="inline-flex items-center font-head text-[10px] px-4 py-1"
      style={outer}
    >
      <span style={inner}>{label}</span>
    </span>
  );
}
