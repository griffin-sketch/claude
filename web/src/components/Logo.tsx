/** Tourvo logo: blue tile with a T and speed lines, plus the wordmark. */
export function LogoMark({ size = 32, tile = "#1F5FD1" }: { size?: number; tile?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="flex-none">
      <rect x="4" y="4" width="92" height="92" rx="26" fill={tile} />
      <path d="M30 34 H76" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" />
      <path d="M53 34 V74" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" />
      <path d="M16 50 H32" stroke="#9CC3FF" strokeWidth="5" strokeLinecap="round" />
      <path d="M20 62 H36" stroke="#9CC3FF" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 32, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} tile={light ? "#2F74F0" : "#1F5FD1"} />
      <span
        className={`font-sans font-extrabold italic leading-none tracking-[-0.04em] ${light ? "text-white" : "text-ink"}`}
        style={{ fontSize: size * 0.86 }}
      >
        Tourvo
      </span>
    </span>
  );
}
