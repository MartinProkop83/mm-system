import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { sniffFileType } from "../../file-signature";

const allowedTypes = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);
const maxBytes = 10 * 1024 * 1024;

export async function GET(request: Request) {
  const user = await getAppUser(); if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema(); const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  const circuit = await getD1().prepare("SELECT image_key AS imageKey,image_content_type AS contentType FROM circuits WHERE id=?").bind(id).first<{imageKey:string|null;contentType:string|null}>();
  if (!circuit?.imageKey) return Response.json({ error: "Image not found" }, { status: 404 });
  const object = await getAssetsBucket().get(circuit.imageKey); if (!object) return Response.json({ error: "Image not found" }, { status: 404 });
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("content-type", circuit.contentType || object.httpMetadata?.contentType || "application/octet-stream"); headers.set("cache-control", "private, max-age=86400, immutable"); headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  const user = await getAppUser(); if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema(); const form = await request.formData().catch(() => null); if (!form) return Response.json({ error: "Invalid upload" }, { status: 400 });
  const circuitId = String(form.get("circuitId") ?? "").trim(); const image = form.get("image");
  if (!circuitId) return Response.json({ error: "Circuit id is required" }, { status: 400 });
  if (!(image instanceof File) || !image.size) return Response.json({ error: "Select an image file" }, { status: 400 });
  if (image.size > maxBytes) return Response.json({ error: "Image is larger than 10 MB" }, { status: 413 });
  const sniffed = await sniffFileType(image);
  if (!sniffed || !allowedTypes.has(sniffed.type)) return Response.json({ error: "Image must be PNG, JPG or WebP" }, { status: 400 });
  const { type: contentType, extension } = sniffed;
  const d1 = getD1(); const existing = await d1.prepare("SELECT id,image_key AS imageKey FROM circuits WHERE id=? AND archived_at IS NULL").bind(circuitId).first<{id:string;imageKey:string|null}>();
  if (!existing) return Response.json({ error: "Circuit not found" }, { status: 404 });
  const key = `circuit-images/${circuitId}/${crypto.randomUUID()}.${extension}`; const now = Date.now(); const bucket = getAssetsBucket();
  await bucket.put(key, image.stream(), { httpMetadata: { contentType }, customMetadata: { circuitId, uploadedBy: user.email } });
  try { await d1.batch([
    d1.prepare("UPDATE circuits SET image_key=?,image_content_type=?,image_updated_at=?,updated_at=? WHERE id=?").bind(key,contentType,now,now,circuitId),
    d1.prepare(`INSERT INTO audit_logs (id,actor_email,action,entity_type,entity_id,details,created_at) VALUES (?,?,'upload_image','circuit',?,?,?)`).bind(crypto.randomUUID(),user.email,circuitId,JSON.stringify({contentType,size:image.size}),now),
  ]); } catch (error) { await bucket.delete(key); throw error; }
  if (existing.imageKey && existing.imageKey !== key) await bucket.delete(existing.imageKey);
  return Response.json({ circuitId, updatedAt: now });
}
