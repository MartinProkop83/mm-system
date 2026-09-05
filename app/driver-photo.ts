export function driverPhotoUrl(driverId: unknown, photoKey: unknown, photoUpdatedAt: unknown) {
  if (!driverId || !photoKey) return "";
  const version = Number(photoUpdatedAt) || 0;
  return `/api/driver-photo?id=${encodeURIComponent(String(driverId))}&v=${version}`;
}
