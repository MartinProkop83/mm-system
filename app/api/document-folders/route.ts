import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

/**
 * Knihovna dokumentů — samostatný strom složek, nevázaný na motor, auto ani závod (na rozdíl
 * od `engine_documents`/`travel_attachments`). Přístupová práva se zatím neřeší — sekce je
 * otevřená všem rolím, stejně jako dnešní "Nástroje"; omezení přijde později jako doplněk,
 * ne přestavba.
 *
 * `parent_id` prázdný string = kořen (ne NULL — viz komentář u tabulky v runtime-schema.ts).
 * Zanoření je omezené na 10 úrovní přes `depth`, počítané jednou při vytvoření složky.
 *
 * Mazání složky je záměrně jen pro prázdnou složku — žádné rekurzivní mazání. U třetí úrovně
 * zanoření není jasné, co všechno by při rekurzivním smazání zmizelo, a jde o papíry, které
 * jinde v systému nejsou. Rekurzivní varianta se dá případně doplnit později.
 */

const maxDepth = 10;

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

type FolderRow = { id: string; name: string; depth: number; createdAt: number; itemCount: number };
type FileRow = { id: string; fileName: string; contentType: string; sizeBytes: number; createdAt: number };

function publicFile(row: FileRow) {
  return { id: row.id, fileName: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes, createdAt: row.createdAt, url: `/api/document-files?id=${encodeURIComponent(row.id)}` };
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  await ensureRuntimeSchema();
  const d1 = getD1();
  const folderId = clean(new URL(request.url).searchParams.get("folderId"), 80);

  if (folderId) {
    const folder = await d1.prepare("SELECT id FROM document_folders WHERE id = ?").bind(folderId).first<{ id: string }>();
    if (!folder) return Response.json({ error: "Folder not found" }, { status: 404 });
  }

  const [folders, files] = await Promise.all([
    d1.prepare(`
      SELECT f.id, f.name, f.depth, f.created_at AS createdAt,
             (SELECT COUNT(*) FROM document_folders sub WHERE sub.parent_id = f.id)
             + (SELECT COUNT(*) FROM document_files df WHERE df.folder_id = f.id) AS itemCount
      FROM document_folders f WHERE f.parent_id = ?
    `).bind(folderId).all<FolderRow>(),
    d1.prepare("SELECT id, file_name AS fileName, content_type AS contentType, size_bytes AS sizeBytes, created_at AS createdAt FROM document_files WHERE folder_id = ?").bind(folderId).all<FileRow>(),
  ]);

  return Response.json({
    folders: folders.results.map((row) => ({ id: row.id, name: row.name, itemCount: row.itemCount, createdAt: row.createdAt })),
    files: files.results.map(publicFile),
  });
}

export async function POST(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  await ensureRuntimeSchema();
  const payload = await request.json().catch(() => ({})) as { parentId?: unknown; name?: unknown };
  const parentId = clean(payload.parentId, 80);
  const name = clean(payload.name, 160);
  if (!name) return Response.json({ error: "Folder name is required" }, { status: 400 });

  const d1 = getD1();
  let depth = 1;
  if (parentId) {
    const parent = await d1.prepare("SELECT depth FROM document_folders WHERE id = ?").bind(parentId).first<{ depth: number }>();
    if (!parent) return Response.json({ error: "Parent folder not found" }, { status: 404 });
    depth = parent.depth + 1;
    if (depth > maxDepth) return Response.json({ error: "max_depth" }, { status: 400 });
  }

  const collision = await d1.prepare("SELECT id FROM document_folders WHERE parent_id = ? AND LOWER(name) = LOWER(?)").bind(parentId, name).first<{ id: string }>();
  if (collision) return Response.json({ error: "duplicate_name" }, { status: 409 });

  const id = crypto.randomUUID();
  const now = Date.now();
  await d1.batch([
    d1.prepare("INSERT INTO document_folders (id, parent_id, name, depth, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, parentId, name, depth, user.email, now, now),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'create', 'document_folder', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify({ name, parentId }), now),
  ]);
  return Response.json({ id, name, itemCount: 0, createdAt: now }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  await ensureRuntimeSchema();
  const payload = await request.json().catch(() => ({})) as { id?: unknown };
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Folder id is required" }, { status: 400 });

  const d1 = getD1();
  const folder = await d1.prepare("SELECT id, name FROM document_folders WHERE id = ?").bind(id).first<{ id: string; name: string }>();
  if (!folder) return Response.json({ error: "Folder not found" }, { status: 404 });

  const [subfolders, files] = await Promise.all([
    d1.prepare("SELECT COUNT(*) AS count FROM document_folders WHERE parent_id = ?").bind(id).first<{ count: number }>(),
    d1.prepare("SELECT COUNT(*) AS count FROM document_files WHERE folder_id = ?").bind(id).first<{ count: number }>(),
  ]);
  const subfolderCount = subfolders?.count ?? 0;
  const fileCount = files?.count ?? 0;
  if (subfolderCount > 0 || fileCount > 0) {
    return Response.json({ error: "not_empty", subfolderCount, fileCount }, { status: 409 });
  }

  const now = Date.now();
  await d1.batch([
    d1.prepare("DELETE FROM document_folders WHERE id = ?").bind(id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'delete', 'document_folder', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify({ name: folder.name }), now),
  ]);
  return Response.json({ id });
}
