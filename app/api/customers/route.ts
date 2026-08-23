import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type CustomerPayload = { id?: string; name?: string; phone?: string; email?: string; address?: string; companyId?: string; vatId?: string; notes?: string };

function clean(value: unknown, max = 300) { return String(value ?? "").trim().slice(0, max); }

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const result = await getD1().prepare(`
    SELECT c.id, c.name, c.phone, c.email, c.address, c.company_id AS companyId,
           c.vat_id AS vatId, c.notes, c.created_at AS createdAt, c.updated_at AS updatedAt,
           COUNT(CASE WHEN s.voided_at IS NULL THEN 1 END) AS saleCount,
           COALESCE(SUM(CASE WHEN s.voided_at IS NULL THEN s.total_cents ELSE 0 END), 0) AS totalCents
    FROM customers c LEFT JOIN sales s ON s.customer_id = c.id
    WHERE c.archived_at IS NULL
    GROUP BY c.id ORDER BY c.name COLLATE NOCASE
  `).all();
  return Response.json({ customers: result.results });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  return save(request, false, user.email);
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  return save(request, true, user.email);
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
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
      await d1.prepare("UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, company_id = ?, vat_id = ?, notes = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(name, phone, email, address, companyId, vatId, notes, now, id).run();
    } else {
      await d1.prepare("INSERT INTO customers (id, name, phone, email, address, company_id, vat_id, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, name, phone, email, address, companyId, vatId, notes, actorEmail, now, now).run();
    }
  } catch { return Response.json({ error: "Could not save customer" }, { status: 500 }); }
  return Response.json({ id }, { status: editing ? 200 : 201 });
}
