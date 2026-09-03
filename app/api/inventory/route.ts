import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { inventoryImageUrl } from "../../inventory-image-url";

type PartPayload = { id?: string; code?: string; name?: string; categories?: unknown; quantity?: number; unit?: string; priceCzkCents?: number; priceEurCents?: number; notes?: string };
type PartRow = { id: string; code: string; name: string; categories: string; quantity: number; unit: string; priceCzkCents: number; priceEurCents: number; notes: string; imageKey: string | null; imageUpdatedAt: number | null; createdAt: number; updatedAt: number };
const allowedCategories = new Set(["ALL", "MINI", "OKJ", "OKN", "OK", "KZ"]);
function clean(value: unknown, max = 300) { return String(value ?? "").trim().slice(0, max); }
function whole(value: unknown, max: number) { const number = Number(value); return Number.isInteger(number) && number >= 0 && number <= max ? number : null; }
function parseCategories(value: unknown) {
  if (value == null) return ["ALL"];
  let source = value;
  if (typeof value === "string") { try { source = JSON.parse(value); } catch { source = value.split(","); } }
  if (!Array.isArray(source)) return [];
  const categories = [...new Set(source.map((item) => clean(item, 16).toUpperCase()).filter((item) => allowedCategories.has(item)))];
  return categories.includes("ALL") ? ["ALL"] : categories;
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const result = await getD1().prepare("SELECT id, code, name, categories, quantity, unit, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents, notes, image_key AS imageKey, image_updated_at AS imageUpdatedAt, created_at AS createdAt, updated_at AS updatedAt FROM inventory_parts WHERE archived_at IS NULL ORDER BY code COLLATE NOCASE").all<PartRow>();
  return Response.json({ parts: result.results.map((part) => ({ ...part, categories: parseCategories(part.categories), imageUrl: inventoryImageUrl(part.id, part.imageKey, part.imageUpdatedAt) })) });
}

export async function POST(request: Request) { return authorizeAndSave(request, false); }
export async function PUT(request: Request) { return authorizeAndSave(request, true); }

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema();
  let payload: PartPayload;
  try { payload = await request.json() as PartPayload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = clean(payload.id, 80); const now = Date.now(); const d1 = getD1();
  const existing = await d1.prepare("SELECT image_key AS imageKey FROM inventory_parts WHERE id = ? AND archived_at IS NULL").bind(id).first<{ imageKey: string | null }>();
  if (!existing) return Response.json({ error: "Part not found" }, { status: 404 });
  await d1.prepare("UPDATE inventory_parts SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, now, id).run();
  if (existing.imageKey) await getAssetsBucket().delete(existing.imageKey);
  return Response.json({ id });
}

async function authorizeAndSave(request: Request, editing: boolean) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  let payload: PartPayload;
  try { payload = await request.json() as PartPayload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = editing ? clean(payload.id, 80) : crypto.randomUUID();
  const code = clean(payload.code, 80).toUpperCase(); const name = clean(payload.name, 160); const categories = parseCategories(payload.categories); const unit = clean(payload.unit, 20) || "ks"; const notes = clean(payload.notes, 1000);
  const quantity = whole(payload.quantity, 1_000_000); const priceCzkCents = whole(payload.priceCzkCents, 1_000_000_000); const priceEurCents = whole(payload.priceEurCents, 1_000_000_000);
  if (!code || !name) return Response.json({ error: "Part code and name are required" }, { status: 400 });
  if (!categories.length) return Response.json({ error: "Select at least one engine category" }, { status: 400 });
  if (quantity === null || priceCzkCents === null || priceEurCents === null) return Response.json({ error: "Invalid stock value" }, { status: 400 });
  await ensureRuntimeSchema(); const d1 = getD1(); const now = Date.now();
  const duplicate = await d1.prepare("SELECT id FROM inventory_parts WHERE UPPER(code) = ? AND archived_at IS NULL AND id != ?").bind(code, id).first();
  if (duplicate) return Response.json({ error: "Part code already exists" }, { status: 409 });
  try {
    if (editing) {
      const result = await d1.prepare("UPDATE inventory_parts SET code = ?, name = ?, categories = ?, quantity = ?, unit = ?, price_czk_cents = ?, price_eur_cents = ?, notes = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(code, name, JSON.stringify(categories), quantity, unit, priceCzkCents, priceEurCents, notes, now, id).run();
      if (!result.meta.changes) return Response.json({ error: "Part not found" }, { status: 404 });
    } else {
      await d1.prepare("INSERT INTO inventory_parts (id, code, name, categories, quantity, unit, price_czk_cents, price_eur_cents, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, code, name, JSON.stringify(categories), quantity, unit, priceCzkCents, priceEurCents, notes, user.email, now, now).run();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    if (message.includes("UNIQUE") || message.includes("unique")) {
      return Response.json({ error: "Part code already exists" }, { status: 409 });
    }
    return Response.json({ error: "Could not save part" }, { status: 500 });
  }
  return Response.json({ id }, { status: editing ? 200 : 201 });
}
