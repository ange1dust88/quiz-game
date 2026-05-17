// Country tag — for now just the uppercase country code in mono. Once
// we have a real flag set (SVG sprites), this is the single place to
// swap in the image.

type Props = { code?: string | null };

export default function FlagTag({ code }: Props) {
  return (
    <span className="inline-flex items-center font-mono text-[10px] text-mute uppercase">
      {code || "—"}
    </span>
  );
}
