export function teamLogoUrl(teamId: unknown, logoKey: unknown, logoUpdatedAt: unknown) {
  if (!teamId || !logoKey) return "";
  const version = Number(logoUpdatedAt) || 0;
  return `/api/team-logo?id=${encodeURIComponent(String(teamId))}&v=${version}`;
}
