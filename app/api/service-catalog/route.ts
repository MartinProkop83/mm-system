import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type ServicePayload = { id?: string; name?: string; description?: string; descriptionCs?: string; descriptionEn?: string; priceCzkCents?: number; priceEurCents?: number };
function clean(value: unknown, max = 300) { return String(value ?? "").trim().slice(0, max); }
function price(value: unknown) { const number = Number(value); return Number.isInteger(number) && number >= 0 && number <= 1_000_000_000 ? number : null; }

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const result = await getD1().prepare("SELECT id, name, description_cs AS descriptionCs, description_en AS descriptionEn, description_cs AS description, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents, created_at AS createdAt, updated_at AS updatedAt FROM service_catalog WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE").all();
  return Response.json({ services: result.results });
}

export async function POST(request: Request) { return authorizeAndSave(request, false); }
export async function PUT(request: Request) { return authorizeAndSave(request, true); }

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema();
  let payload: ServicePayload;
  try { payload = await request.json() as ServicePayload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = clean(payload.id, 80); const now = Date.now();
  const result = await getD1().prepare("UPDATE service_catalog SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, now, id).run();
  return result.meta.changes ? Response.json({ id }) : Response.json({ error: "Service not found" }, { status: 404 });
}

async function authorizeAndSave(request: Request, editing: boolean) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  let payload: ServicePayload;
  try { payload = await request.json() as ServicePayload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = editing ? clean(payload.id, 80) : crypto.randomUUID();
  const name = clean(payload.name, 160); const descriptionCs = clean(payload.descriptionCs ?? payload.description, 1000); const descriptionEn = clean(payload.descriptionEn, 1000);
  const priceCzkCents = price(payload.priceCzkCents); const priceEurCents = price(payload.priceEurCents);
  if (!name) return Response.json({ error: "Service name is required" }, { status: 400 });
  if (priceCzkCents === null || priceEurCents === null) return Response.json({ error: "Invalid service price" }, { status: 400 });
  await ensureRuntimeSchema(); const d1 = getD1(); const now = Date.now();
  const duplicate = await d1.prepare("SELECT id FROM service_catalog WHERE LOWER(name) = LOWER(?) AND archived_at IS NULL AND id != ?").bind(name, id).first();
  if (duplicate) return Response.json({ error: "Service already exists" }, { status: 409 });
  if (editing) {
    const result = await d1.prepare("UPDATE service_catalog SET name = ?, description = ?, description_cs = ?, description_en = ?, price_czk_cents = ?, price_eur_cents = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(name, descriptionCs, descriptionCs, descriptionEn, priceCzkCents, priceEurCents, now, id).run();
    if (!result.meta.changes) return Response.json({ error: "Service not found" }, { status: 404 });
  } else {
    await d1.prepare("INSERT INTO service_catalog (id, name, description, description_cs, description_en, price_czk_cents, price_eur_cents, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, name, descriptionCs, descriptionCs, descriptionEn, priceCzkCents, priceEurCents, user.email, now, now).run();
  }
  return Response.json({ id }, { status: editing ? 200 : 201 });
}
