export function vehiclePhotoUrl(vehicleId: unknown, photoKey: unknown, photoUpdatedAt: unknown) {
  if (!vehicleId || !photoKey) return "";
  const version = Number(photoUpdatedAt) || 0;
  return `/api/vehicle-photo?id=${encodeURIComponent(String(vehicleId))}&v=${version}`;
}
