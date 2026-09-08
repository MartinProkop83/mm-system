import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { DB_BACKED_SERVICE_PART_FAMILIES } from "../../engine-family-rules";

type PartRow = {
  id: string;
  family: string;
  partKey: string;
  labelCs: string;
  labelEn: string;
  sortOrder: number;
  archivedAt: number | null;
};

type Payload = {
  id?: string;
  family?: string;
  labelCs?: string;
  labelEn?: string;
  sortOrder?: number;
};

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function slugify(value: string) {
  return value
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

async function requireSuperadmin() {
  const user = await getAppUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (user.role !== "superadmin") return { error: Response.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await requireSuperadmin();
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const parts = await getD1().prepare(`
    SELECT id, family, part_key AS partKey, label_cs AS labelCs, label_en AS labelEn,
           sort_order AS sortOrder, archived_at AS archivedAt
    FROM engine_service_part_catalog
    ORDER BY family, archived_at IS NOT NULL, sort_order
  `).all<PartRow>();

  return Response.json({ parts: parts.results, families: DB_BACKED_SERVICE_PART_FAMILIES });
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.error) return auth.error;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const family = clean(payload.family, 20);
  if (!DB_BACKED_SERVICE_PART_FAMILIES.includes(family)) {
    return Response.json({ error: "This family does not use a database-backed parts catalog" }, { status: 400 });
  }
  const labelCs = clean(payload.labelCs, 160);
  const labelEn = clean(payload.labelEn, 160);
  if (!labelCs || !labelEn) return Response.json({ error: "Both CZ and EN names are required" }, { status: 400 });

  const d1 = getD1();
  const baseKey = slugify(labelCs) || slugify(labelEn) || crypto.randomUUID().slice(0, 8);
  let partKey = baseKey;
  let suffix = 2;
  while (await d1.prepare("SELECT id FROM engine_service_part_catalog WHERE family = ? AND part_key = ? AND archived_at IS NULL").bind(family, partKey).first()) {
    partKey = `${baseKey}_${suffix}`;
    suffix += 1;
  }

  const maxSort = await d1.prepare("SELECT MAX(sort_order) AS maxSort FROM engine_service_part_catalog WHERE family = ?").bind(family).first<{ maxSort: number | null }>();
  const sortOrder = (maxSort?.maxSort ?? -1) + 1;

  const now = Date.now();
  const id = crypto.randomUUID();
  await d1.prepare(`
    INSERT INTO engine_service_part_catalog (id, family, part_key, label_cs, label_en, sort_order, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, family, partKey, labelCs, labelEn, sortOrder, auth.user.email, now, now).run();

  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.error) return auth.error;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Part id is required" }, { status: 400 });

  const d1 = getD1();
  const existing = await d1.prepare("SELECT id, label_cs AS labelCs, label_en AS labelEn, sort_order AS sortOrder FROM engine_service_part_catalog WHERE id = ?").bind(id).first<{ id: string; labelCs: string; labelEn: string; sortOrder: number }>();
  if (!existing) return Response.json({ error: "Part not found" }, { status: 404 });

  const labelCs = payload.labelCs !== undefined ? clean(payload.labelCs, 160) : existing.labelCs;
  const labelEn = payload.labelEn !== undefined ? clean(payload.labelEn, 160) : existing.labelEn;
  if (!labelCs || !labelEn) return Response.json({ error: "Both CZ and EN names are required" }, { status: 400 });
  const sortOrder = payload.sortOrder !== undefined && Number.isInteger(payload.sortOrder) ? payload.sortOrder : existing.sortOrder;

  await d1.prepare(`
    UPDATE engine_service_part_catalog SET label_cs = ?, label_en = ?, sort_order = ?, updated_at = ? WHERE id = ?
  `).bind(labelCs, labelEn, sortOrder, Date.now(), id).run();

  return Response.json({ id });
}

export async function DELETE(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.error) return auth.error;

  let payload: Pick<Payload, "id">;
  try {
    payload = (await request.json()) as Pick<Payload, "id">;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Part id is required" }, { status: 400 });

  const now = Date.now();
  const result = await getD1().prepare("UPDATE engine_service_part_catalog SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, now, id).run();
  return result.meta.changes ? Response.json({ id }) : Response.json({ error: "Part not found" }, { status: 404 });
}
