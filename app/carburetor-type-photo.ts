export function carburetorTypePhotoUrl(typeId: unknown, photoKey: unknown, photoUpdatedAt: unknown) {
  if (!typeId || !photoKey) return "";
  const version = Number(photoUpdatedAt) || 0;
  return `/api/carburetor-type-photo?id=${encodeURIComponent(String(typeId))}&v=${version}`;
}
