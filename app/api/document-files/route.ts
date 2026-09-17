import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";
import { sniffFileType } from "../../file-signature";

/**
 * Soubory knihovny dokumentů v R2 — stejný vzor jako `travel_attachments`/`engine_documents`
 * (bucket `UPLOADS`, bajtová signatura místo věření přípony, GET streamuje s `inline`
 * dispozicí a prohlížeč sám rozhodne, jestli soubor otevře nebo stáhne).
 *
 * Na rozdíl od těch dvou je tahle knihovna obecná, ne jen PDF/obrázky — proto širší seznam
 * povolených typů včetně kancelářských formátů (viz `app/file-signature.ts`).
 */

const allowedTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  ["application/msword", "doc"],
  ["application/vnd.ms-excel", "xls"],
  ["application/vnd.ms-powerpoint", "ppt"],
  ["application/zip", "zip"],
]);
const maxFileBytes = 15 * 1024 * 1024;

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

type FileRow = { id: string; folderId: string; fileName: string; objectKey: string; contentType: string; sizeBytes: number; createdAt: number };

function publicFile(row: FileRow) {
  return { id: row.id, fileName: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes, createdAt: row.createdAt, url: `/api/document-files?id=${encodeURIComponent(row.id)}` };
}

/** "Homologace.pdf" nahrané podruhé do stejné složky se nezahodí ani nepřepíše — dostane
 *  "Homologace (2).pdf". Počítá se i s víc stejnojmennými soubory v jedné dávce najednou. */
function uniqueFileName(desired: string, taken: Set<string>) {
  if (!taken.has(desired.toLowerCase())) return desired;
  const dot = desired.lastIndexOf(".");
  const base = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : "";
  let counter = 2;
  let candidate = `${base} (${counter})${ext}`;
  while (taken.has(candidate.toLowerCase())) { counter += 1; candidate = `${base} (${counter})${ext}`; }
  return candidate;
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  await ensureRuntimeSchema();
  const id = clean(new URL(request.url).searchParams.get("id"), 80);
  if (!id) return Response.json({ error: "File id is required" }, { status: 400 });
  const file = await getD1().prepare("SELECT id, folder_id AS folderId, file_name AS fileName, object_key AS objectKey, content_type AS contentType, size_bytes AS sizeBytes, created_at AS createdAt FROM document_files WHERE id = ?").bind(id).first<FileRow>();
  if (!file) return Response.json({ error: "File not found" }, { status: 404 });
  const object = await getAssetsBucket().get(file.objectKey);
  if (!object) return Response.json({ error: "File not found" }, { status: 404 });
  const headers = new Headers(); object.writeHttpMetadata(headers);
  const safeAsciiName = file.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  headers.set("content-type", file.contentType || object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("content-disposition", `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  await ensureRuntimeSchema();
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid upload" }, { status: 400 });
  const folderId = clean(form.get("folderId"), 80);
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return Response.json({ error: "Select at least one file" }, { status: 400 });

  const d1 = getD1();
  if (folderId) {
    const folder = await d1.prepare("SELECT id FROM document_folders WHERE id = ?").bind(folderId).first<{ id: string }>();
    if (!folder) return Response.json({ error: "Folder not found" }, { status: 404 });
  }

  const sniffed = await Promise.all(files.map((file) => sniffFileType(file, file.name)));
  for (let i = 0; i < files.length; i++) {
    if (!sniffed[i] || !allowedTypes.has(sniffed[i]!.type)) return Response.json({ error: "Unsupported file type" }, { status: 400 });
    if (files[i].size > maxFileBytes) return Response.json({ error: "One of the files is larger than 15 MB" }, { status: 413 });
  }

  const existing = await d1.prepare("SELECT file_name AS fileName FROM document_files WHERE folder_id = ?").bind(folderId).all<{ fileName: string }>();
  const takenNames = new Set(existing.results.map((row) => row.fileName.toLowerCase()));

  const now = Date.now(); const bucket = getAssetsBucket(); const uploaded: FileRow[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]; const { type: contentType, extension } = sniffed[i]!;
      const id = crypto.randomUUID();
      const key = `documents/${id}.${extension}`;
      const desiredName = clean(file.name, 240) || `soubor.${extension}`;
      const fileName = uniqueFileName(desiredName, takenNames);
      takenNames.add(fileName.toLowerCase());
      await bucket.put(key, file.stream(), { httpMetadata: { contentType }, customMetadata: { folderId, uploadedBy: user.email, fileName } });
      uploaded.push({ id, folderId, fileName, objectKey: key, contentType, sizeBytes: file.size, createdAt: now });
    }
    await d1.batch([
      ...uploaded.map((item) => d1.prepare("INSERT INTO document_files (id, folder_id, file_name, object_key, content_type, size_bytes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(item.id, item.folderId, item.fileName, item.objectKey, item.contentType, item.sizeBytes, user.email, now)),
      d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'upload_files', 'document_folder', ?, ?, ?)").bind(crypto.randomUUID(), user.email, folderId, JSON.stringify({ files: uploaded.map((item) => ({ name: item.fileName, type: item.contentType, size: item.sizeBytes })) }), now),
    ]);
  } catch (error) {
    await Promise.all(uploaded.map((item) => bucket.delete(item.objectKey).catch(() => undefined)));
    throw error;
  }
  return Response.json({ files: uploaded.map(publicFile) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  await ensureRuntimeSchema();
  const payload = await request.json().catch(() => ({})) as { id?: unknown };
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "File id is required" }, { status: 400 });
  const d1 = getD1();
  const file = await d1.prepare("SELECT id, folder_id AS folderId, file_name AS fileName, object_key AS objectKey FROM document_files WHERE id = ?").bind(id).first<{ id: string; folderId: string; fileName: string; objectKey: string }>();
  if (!file) return Response.json({ error: "File not found" }, { status: 404 });
  const now = Date.now();
  await d1.batch([
    d1.prepare("DELETE FROM document_files WHERE id = ?").bind(id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'delete_file', 'document_folder', ?, ?, ?)").bind(crypto.randomUUID(), user.email, file.folderId, JSON.stringify({ fileId: id, fileName: file.fileName }), now),
  ]);
  await getAssetsBucket().delete(file.objectKey);
  return Response.json({ id });
}
