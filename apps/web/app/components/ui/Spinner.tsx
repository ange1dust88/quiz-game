// Minimal CSS-only loading spinner. Pure presentational — no props, no
// state — so it works in both server and client components.

export default function Spinner({ size = 32 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        width: size,
        height: size,
        borderTopColor: "var(--color-accent)",
      }}
      className="inline-block animate-spin rounded-full border-2 border-[var(--color-stroke)]"
    />
  );
}
