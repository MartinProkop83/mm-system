export function RaceLogoBadge({ logoUrl, name, fallback, size = "default" }: { logoUrl?: string; name: string; fallback?: string; size?: "small" | "default" | "large" }) {
  return <span className={`race-logo-badge size-${size}`} aria-label={logoUrl ? `${name} logo` : undefined}>
    {logoUrl ? <>
      {/* The logo comes from our authenticated R2 route, so a native image is intentional here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt={`${name} logo`} />
    </> : <span aria-hidden="true">{fallback || "⚑"}</span>}
  </span>;
}
