import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type LogisticsType = "accommodation" | "flight" | "rental";
type AttachmentLeg = "general" | "outbound" | "return";
type AttachmentRow = { id: string; entityType: LogisticsType; entityId: string; leg: AttachmentLeg; fileName: string; objectKey: string; contentType: string; sizeBytes: number; createdAt: number };

const allowedTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const entityTables: Record<LogisticsType, string> = { accommodation: "race_accommodations", flight: "race_flights", rental: "race_car_rentals" };
const maxFileBytes = 15 * 1024 * 1024;
const maxFilesPerRecord = 20;

function clean(value: unknown, max = 300) { return String(value ?? "").trim().slice(0, max); }
function validType(value: string): value is LogisticsType { return value === "accommodation" || value === "flight" || value === "rental"; }
function validLeg(value: string): value is AttachmentLeg { return value === "general" || value === "outbound" || value === "return"; }
function publicAttachment(row: AttachmentRow) {
  return { id: row.id, entityType: row.entityType, entityId: row.entityId, leg: row.leg, fileName: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes, createdAt: row.createdAt, url: `/api/logistics-attachments?id=${encodeURIComponent(row.id)}` };
}

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const id = clean(new URL(request.url).searchParams.get("id"), 80);
  if (!id) return Response.json({ error: "Attachment id is required" }, { status: 400 });
  const attachment = await getD1().prepare(`
    SELECT id, entity_type AS entityType, entity_id AS entityId, leg, file_name AS fileName,
           object_key AS objectKey, content_type AS contentType, size_bytes AS sizeBytes,
           created_at AS createdAt
    FROM travel_attachments WHERE id = ?
  `).bind(id).first<AttachmentRow>();
  if (!attachment) return Response.json({ error: "Attachment not found" }, { status: 404 });
  const object = await getAssetsBucket().get(attachment.objectKey);
  if (!object) return Response.json({ error: "Attachment not found" }, { status: 404 });
  const headers = new Headers(); object.writeHttpMetadata(headers);
  const safeAsciiName = attachment.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  headers.set("content-type", attachment.contentType || object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("content-disposition", `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`);
  headers.set("cache-control", "private, max-age=3600");
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
  const entityType = clean(form.get("entityType"), 30);
  const entityId = clean(form.get("entityId"), 80);
  if (!validType(entityType) || !entityId) return Response.json({ error: "Valid travel record is required" }, { status: 400 });
  const requestedLeg = clean(form.get("leg"), 20);
  const leg: AttachmentLeg = entityType === "flight" && validLeg(requestedLeg) ? requestedLeg : "general";
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return Response.json({ error: "Select at least one file" }, { status: 400 });
  const d1 = getD1();
  const entity = await d1.prepare(`SELECT id FROM ${entityTables[entityType]} WHERE id = ? AND archived_at IS NULL`).bind(entityId).first<{ id: string }>();
  if (!entity) return Response.json({ error: "Travel record not found" }, { status: 404 });
  const count = await d1.prepare("SELECT COUNT(*) AS count FROM travel_attachments WHERE entity_type = ? AND entity_id = ?").bind(entityType, entityId).first<{ count: number }>();
  if (Number(count?.count ?? 0) + files.length > maxFilesPerRecord) return Response.json({ error: `A record can have at most ${maxFilesPerRecord} files` }, { status: 400 });
  for (const file of files) {
    if (!allowedTypes.has(file.type)) return Response.json({ error: "Files must be PDF, PNG, JPG or WebP" }, { status: 400 });
    if (file.size > maxFileBytes) return Response.json({ error: "One of the files is larger than 15 MB" }, { status: 413 });
  }

  const now = Date.now(); const bucket = getAssetsBucket(); const uploaded: AttachmentRow[] = [];
  try {
    for (const file of files) {
      const id = crypto.randomUUID(); const extension = allowedTypes.get(file.type) ?? "bin";
      const key = `travel-attachments/${entityType}/${entityId}/${leg}/${id}.${extension}`;
      await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { entityType, entityId, leg, uploadedBy: user.email, fileName: file.name } });
      uploaded.push({ id, entityType, entityId, leg, fileName: clean(file.name, 240) || `soubor.${extension}`, objectKey: key, contentType: file.type, sizeBytes: file.size, createdAt: now });
    }
    await d1.batch([
      ...uploaded.map((item) => d1.prepare("INSERT INTO travel_attachments (id, entity_type, entity_id, leg, file_name, object_key, content_type, size_bytes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(item.id, item.entityType, item.entityId, item.leg, item.fileName, item.objectKey, item.contentType, item.sizeBytes, user.email, now)),
      d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'upload_files', ?, ?, ?, ?)").bind(crypto.randomUUID(), user.email, entityType, entityId, JSON.stringify({ files: uploaded.map((item) => ({ name: item.fileName, type: item.contentType, size: item.sizeBytes })) }), now),
    ]);
  } catch (error) {
    await Promise.all(uploaded.map((item) => bucket.delete(item.objectKey).catch(() => undefined)));
    throw error;
  }
  return Response.json({ attachments: uploaded.map(publicAttachment) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema();
  const payload = await request.json().catch(() => ({})) as { id?: unknown };
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Attachment id is required" }, { status: 400 });
  const d1 = getD1();
  const attachment = await d1.prepare("SELECT id, entity_type AS entityType, entity_id AS entityId, object_key AS objectKey FROM travel_attachments WHERE id = ?").bind(id).first<{ id: string; entityType: string; entityId: string; objectKey: string }>();
  if (!attachment) return Response.json({ error: "Attachment not found" }, { status: 404 });
  const now = Date.now();
  await d1.batch([
    d1.prepare("DELETE FROM travel_attachments WHERE id = ?").bind(id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'delete_file', ?, ?, ?, ?)").bind(crypto.randomUUID(), user.email, attachment.entityType, attachment.entityId, JSON.stringify({ attachmentId: id }), now),
  ]);
  await getAssetsBucket().delete(attachment.objectKey);
  return Response.json({ id });
}
