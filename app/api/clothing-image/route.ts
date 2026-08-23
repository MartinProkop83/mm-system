import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

const allowedTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const maxBytes = 10 * 1024 * 1024;

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ error: "Clothing item id is required" }, { status: 400 });
  const item = await getD1().prepare(`
    SELECT image_key AS imageKey, image_content_type AS contentType
    FROM clothing_items WHERE id = ? AND archived_at IS NULL
  `).bind(id).first<{ imageKey: string | null; contentType: string | null }>();
  if (!item?.imageKey) return Response.json({ error: "Image not found" }, { status: 404 });
  const object = await getAssetsBucket().get(item.imageKey);
  if (!object) return Response.json({ error: "Image not found" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", item.contentType || object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("cache-control", "private, max-age=86400, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema();
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid upload" }, { status: 400 });
  const itemId = String(form.get("itemId") ?? "").trim();
  const image = form.get("image");
  if (!itemId) return Response.json({ error: "Clothing item id is required" }, { status: 400 });
  if (!(image instanceof File) || !image.size) return Response.json({ error: "Select an image file" }, { status: 400 });
  const extension = allowedTypes.get(image.type);
  if (!extension) return Response.json({ error: "Image must be PNG, JPG or WebP" }, { status: 400 });
  if (image.size > maxBytes) return Response.json({ error: "Image is larger than 10 MB" }, { status: 413 });

  const d1 = getD1();
  const existing = await d1.prepare("SELECT id, image_key AS imageKey FROM clothing_items WHERE id = ? AND archived_at IS NULL")
    .bind(itemId).first<{ id: string; imageKey: string | null }>();
  if (!existing) return Response.json({ error: "Clothing item not found" }, { status: 404 });
  const key = `clothing-images/${itemId}/${crypto.randomUUID()}.${extension}`;
  const now = Date.now();
  const bucket = getAssetsBucket();
  await bucket.put(key, image.stream(), { httpMetadata: { contentType: image.type }, customMetadata: { itemId, uploadedBy: user.email } });
  try {
    await d1.batch([
      d1.prepare("UPDATE clothing_items SET image_key = ?, image_content_type = ?, image_updated_at = ?, updated_at = ? WHERE id = ?")
        .bind(key, image.type, now, now, itemId),
      d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'upload_image', 'clothing_item', ?, ?, ?)")
        .bind(crypto.randomUUID(), user.email, itemId, JSON.stringify({ contentType: image.type, size: image.size }), now),
    ]);
  } catch (error) {
    await bucket.delete(key);
    throw error;
  }
  if (existing.imageKey && existing.imageKey !== key) await bucket.delete(existing.imageKey);
  return Response.json({ itemId, updatedAt: now });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema();
  const payload = await request.json().catch(() => ({})) as { itemId?: unknown };
  const itemId = String(payload.itemId ?? "").trim();
  if (!itemId) return Response.json({ error: "Clothing item id is required" }, { status: 400 });
  const d1 = getD1();
  const existing = await d1.prepare("SELECT image_key AS imageKey FROM clothing_items WHERE id = ? AND archived_at IS NULL")
    .bind(itemId).first<{ imageKey: string | null }>();
  if (!existing) return Response.json({ error: "Clothing item not found" }, { status: 404 });
  const now = Date.now();
  await d1.batch([
    d1.prepare("UPDATE clothing_items SET image_key = NULL, image_content_type = NULL, image_updated_at = NULL, updated_at = ? WHERE id = ?").bind(now, itemId),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'delete_image', 'clothing_item', ?, '{}', ?)").bind(crypto.randomUUID(), user.email, itemId, now),
  ]);
  if (existing.imageKey) await getAssetsBucket().delete(existing.imageKey);
  return Response.json({ itemId });
}
