import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

/**
 * Zákaznický motor — samostatná evidence, mimo `engines`. Zůstává v systému napořád, i po
 * vydání zakázky, aby se na něj při další návštěvě navázala historie. `archived_at` je jen
 * ruční východisko pro překlep ve výrobním čísle, nic ho nenastavuje automaticky.
 *
 * Mimo tuhle routu a routy o zakázkách se zákaznický motor nesmí objevit — hlídá to test
 * v tests/rendered-html.test.mjs.
 */

type Payload = { id?: string; customerId?: string; code?: string; serviceEngineTypeId?: string; note?: string };

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const url = new URL(request.url);
  const customerId = clean(url.searchParams.get("customerId"), 80);

  const rows = await d1.prepare(`
    SELECT ce.id, ce.customer_id AS customerId, ce.code, ce.service_engine_type_id AS serviceEngineTypeId,
           ce.note, ce.archived_at AS archivedAt, ce.created_at AS createdAt,
           t.name_cs AS typeNameCs, t.name_en AS typeNameEn,
           c.name AS customerName,
           (SELECT COUNT(*) FROM service_order_engines oe WHERE oe.customer_engine_id = ce.id) AS orderCount,
           (SELECT MAX(o.received_at) FROM service_order_engines oe JOIN service_orders o ON o.id = oe.order_id WHERE oe.customer_engine_id = ce.id) AS lastReceivedAt
    FROM customer_engines ce
    JOIN service_engine_types t ON t.id = ce.service_engine_type_id
    JOIN customers c ON c.id = ce.customer_id
    ${customerId ? "WHERE ce.customer_id = ?" : ""}
    ORDER BY ce.code COLLATE NOCASE
  `).bind(...(customerId ? [customerId] : [])).all<{ archivedAt: number | null }>();

  return auth.json({
    engines: rows.results.map((row) => ({ ...row, isActive: row.archivedAt === null })),
  });
}

async function requireManager(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return { error: auth.error } as const;
  if (auth.user.role === "mechanic") return { error: Response.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { user: auth.user } as const;
}

export async function POST(request: Request) {
  const guard = await requireManager(request);
  if (guard.error) return guard.error;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const customerId = clean(payload.customerId, 80);
  const code = clean(payload.code, 120);
  const serviceEngineTypeId = clean(payload.serviceEngineTypeId, 80);
  const note = clean(payload.note, 1500);
  if (!customerId) return Response.json({ error: "Customer is required" }, { status: 400 });
  if (!code) return Response.json({ error: "Engine code is required" }, { status: 400 });
  if (!serviceEngineTypeId) return Response.json({ error: "Engine type is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const [customer, type, collision] = await Promise.all([
    d1.prepare("SELECT id FROM customers WHERE id = ? AND archived_at IS NULL").bind(customerId).first(),
    d1.prepare("SELECT id FROM service_engine_types WHERE id = ? AND archived_at IS NULL").bind(serviceEngineTypeId).first(),
    d1.prepare("SELECT id FROM customer_engines WHERE LOWER(code) = LOWER(?) AND archived_at IS NULL").bind(code).first(),
  ]);
  if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });
  if (!type) return Response.json({ error: "Unknown or inactive engine type" }, { status: 400 });
  if (collision) return Response.json({ error: "Engine code already exists" }, { status: 409 });

  const id = crypto.randomUUID();
  const now = Date.now();
  await d1.batch([
    d1.prepare(`
      INSERT INTO customer_engines (id, customer_id, code, service_engine_type_id, note, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, customerId, code, serviceEngineTypeId, note, guard.user.email, now, now),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'create', 'customer_engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), guard.user.email, id, JSON.stringify({ customerId, code }), now),
  ]);
  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const guard = await requireManager(request);
  if (guard.error) return guard.error;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Engine id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const existing = await d1.prepare("SELECT id, code, service_engine_type_id AS serviceEngineTypeId, note FROM customer_engines WHERE id = ?")
    .bind(id).first<{ code: string; serviceEngineTypeId: string; note: string }>();
  if (!existing) return Response.json({ error: "Engine not found" }, { status: 404 });

  const code = payload.code !== undefined ? clean(payload.code, 120) || existing.code : existing.code;
  const serviceEngineTypeId = payload.serviceEngineTypeId !== undefined ? clean(payload.serviceEngineTypeId, 80) || existing.serviceEngineTypeId : existing.serviceEngineTypeId;
  const note = payload.note !== undefined ? clean(payload.note, 1500) : existing.note;

  if (code.toLowerCase() !== existing.code.toLowerCase()) {
    const collision = await d1.prepare("SELECT id FROM customer_engines WHERE LOWER(code) = LOWER(?) AND archived_at IS NULL AND id != ?").bind(code, id).first();
    if (collision) return Response.json({ error: "Engine code already exists" }, { status: 409 });
  }

  const now = Date.now();
  await d1.prepare("UPDATE customer_engines SET code = ?, service_engine_type_id = ?, note = ?, updated_at = ? WHERE id = ?")
    .bind(code, serviceEngineTypeId, note, now, id).run();
  return Response.json({ id });
}

export async function DELETE(request: Request) {
  const guard = await requireManager(request);
  if (guard.error) return guard.error;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Engine id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  // Archivace, nikdy skutečné smazání — motor v systému zůstává napořád, i po vydání.
  // Tady se hodí jen na ruční opravu překlepu ve výrobním čísle.
  const now = Date.now();
  await getD1().prepare("UPDATE customer_engines SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL")
    .bind(now, now, id).run();
  return Response.json({ id });
}
