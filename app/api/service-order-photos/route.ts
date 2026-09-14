import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";
import { sniffFileType } from "../../file-signature";

/**
 * Fotky při příjmu zakázky — nepovinné, stejný vzor jako `/api/engine-documents`: binárka do
 * R2, tady jen metadata. `orderEngineId` je nepovinné: u zakázky na víc motorů se fotka váže
 * ke konkrétnímu kusu, jinak zůstává u zakázky jako celku.
 *
 * Jen obrázky (PDF sem nepatří — to je doklad, ne fotodokumentace) a jen superadmin/vedení,
 * stejně jako zbytek sekce Zakázky.
 */

const allowedTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const maxFileBytes = 15 * 1024 * 1024;

type PhotoRow = {
  id: string; orderId: string; orderEngineId: string | null; fileName: string; objectKey: string;
  contentType: string; sizeBytes: number; note: string; createdBy: string; createdAt: number;
};

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function publicPhoto(row: PhotoRow) {
  return {
    id: row.id, orderId: row.orderId, orderEngineId: row.orderEngineId,
    fileName: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes,
    note: row.note, createdBy: row.createdBy, createdAt: row.createdAt,
    url: `/api/service-order-photos?id=${encodeURIComponent(row.id)}`,
  };
}

async function requireManager(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return { error: auth.error } as const;
  if (auth.user.role === "mechanic") return { error: Response.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { user: auth.user } as const;
}

export async function GET(request: Request) {
  const guard = await requireManager(request);
  if (guard.error) return guard.error;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const url = new URL(request.url);
  const id = clean(url.searchParams.get("id"), 80);
  if (!id) return Response.json({ error: "Photo id is required" }, { status: 400 });

  const photo = await d1.prepare(`
    SELECT id, order_id AS orderId, order_engine_id AS orderEngineId, file_name AS fileName,
           object_key AS objectKey, content_type AS contentType, size_bytes AS sizeBytes,
           note, created_by AS createdBy, created_at AS createdAt
    FROM service_order_photos WHERE id = ?
  `).bind(id).first<PhotoRow>();
  if (!photo) return Response.json({ error: "Photo not found" }, { status: 404 });
  const object = await getAssetsBucket().get(photo.objectKey);
  if (!object) return Response.json({ error: "Photo not found" }, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const safeAsciiName = photo.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  headers.set("content-type", photo.contentType || object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("content-disposition", `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(photo.fileName)}`);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  const guard = await requireManager(request);
  if (guard.error) return guard.error;

  await ensureRuntimeSchema();
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid upload" }, { status: 400 });

  const orderId = clean(form.get("orderId"), 80);
  const orderEngineId = clean(form.get("orderEngineId"), 80) || null;
  const note = clean(form.get("note"), 500);
  if (!orderId) return Response.json({ error: "Order id is required" }, { status: 400 });

  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return Response.json({ error: "Select at least one file" }, { status: 400 });

  const d1 = getD1();
  const order = await d1.prepare("SELECT id FROM service_orders WHERE id = ?").bind(orderId).first<{ id: string }>();
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (orderEngineId) {
    const engine = await d1.prepare("SELECT id FROM service_order_engines WHERE id = ? AND order_id = ?").bind(orderEngineId, orderId).first();
    if (!engine) return Response.json({ error: "Order engine not found" }, { status: 404 });
  }

  const sniffed = await Promise.all(files.map((file) => sniffFileType(file)));
  for (let i = 0; i < files.length; i++) {
    if (!sniffed[i] || !allowedTypes.has(sniffed[i]!.type)) return Response.json({ error: "Files must be PNG, JPG or WebP" }, { status: 400 });
    if (files[i].size > maxFileBytes) return Response.json({ error: "One of the files is larger than 15 MB" }, { status: 413 });
  }

  const now = Date.now();
  const bucket = getAssetsBucket();
  const uploaded: PhotoRow[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { type: contentType, extension } = sniffed[i]!;
      const id = crypto.randomUUID();
      const key = `service-order-photos/${orderId}/${id}.${extension}`;
      await bucket.put(key, file.stream(), {
        httpMetadata: { contentType },
        customMetadata: { orderId, orderEngineId: orderEngineId ?? "", uploadedBy: guard.user.email, fileName: file.name },
      });
      uploaded.push({
        id, orderId, orderEngineId, fileName: clean(file.name, 240) || `foto.${extension}`,
        objectKey: key, contentType, sizeBytes: file.size, note, createdBy: guard.user.email, createdAt: now,
      });
    }
    await getD1().batch(uploaded.map((item) => getD1().prepare(`
      INSERT INTO service_order_photos (id, order_id, order_engine_id, file_name, object_key, content_type, size_bytes, note, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(item.id, item.orderId, item.orderEngineId, item.fileName, item.objectKey, item.contentType, item.sizeBytes, item.note, item.createdBy, item.createdAt)));
  } catch (error) {
    await Promise.all(uploaded.map((item) => bucket.delete(item.objectKey).catch(() => undefined)));
    throw error;
  }

  return Response.json({ photos: uploaded.map(publicPhoto) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const guard = await requireManager(request);
  if (guard.error) return guard.error;

  await ensureRuntimeSchema();
  const payload = await request.json().catch(() => ({})) as { id?: unknown };
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Photo id is required" }, { status: 400 });

  const d1 = getD1();
  const photo = await d1.prepare("SELECT id, object_key AS objectKey FROM service_order_photos WHERE id = ?").bind(id).first<{ id: string; objectKey: string }>();
  if (!photo) return Response.json({ error: "Photo not found" }, { status: 404 });

  await d1.prepare("DELETE FROM service_order_photos WHERE id = ?").bind(id).run();
  await getAssetsBucket().delete(photo.objectKey);
  return Response.json({ id });
}
