export function inventoryImageUrl(partId: unknown, imageKey: unknown, imageUpdatedAt: unknown) {
  if (!partId || !imageKey) return "";
  const version = Number(imageUpdatedAt) || 0;
  return `/api/inventory-image?id=${encodeURIComponent(String(partId))}&v=${version}`;
}
