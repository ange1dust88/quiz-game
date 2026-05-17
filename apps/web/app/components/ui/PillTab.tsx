// Pill tab strip used inside PanelCard headers (Match history, Lobby
// chat, etc.). Active tab gets a cyan underline; "dim" props grey it
// out for not-yet-built variants.

import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  dim?: boolean;
};

export default function PillTab({
  label,
  active = false,
  dim = false,
  className = "",
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={dim || rest.disabled}
      className={`relative font-head text-[10px] px-3 py-1 border-x border-stroke -mx-px transition-colors ${
        active
          ? "text-white bg-surface-hi"
          : dim
            ? "text-dim cursor-not-allowed"
            : "text-mute hover:text-white"
      } ${className}`}
    >
      {label}
      {active && (
        <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-accent" />
      )}
    </button>
  );
}
