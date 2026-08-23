export function raceLogoUrl(templateId: unknown, logoKey: unknown, logoUpdatedAt: unknown) {
  if (!templateId || !logoKey) return "";
  const version = Number(logoUpdatedAt) || 0;
  return `/api/race-template-logo?id=${encodeURIComponent(String(templateId))}&v=${version}`;
}
