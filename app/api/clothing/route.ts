import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { clothingImageUrl } from "../../clothing-image-url";

type Payload = {
  kind?: unknown;
  id?: unknown;
  mechanicId?: unknown;
  clothingItemId?: unknown;
  name?: unknown;
  sizes?: unknown;
  defaultQuantity?: unknown;
  size?: unknown;
  quantity?: unknown;
  notes?: unknown;
};

type ItemRow = {
  id: string;
  name: string;
  sizes: string;
  defaultQuantity: number;
  notes: string;
  imageKey: string | null;
  imageUpdatedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

const defaults = [
  { name: "Kombinéza", sizes: ["120", "130", "140", "150", "160", "XS", "S", "M", "L", "XL", "XXL"], defaultQuantity: 1 },
  { name: "Boty", sizes: Array.from({ length: 17 }, (_, index) => String(index + 32)), defaultQuantity: 1 },
  { name: "Rukavice", sizes: Array.from({ length: 9 }, (_, index) => String(index + 4)), defaultQuantity: 1 },
  { name: "Funkční prádlo", sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"], defaultQuantity: 2 },
  { name: "Pláštěnka", sizes: ["120", "130", "140", "150", "160", "XS", "S", "M", "L", "XL", "XXL"], defaultQuantity: 1 },
  { name: "Tričko", sizes: ["6–8", "8–10", "10–12", "12–14", "XS", "S", "M", "L", "XL", "XXL"], defaultQuantity: 3 },
] as const;

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function numberInRange(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function parseSizes(value: unknown) {
  let source = value;
  if (typeof value === "string") {
    try { source = JSON.parse(value); }
    catch { source = value.split(","); }
  }
  if (!Array.isArray(source)) return [];
  return [...new Set(source.map((item) => clean(item, 24)).filter(Boolean))].slice(0, 40);
}

function mapItem(row: ItemRow) {
  return { ...row, sizes: parseSizes(row.sizes), defaultQuantity: Number(row.defaultQuantity), imageUrl: clothingImageUrl(row.id, row.imageKey, row.imageUpdatedAt) };
}

async function readPayload(request: Request): Promise<Payload | Response> {
  try { return await request.json() as Payload; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const [items, mechanics, assignments] = await Promise.all([
    d1.prepare(`
      SELECT id, name, sizes, default_quantity AS defaultQuantity, notes,
             image_key AS imageKey, image_updated_at AS imageUpdatedAt,
             created_at AS createdAt, updated_at AS updatedAt
      FROM clothing_items WHERE archived_at IS NULL ORDER BY name
    `).all<ItemRow>(),
    d1.prepare(`
      SELECT id, name FROM mechanics WHERE archived_at IS NULL ORDER BY name
    `).all<{ id: string; name: string }>(),
    d1.prepare(`
      SELECT a.id, a.mechanic_id AS mechanicId, a.clothing_item_id AS clothingItemId,
             a.size, a.quantity, a.assigned_at AS assignedAt, a.notes, a.updated_at AS updatedAt
      FROM mechanic_clothing_assignments a
      JOIN mechanics m ON m.id = a.mechanic_id AND m.archived_at IS NULL
      JOIN clothing_items i ON i.id = a.clothing_item_id AND i.archived_at IS NULL
      ORDER BY m.name, i.name
    `).all<Record<string, unknown>>(),
  ]);
  return Response.json({
    items: items.results.map(mapItem),
    mechanics: mechanics.results,
    assignments: assignments.results,
  });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  await ensureRuntimeSchema();

  if (payload.kind === "defaults") return createDefaults(user.email);
  if (payload.kind === "assignment") return saveAssignment(payload, user.email);
  if (payload.kind !== "item") return Response.json({ error: "Unknown clothing operation" }, { status: 400 });

  const item = validateItem(payload);
  if (item instanceof Response) return item;
  const d1 = getD1();
  const duplicate = await d1.prepare("SELECT id FROM clothing_items WHERE LOWER(name) = LOWER(?) AND archived_at IS NULL LIMIT 1").bind(item.name).first();
  if (duplicate) return Response.json({ error: "Clothing item already exists" }, { status: 409 });
  const id = crypto.randomUUID();
  const now = Date.now();
  await d1.batch([
    d1.prepare("INSERT INTO clothing_items (id, name, sizes, default_quantity, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, item.name, JSON.stringify(item.sizes), item.defaultQuantity, item.notes, user.email, now, now),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'create', 'clothing_item', ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, id, JSON.stringify(item), now),
  ]);
  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  if (payload.kind !== "item") return Response.json({ error: "Unknown clothing operation" }, { status: 400 });
  const id = clean(payload.id, 80);
  const item = validateItem(payload);
  if (!id) return Response.json({ error: "Clothing item id is required" }, { status: 400 });
  if (item instanceof Response) return item;
  await ensureRuntimeSchema();
  const d1 = getD1();
  const existing = await d1.prepare("SELECT id, name, sizes, default_quantity AS defaultQuantity, notes FROM clothing_items WHERE id = ? AND archived_at IS NULL").bind(id).first<ItemRow>();
  if (!existing) return Response.json({ error: "Clothing item not found" }, { status: 404 });
  const duplicate = await d1.prepare("SELECT id FROM clothing_items WHERE LOWER(name) = LOWER(?) AND id != ? AND archived_at IS NULL LIMIT 1").bind(item.name, id).first();
  if (duplicate) return Response.json({ error: "Clothing item already exists" }, { status: 409 });
  const usedSizes = await d1.prepare("SELECT DISTINCT size FROM mechanic_clothing_assignments WHERE clothing_item_id = ?").bind(id).all<{ size: string }>();
  const removedInUse = usedSizes.results.find((row: { size: string }) => !item.sizes.includes(row.size));
  if (removedInUse) return Response.json({ error: `Size ${removedInUse.size} is assigned to a mechanic` }, { status: 409 });
  const now = Date.now();
  await d1.batch([
    d1.prepare("UPDATE clothing_items SET name = ?, sizes = ?, default_quantity = ?, notes = ?, updated_at = ? WHERE id = ?")
      .bind(item.name, JSON.stringify(item.sizes), item.defaultQuantity, item.notes, now, id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'update', 'clothing_item', ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, id, JSON.stringify({ before: mapItem(existing), after: item }), now),
  ]);
  return Response.json({ id });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  await ensureRuntimeSchema();
  const d1 = getD1();
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Record id is required" }, { status: 400 });

  if (payload.kind === "assignment") {
    const existing = await d1.prepare(`
      SELECT a.id, a.mechanic_id AS mechanicId, a.clothing_item_id AS clothingItemId,
             a.size, a.quantity, a.assigned_at AS assignedAt, m.name AS mechanicName, i.name AS itemName
      FROM mechanic_clothing_assignments a
      JOIN mechanics m ON m.id = a.mechanic_id JOIN clothing_items i ON i.id = a.clothing_item_id
      WHERE a.id = ?
    `).bind(id).first<Record<string, unknown>>();
    if (!existing) return Response.json({ error: "Assignment not found" }, { status: 404 });
    const now = Date.now();
    await d1.batch([
      d1.prepare("DELETE FROM mechanic_clothing_assignments WHERE id = ?").bind(id),
      d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'delete', 'clothing_assignment', ?, ?, ?)")
        .bind(crypto.randomUUID(), user.email, id, JSON.stringify(existing), now),
    ]);
    return Response.json({ id });
  }

  if (payload.kind !== "item") return Response.json({ error: "Unknown clothing operation" }, { status: 400 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const existing = await d1.prepare("SELECT id, name, image_key AS imageKey FROM clothing_items WHERE id = ? AND archived_at IS NULL").bind(id).first<{ id: string; name: string; imageKey: string | null }>();
  if (!existing) return Response.json({ error: "Clothing item not found" }, { status: 404 });
  const assigned = await d1.prepare("SELECT id FROM mechanic_clothing_assignments WHERE clothing_item_id = ? LIMIT 1").bind(id).first();
  if (assigned) return Response.json({ error: "Clothing item is assigned to a mechanic" }, { status: 409 });
  const now = Date.now();
  await d1.batch([
    d1.prepare("UPDATE clothing_items SET archived_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'archive', 'clothing_item', ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, id, JSON.stringify(existing), now),
  ]);
  if (existing.imageKey) await getAssetsBucket().delete(existing.imageKey);
  return Response.json({ id });
}

function validateItem(payload: Payload) {
  const name = clean(payload.name, 100);
  const sizes = parseSizes(payload.sizes);
  const defaultQuantity = numberInRange(payload.defaultQuantity, 1, 20);
  if (!name) return Response.json({ error: "Clothing item name is required" }, { status: 400 });
  if (!sizes.length) return Response.json({ error: "At least one size is required" }, { status: 400 });
  if (!defaultQuantity) return Response.json({ error: "Default quantity must be between 1 and 20" }, { status: 400 });
  return { name, sizes, defaultQuantity, notes: clean(payload.notes, 600) };
}

async function saveAssignment(payload: Payload, actorEmail: string) {
  const mechanicId = clean(payload.mechanicId, 80);
  const clothingItemId = clean(payload.clothingItemId, 80);
  const size = clean(payload.size, 24);
  const quantity = numberInRange(payload.quantity, 1, 20);
  if (!mechanicId || !clothingItemId || !size || !quantity) return Response.json({ error: "Mechanic, item, size and quantity are required" }, { status: 400 });
  const d1 = getD1();
  const [mechanic, item, existing] = await Promise.all([
    d1.prepare("SELECT id, name FROM mechanics WHERE id = ? AND archived_at IS NULL").bind(mechanicId).first<{ id: string; name: string }>(),
    d1.prepare("SELECT id, name, sizes FROM clothing_items WHERE id = ? AND archived_at IS NULL").bind(clothingItemId).first<{ id: string; name: string; sizes: string }>(),
    d1.prepare("SELECT id, size, quantity, assigned_at AS assignedAt, notes FROM mechanic_clothing_assignments WHERE mechanic_id = ? AND clothing_item_id = ?").bind(mechanicId, clothingItemId).first<Record<string, unknown>>(),
  ]);
  if (!mechanic || !item) return Response.json({ error: "Mechanic or clothing item not found" }, { status: 404 });
  if (!parseSizes(item.sizes).includes(size)) return Response.json({ error: "Selected size is not available for this item" }, { status: 400 });
  const id = clean(existing?.id, 80) || crypto.randomUUID();
  const notes = clean(payload.notes, 500);
  const now = Date.now();
  const details = { mechanicId, mechanicName: mechanic.name, clothingItemId, itemName: item.name, size, quantity, assignedAt: Number(existing?.assignedAt) || now, notes };
  await d1.batch([
    d1.prepare(`
      INSERT INTO mechanic_clothing_assignments (id, mechanic_id, clothing_item_id, size, quantity, assigned_at, notes, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mechanic_id, clothing_item_id) DO UPDATE SET
        size = excluded.size, quantity = excluded.quantity, notes = excluded.notes,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).bind(id, mechanicId, clothingItemId, size, quantity, now, notes, actorEmail, actorEmail, now, now),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, 'clothing_assignment', ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, existing ? "update" : "assign", id, JSON.stringify(existing ? { before: existing, after: details, mechanicName: mechanic.name, itemName: item.name } : details), now),
  ]);
  return Response.json({ id }, { status: existing ? 200 : 201 });
}

async function createDefaults(actorEmail: string) {
  const d1 = getD1();
  const rows = await d1.prepare("SELECT name FROM clothing_items WHERE archived_at IS NULL").all<{ name: string }>();
  const existing = new Set(rows.results.map((row: { name: string }) => row.name.toLocaleLowerCase("cs")));
  const missing = defaults.filter((item) => !existing.has(item.name.toLocaleLowerCase("cs")));
  if (!missing.length) return Response.json({ created: 0 });
  const now = Date.now();
  const statements = missing.flatMap((item) => {
    const id = crypto.randomUUID();
    const details = { ...item, notes: "" };
    return [
      d1.prepare("INSERT INTO clothing_items (id, name, sizes, default_quantity, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, ?, ?)")
        .bind(id, item.name, JSON.stringify(item.sizes), item.defaultQuantity, actorEmail, now, now),
      d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'create', 'clothing_item', ?, ?, ?)")
        .bind(crypto.randomUUID(), actorEmail, id, JSON.stringify(details), now),
    ];
  });
  await d1.batch(statements);
  return Response.json({ created: missing.length }, { status: 201 });
}
