import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { sniffFileType } from "../../file-signature";

const allowedTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const maxPhotoBytes = 5 * 1024 * 1024;

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ error: "Vehicle id is required" }, { status: 400 });

  const vehicle = await getD1().prepare(`
    SELECT photo_key AS photoKey, photo_content_type AS photoContentType
    FROM vehicles WHERE id = ? AND archived_at IS NULL
  `).bind(id).first<{ photoKey: string | null; photoContentType: string | null }>();
  if (!vehicle?.photoKey) return Response.json({ error: "Photo not found" }, { status: 404 });

  const object = await getAssetsBucket().get(vehicle.photoKey);
  if (!object) return Response.json({ error: "Photo not found" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", vehicle.photoContentType || object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("cache-control", "private, max-age=86400, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload" }, { status: 400 });
  }
  const vehicleId = String(form.get("vehicleId") ?? "").trim();
  const photo = form.get("logo");
  if (!vehicleId) return Response.json({ error: "Vehicle id is required" }, { status: 400 });
  if (!(photo instanceof File) || !photo.size) return Response.json({ error: "Select a photo file" }, { status: 400 });
  if (photo.size > maxPhotoBytes) return Response.json({ error: "Photo is larger than 5 MB" }, { status: 413 });
  const sniffed = await sniffFileType(photo);
  if (!sniffed || !allowedTypes.has(sniffed.type)) return Response.json({ error: "Photo must be PNG, JPG or WebP" }, { status: 400 });
  const { type: contentType, extension } = sniffed;

  const d1 = getD1();
  const existing = await d1.prepare(`
    SELECT id, photo_key AS photoKey FROM vehicles
    WHERE id = ? AND archived_at IS NULL
  `).bind(vehicleId).first<{ id: string; photoKey: string | null }>();
  if (!existing) return Response.json({ error: "Vehicle not found" }, { status: 404 });

  const key = `vehicle-photos/${vehicleId}/${crypto.randomUUID()}.${extension}`;
  const now = Date.now();
  const bucket = getAssetsBucket();
  await bucket.put(key, photo.stream(), {
    httpMetadata: { contentType },
    customMetadata: { vehicleId, uploadedBy: user.email },
  });
  try {
    await d1.batch([
      d1.prepare(`
        UPDATE vehicles
        SET photo_key = ?, photo_content_type = ?, photo_updated_at = ?, updated_at = ?
        WHERE id = ? AND archived_at IS NULL
      `).bind(key, contentType, now, now, vehicleId),
      d1.prepare(`
        INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, 'upload_photo', 'vehicle', ?, ?, ?)
      `).bind(crypto.randomUUID(), user.email, vehicleId, JSON.stringify({ contentType, size: photo.size }), now),
    ]);
  } catch (error) {
    await bucket.delete(key);
    throw error;
  }
  if (existing.photoKey && existing.photoKey !== key) await bucket.delete(existing.photoKey);
  return Response.json({ vehicleId, updatedAt: now });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema();
  const payload = await request.json().catch(() => ({})) as { vehicleId?: string };
  const vehicleId = String(payload.vehicleId ?? "").trim();
  if (!vehicleId) return Response.json({ error: "Vehicle id is required" }, { status: 400 });

  const d1 = getD1();
  const existing = await d1.prepare(`
    SELECT photo_key AS photoKey FROM vehicles WHERE id = ? AND archived_at IS NULL
  `).bind(vehicleId).first<{ photoKey: string | null }>();
  if (!existing) return Response.json({ error: "Vehicle not found" }, { status: 404 });
  const now = Date.now();
  await d1.batch([
    d1.prepare(`UPDATE vehicles SET photo_key = NULL, photo_content_type = NULL, photo_updated_at = NULL, updated_at = ? WHERE id = ?`).bind(now, vehicleId),
    d1.prepare(`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'delete_photo', 'vehicle', ?, '{}', ?)`).bind(crypto.randomUUID(), user.email, vehicleId, now),
  ]);
  if (existing.photoKey) await getAssetsBucket().delete(existing.photoKey);
  return Response.json({ vehicleId });
}
