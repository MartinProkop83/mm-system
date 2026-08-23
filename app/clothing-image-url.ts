export function clothingImageUrl(itemId: unknown, imageKey: unknown, imageUpdatedAt: unknown) {
  if (!itemId || !imageKey) return "";
  const version = Number(imageUpdatedAt) || 0;
  return `/api/clothing-image?id=${encodeURIComponent(String(itemId))}&v=${version}`;
}
