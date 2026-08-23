export function circuitImageUrl(circuitId: unknown, imageKey: unknown, imageUpdatedAt: unknown) {
  if (!circuitId || !imageKey) return "";
  const version = Number(imageUpdatedAt) || 0;
  return `/api/circuit-image?id=${encodeURIComponent(String(circuitId))}&v=${version}`;
}
