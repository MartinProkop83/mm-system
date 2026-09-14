import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";
import { sniffFileType } from "../../file-signature";

/**
 * Dokumenty motoru — faktura, homologace, fotodokumentace a podobně.
 *
 * Stejný vzor jako `/api/logistics-attachments`: binárka do R2 (`getAssetsBucket()`), do D1
 * jen metadata. Mechanik na tuhle routu nesmí vůbec — není v `MECHANIC_READ`/`MECHANIC_WRITE`
 * v `app/api-access.ts`, takže default-deny ho zastaví dřív, než by se dostal k datům.
 * Nemá to ani vlastní kontrolu navíc, protože pro mechanika je tahle routa čistě neexistující.
 *
 * Archivace motoru dokumenty nemaže — jsou to účetní a technické doklady, které mají zůstat
 * dohledatelné i u motoru, který se dál nepoužívá. Prodej se dnes nechová jinak: dokumenty
 * zůstávají u nás, žádné předávání kupci ještě neběží (viz `hand_over_to_buyer` v číselníku
 * typů — jen připravený příznak pro budoucí druhý krok).
 */

const allowedTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const maxFileBytes = 15 * 1024 * 1024;
const maxFilesPerEngine = 50;

type DocumentRow = {
  id: string; engineId: string; documentTypeId: string; fileName: string; objectKey: string;
  contentType: string; sizeBytes: number; note: string; createdBy: string; createdAt: number;
};

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function publicDocument(row: DocumentRow & { typeNameCs?: string; typeNameEn?: string }) {
  return {
    id: row.id, engineId: row.engineId, documentTypeId: row.documentTypeId,
    typeNameCs: row.typeNameCs, typeNameEn: row.typeNameEn,
    fileName: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes,
    note: row.note, createdBy: row.createdBy, createdAt: row.createdAt,
    url: `/api/engine-documents?id=${encodeURIComponent(row.id)}`,
  };
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const url = new URL(request.url);
  const id = clean(url.searchParams.get("id"), 80);

  // S `id` se streamuje samotný soubor — náhled i stažení jdou přes tenhle jeden odkaz.
  if (id) {
    const document = await d1.prepare(`
      SELECT id, engine_id AS engineId, document_type_id AS documentTypeId, file_name AS fileName,
             object_key AS objectKey, content_type AS contentType, size_bytes AS sizeBytes,
             note, created_by AS createdBy, created_at AS createdAt
      FROM engine_documents WHERE id = ?
    `).bind(id).first<DocumentRow>();
    if (!document) return Response.json({ error: "Document not found" }, { status: 404 });
    const object = await getAssetsBucket().get(document.objectKey);
    if (!object) return Response.json({ error: "Document not found" }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    const safeAsciiName = document.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    headers.set("content-type", document.contentType || object.httpMetadata?.contentType || "application/octet-stream");
    headers.set("content-disposition", `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(document.fileName)}`);
    headers.set("cache-control", "private, max-age=3600");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  }

  const engineId = clean(url.searchParams.get("engineId"), 80);
  if (!engineId) return Response.json({ error: "Engine id is required" }, { status: 400 });

  const [documents, types] = await Promise.all([
    d1.prepare(`
      SELECT d.id, d.engine_id AS engineId, d.document_type_id AS documentTypeId, d.file_name AS fileName,
             d.object_key AS objectKey, d.content_type AS contentType, d.size_bytes AS sizeBytes,
             d.note, d.created_by AS createdBy, d.created_at AS createdAt,
             t.name_cs AS typeNameCs, t.name_en AS typeNameEn
      FROM engine_documents d
      JOIN engine_document_types t ON t.id = d.document_type_id
      WHERE d.engine_id = ?
      ORDER BY d.created_at DESC
    `).bind(engineId).all<DocumentRow & { typeNameCs: string; typeNameEn: string }>(),
    d1.prepare(`
      SELECT id, name_cs AS nameCs, name_en AS nameEn
      FROM engine_document_types WHERE archived_at IS NULL ORDER BY sort_order
    `).all(),
  ]);

  return Response.json({
    documents: documents.results.map(publicDocument),
    types: types.results,
  });
}

export async function POST(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });

  await ensureRuntimeSchema();
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid upload" }, { status: 400 });

  const engineId = clean(form.get("engineId"), 80);
  const documentTypeId = clean(form.get("documentTypeId"), 80);
  const note = clean(form.get("note"), 500);
  if (!engineId) return Response.json({ error: "Engine id is required" }, { status: 400 });
  if (!documentTypeId) return Response.json({ error: "Document type is required" }, { status: 400 });

  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return Response.json({ error: "Select at least one file" }, { status: 400 });

  const d1 = getD1();
  const [engine, type, count] = await Promise.all([
    d1.prepare("SELECT id FROM engines WHERE id = ?").bind(engineId).first<{ id: string }>(),
    d1.prepare("SELECT id FROM engine_document_types WHERE id = ? AND archived_at IS NULL").bind(documentTypeId).first<{ id: string }>(),
    d1.prepare("SELECT COUNT(*) AS count FROM engine_documents WHERE engine_id = ?").bind(engineId).first<{ count: number }>(),
  ]);
  if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });
  if (!type) return Response.json({ error: "Unknown or inactive document type" }, { status: 400 });
  if (Number(count?.count ?? 0) + files.length > maxFilesPerEngine) {
    return Response.json({ error: `An engine can have at most ${maxFilesPerEngine} documents` }, { status: 400 });
  }

  // Typ se poznává z obsahu souboru, ne z toho, co tvrdí prohlížeč — přejmenovaný soubor
  // s cizí příponou takhle neprojde.
  const sniffed = await Promise.all(files.map((file) => sniffFileType(file)));
  for (let i = 0; i < files.length; i++) {
    if (!sniffed[i] || !allowedTypes.has(sniffed[i]!.type)) return Response.json({ error: "Files must be PDF, PNG, JPG or WebP" }, { status: 400 });
    if (files[i].size > maxFileBytes) return Response.json({ error: "One of the files is larger than 15 MB" }, { status: 413 });
  }

  const now = Date.now();
  const bucket = getAssetsBucket();
  const uploaded: DocumentRow[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { type: contentType, extension } = sniffed[i]!;
      const id = crypto.randomUUID();
      const key = `engine-documents/${engineId}/${id}.${extension}`;
      await bucket.put(key, file.stream(), {
        httpMetadata: { contentType },
        customMetadata: { engineId, documentTypeId, uploadedBy: user.email, fileName: file.name },
      });
      uploaded.push({
        id, engineId, documentTypeId, fileName: clean(file.name, 240) || `soubor.${extension}`,
        objectKey: key, contentType, sizeBytes: file.size, note, createdBy: user.email, createdAt: now,
      });
    }
    await d1.batch([
      ...uploaded.map((item) => d1.prepare(`
        INSERT INTO engine_documents (id, engine_id, document_type_id, file_name, object_key, content_type, size_bytes, note, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(item.id, item.engineId, item.documentTypeId, item.fileName, item.objectKey, item.contentType, item.sizeBytes, item.note, item.createdBy, item.createdAt)),
      d1.prepare(`
        INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, 'upload_files', 'engine', ?, ?, ?)
      `).bind(crypto.randomUUID(), user.email, engineId, JSON.stringify({ files: uploaded.map((item) => ({ name: item.fileName, type: item.contentType, size: item.sizeBytes })) }), now),
    ]);
  } catch (error) {
    await Promise.all(uploaded.map((item) => bucket.delete(item.objectKey).catch(() => undefined)));
    throw error;
  }

  return Response.json({ documents: uploaded.map(publicDocument) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });

  await ensureRuntimeSchema();
  const payload = await request.json().catch(() => ({})) as { id?: unknown };
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Document id is required" }, { status: 400 });

  const d1 = getD1();
  const document = await d1.prepare("SELECT id, engine_id AS engineId, object_key AS objectKey FROM engine_documents WHERE id = ?")
    .bind(id).first<{ id: string; engineId: string; objectKey: string }>();
  if (!document) return Response.json({ error: "Document not found" }, { status: 404 });

  const now = Date.now();
  await d1.batch([
    d1.prepare("DELETE FROM engine_documents WHERE id = ?").bind(id),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'delete_file', 'engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), user.email, document.engineId, JSON.stringify({ documentId: id }), now),
  ]);
  await getAssetsBucket().delete(document.objectKey);
  return Response.json({ id });
}
