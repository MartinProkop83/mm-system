import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

type CustomerPayload = {
  id?: string; name?: string; phone?: string; email?: string; address?: string; companyId?: string; vatId?: string; notes?: string;
  countryCode?: string; discountWorkPercent?: number; discountMaterialPercent?: number;
};

function clean(value: unknown, max = 300) { return String(value ?? "").trim().slice(0, max); }
/** Sleva jako celé procento 0–100 — mimo rozsah se ořeže, ne odmítne. */
function percent(value: unknown) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  await ensureRuntimeSchema();
  const result = await getD1().prepare(`
    SELECT c.id, c.name, c.phone, c.email, c.address, c.company_id AS companyId,
           c.vat_id AS vatId, c.notes, c.country_code AS countryCode,
           c.discount_work_percent AS discountWorkPercent, c.discount_material_percent AS discountMaterialPercent,
           c.created_at AS createdAt, c.updated_at AS updatedAt,
           -- Test na s.id je tu kvůli LEFT JOINu: zákazník bez jediného prodeje má v joinu
           -- jeden řádek se samými NULL a samotné voided_at IS NULL by ho spočítalo jako prodej.
           COUNT(CASE WHEN s.id IS NOT NULL AND s.voided_at IS NULL THEN 1 END) AS saleCount,
           COALESCE(SUM(CASE WHEN s.voided_at IS NULL THEN s.total_cents ELSE 0 END), 0) AS totalCents
    FROM customers c LEFT JOIN sales s ON s.customer_id = c.id
    WHERE c.archived_at IS NULL
    GROUP BY c.id ORDER BY c.name COLLATE NOCASE
  `).all();
  return Response.json({ customers: result.results });
}

export async function POST(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  return save(request, false, user.email);
}

export async function PUT(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  return save(request, true, user.email);
}

export async function DELETE(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema();
  let payload: CustomerPayload;
  try { payload = await request.json() as CustomerPayload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Customer id is required" }, { status: 400 });
  const now = Date.now();
  const result = await getD1().prepare("UPDATE customers SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, now, id).run();
  if (!result.meta.changes) return Response.json({ error: "Customer not found" }, { status: 404 });
  return Response.json({ id });
}

async function save(request: Request, editing: boolean, actorEmail: string) {
  let payload: CustomerPayload;
  try { payload = await request.json() as CustomerPayload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = editing ? clean(payload.id, 80) : crypto.randomUUID();
  const name = clean(payload.name, 160);
  const phone = clean(payload.phone, 60);
  const email = clean(payload.email, 160).toLowerCase();
  const address = clean(payload.address, 500);
  const companyId = clean(payload.companyId, 40);
  const vatId = clean(payload.vatId, 40);
  const notes = clean(payload.notes, 1500);
  const countryCode = clean(payload.countryCode, 8).toUpperCase();
  const discountWorkPercent = percent(payload.discountWorkPercent);
  const discountMaterialPercent = percent(payload.discountMaterialPercent);
  if (!id && editing) return Response.json({ error: "Customer id is required" }, { status: 400 });
  if (!name) return Response.json({ error: "Customer name is required" }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Invalid customer email" }, { status: 400 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  if (editing && !(await d1.prepare("SELECT id FROM customers WHERE id = ? AND archived_at IS NULL").bind(id).first())) return Response.json({ error: "Customer not found" }, { status: 404 });
  const duplicate = email ? await d1.prepare("SELECT id FROM customers WHERE LOWER(email) = ? AND archived_at IS NULL AND id != ?").bind(email, id).first() : null;
  if (duplicate) return Response.json({ error: "Customer email already exists" }, { status: 409 });
  const now = Date.now();
  try {
    if (editing) {
      await d1.prepare("UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, company_id = ?, vat_id = ?, notes = ?, country_code = ?, discount_work_percent = ?, discount_material_percent = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL")
        .bind(name, phone, email, address, companyId, vatId, notes, countryCode, discountWorkPercent, discountMaterialPercent, now, id).run();
    } else {
      await d1.prepare("INSERT INTO customers (id, name, phone, email, address, company_id, vat_id, notes, country_code, discount_work_percent, discount_material_percent, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, name, phone, email, address, companyId, vatId, notes, countryCode, discountWorkPercent, discountMaterialPercent, actorEmail, now, now).run();
    }
  } catch { return Response.json({ error: "Could not save customer" }, { status: 500 }); }
  return Response.json({ id }, { status: editing ? 200 : 201 });
}
