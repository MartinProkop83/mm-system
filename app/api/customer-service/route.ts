import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

/**
 * Mechanikova jediná obrazovka pro zákaznický motor: fronta + zápis práce a materiálu.
 *
 * **Úzká routa záměrně** — mechanik nesahá na `/api/service-orders` (sekce Zakázky je mimo
 * něj úplně), ani na `/api/service-price-items`/`/api/inventory` přímo. Ceník a sklad, které
 * potřebuje k výběru, jsou zabalené přímo v odpovědi téhle routy.
 *
 * Server vždycky vrací plná data (stejně jako v `/api/service-orders`) — whitelist v
 * `app/api-access.ts` (`MECHANIC_PAYLOADS["/api/customer-service"]`) je ten, kdo mechanikovi
 * ořeže odpověď na to, co smí vidět: ceníkové ceny u položek ano, slevu (`discountPercent`)
 * a celkovou cenu řádku (`totalCzkCents`/`totalEurCents`) ne — z ceny a množství by šla
 * sleva zpětně dopočítat, takže whitelist musí zahodit *oba* společně, ne jen jeden.
 *
 * Zápis nikdy nepřijímá cenu ani slevu od klienta — cena jde vždycky z ceníku/skladu podle
 * `priceItemId`/`inventoryPartId`, sleva se vždycky dopočítá na serveru ze zakázky. Mechanik
 * nemá odkud slevu znát, natož ji zapisovat.
 */

type D1 = ReturnType<typeof getD1>;
type MechanicStatus = "in_progress" | "waiting_part" | "done";
const MECHANIC_STATUSES: MechanicStatus[] = ["in_progress", "waiting_part", "done"];
/** Stavy, ze kterých mechanik na motoru ještě legitimně pracuje — mimo tuhle množinu už na něj nesmí sáhnout. */
const MECHANIC_OWNED_STATUSES = ["received", "in_progress", "waiting_part"];

type Payload = {
  kind?: string;
  action?: string;
  id?: string;
  orderEngineId?: string;
  status?: string;
  priceItemId?: string;
  inventoryPartId?: string;
  name?: string;
  code?: string;
  source?: string;
  quantity?: number;
  expectedDate?: string;
  isOrdered?: boolean;
};

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}
function quantity(value: unknown) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 1;
}

async function loadEngineForWrite(d1: D1, orderEngineId: string) {
  return d1.prepare(`
    SELECT oe.id, oe.status, o.id AS orderId, o.cancelled_at AS orderCancelledAt,
           o.deleted_at AS orderDeletedAt, o.invoiced_at AS invoicedAt, o.unlocked_at AS unlockedAt,
           o.discount_work_percent AS discountWorkPercent, o.discount_material_percent AS discountMaterialPercent
    FROM service_order_engines oe JOIN service_orders o ON o.id = oe.order_id
    WHERE oe.id = ?
  `).bind(orderEngineId).first<{
    id: string; status: string; orderId: string; orderCancelledAt: number | null; orderDeletedAt: number | null;
    invoicedAt: number | null; unlockedAt: number | null; discountWorkPercent: number; discountMaterialPercent: number;
  }>();
}

/** Stejná pravidla zámku jako v `/api/service-orders` — mechanik na uzavřenou zakázku nesmí. */
function blockedReason(engine: { orderCancelledAt: number | null; orderDeletedAt: number | null; invoicedAt: number | null; unlockedAt: number | null; status: string } | null) {
  if (!engine) return "Engine not found";
  if (!MECHANIC_OWNED_STATUSES.includes(engine.status)) return "Engine is no longer in the mechanic queue";
  if (engine.orderDeletedAt) return "Order is in trash";
  if (engine.orderCancelledAt) return "Order is cancelled";
  const locked = engine.invoicedAt !== null && (engine.unlockedAt === null || engine.unlockedAt < engine.invoicedAt);
  if (locked) return "Order is locked after invoicing";
  return null;
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const url = new URL(request.url);
  const orderEngineId = clean(url.searchParams.get("orderEngineId"), 80);

  if (orderEngineId) return getEngineDetail(auth, d1, orderEngineId);
  return getQueue(auth, d1);
}

async function getQueue(auth: { json: (payload: unknown) => Response }, d1: D1) {
  // Stejné tři stavy, ve kterých motor vidí i naše servisní fronta — jakmile je hotovo,
  // přebírá to vedení/superadmin v sekci Zakázky, mechanik ho už tu dál nepotřebuje.
  const rows = await d1.prepare(`
    SELECT oe.id AS orderEngineId, o.id AS orderId, ce.code AS engineCode, t.name_cs AS typeNameCs, t.name_en AS typeNameEn,
           c.name AS customerName, o.deadline_date AS deadlineDate, oe.status,
           oe.taken_by_name AS takenByName, oe.taken_at AS takenAt, oe.sort_order AS sortOrder
    FROM service_order_engines oe
    JOIN service_orders o ON o.id = oe.order_id
    JOIN customer_engines ce ON ce.id = oe.customer_engine_id
    JOIN service_engine_types t ON t.id = ce.service_engine_type_id
    JOIN customers c ON c.id = o.customer_id
    WHERE oe.status IN ('received', 'in_progress', 'waiting_part')
      AND o.cancelled_at IS NULL AND o.deleted_at IS NULL
    ORDER BY CASE WHEN o.deadline_date = '' THEN 1 ELSE 0 END, o.deadline_date, oe.sort_order
  `).all();

  return auth.json({ items: rows.results });
}

async function getEngineDetail(auth: { json: (payload: unknown) => Response }, d1: D1, orderEngineId: string) {
  const engine = await d1.prepare(`
    SELECT oe.id AS orderEngineId, ce.code AS engineCode, t.name_cs AS typeNameCs, t.name_en AS typeNameEn,
           c.name AS customerName, oe.scope, oe.carb_service AS carbService, oe.customer_parts AS customerParts,
           oe.customer_parts_text AS customerPartsText, oe.status, oe.taken_by_name AS takenByName, oe.taken_at AS takenAt,
           o.discount_work_percent AS orderDiscountWorkPercent, o.discount_material_percent AS orderDiscountMaterialPercent
    FROM service_order_engines oe
    JOIN service_orders o ON o.id = oe.order_id
    JOIN customer_engines ce ON ce.id = oe.customer_engine_id
    JOIN service_engine_types t ON t.id = ce.service_engine_type_id
    JOIN customers c ON c.id = o.customer_id
    WHERE oe.id = ?
  `).bind(orderEngineId).first<{ carbService: number; customerParts: number }>();
  if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });

  const [works, materials, waitingParts, priceItems, inventoryParts] = await Promise.all([
    d1.prepare(`
      SELECT id, code_snapshot AS codeSnapshot, name_cs_snapshot AS nameCsSnapshot, name_en_snapshot AS nameEnSnapshot,
             quantity, unit_price_czk_cents AS unitPriceCzkCents, unit_price_eur_cents AS unitPriceEurCents,
             discount_percent AS discountPercent, total_czk_cents AS totalCzkCents, total_eur_cents AS totalEurCents
      FROM service_order_works WHERE order_engine_id = ? ORDER BY created_at
    `).bind(orderEngineId).all(),
    d1.prepare(`
      SELECT id, code, name, quantity, unit_price_czk_cents AS unitPriceCzkCents, unit_price_eur_cents AS unitPriceEurCents,
             discount_percent AS discountPercent, total_czk_cents AS totalCzkCents, total_eur_cents AS totalEurCents, source
      FROM service_order_materials WHERE order_engine_id = ? ORDER BY created_at
    `).bind(orderEngineId).all(),
    d1.prepare(`
      SELECT id, code, name, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents,
             expected_date AS expectedDate, is_ordered AS isOrdered, arrived_at AS arrivedAt
      FROM service_order_waiting_parts WHERE order_engine_id = ? ORDER BY created_at
    `).bind(orderEngineId).all(),
    d1.prepare("SELECT id, code, name_cs AS nameCs, name_en AS nameEn, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents FROM service_price_items WHERE archived_at IS NULL ORDER BY sort_order").all(),
    d1.prepare("SELECT id, code, name, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents FROM inventory_parts WHERE archived_at IS NULL ORDER BY code COLLATE NOCASE").all(),
  ]);

  return auth.json({
    engine: {
      ...engine,
      carbService: Boolean(engine.carbService),
      customerParts: Boolean(engine.customerParts),
      works: works.results,
      materials: materials.results,
      waitingParts: waitingParts.results,
    },
    priceItems: priceItems.results,
    inventoryParts: inventoryParts.results,
  });
}

export async function PUT(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await ensureRuntimeSchema();
  const d1 = getD1();
  const kind = payload.kind ?? "";

  if (kind === "status") return updateStatus(d1, auth.user, payload);
  if (kind === "work") return upsertLine(d1, auth.user, "work", payload);
  if (kind === "material") return upsertLine(d1, auth.user, "material", payload);
  if (kind === "waitingPart") return upsertWaitingPart(d1, auth.user, payload);
  return Response.json({ error: "Unknown kind" }, { status: 400 });
}

async function updateStatus(d1: D1, user: { email: string; fullName: string }, payload: Payload) {
  const orderEngineId = clean(payload.orderEngineId, 80);
  if (!orderEngineId) return Response.json({ error: "Order engine id is required" }, { status: 400 });
  if (!MECHANIC_STATUSES.includes(payload.status as MechanicStatus)) return Response.json({ error: "Unknown status" }, { status: 400 });

  const engine = await loadEngineForWrite(d1, orderEngineId);
  const blocked = blockedReason(engine);
  if (blocked === "Engine not found") return Response.json({ error: blocked }, { status: 404 });
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  const now = Date.now();
  const fields: Array<[string, unknown]> = [["status", payload.status]];
  if (payload.status === "in_progress" && engine!.status === "received") {
    fields.push(["taken_by", user.email], ["taken_by_name", user.fullName], ["taken_at", now]);
  }
  if (payload.status === "done") {
    fields.push(["completed_by", user.email], ["completed_by_name", user.fullName], ["completed_at", now]);
  }
  await d1.prepare(`UPDATE service_order_engines SET ${fields.map(([column]) => `${column} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...fields.map(([, value]) => value), now, orderEngineId).run();
  return Response.json({ id: orderEngineId });
}

function lineTotal(unitCents: number, qty: number, discountPercent: number) {
  return Math.round(unitCents * qty * (100 - discountPercent) / 100);
}

async function upsertLine(d1: D1, user: { email: string; fullName: string }, kind: "work" | "material", payload: Payload) {
  const action = payload.action ?? "create";
  const table = kind === "work" ? "service_order_works" : "service_order_materials";

  if (action === "delete") {
    const id = clean(payload.id, 80);
    if (!id) return Response.json({ error: "Line id is required" }, { status: 400 });
    const row = await d1.prepare(`SELECT order_engine_id AS orderEngineId FROM ${table} WHERE id = ?`).bind(id).first<{ orderEngineId: string }>();
    if (!row) return Response.json({ error: "Line not found" }, { status: 404 });
    const blocked = blockedReason(await loadEngineForWrite(d1, row.orderEngineId));
    if (blocked) return Response.json({ error: blocked }, { status: 409 });
    await d1.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
    return Response.json({ id });
  }

  const orderEngineId = clean(payload.orderEngineId, 80);
  if (!orderEngineId) return Response.json({ error: "Order engine id is required" }, { status: 400 });
  const engine = await loadEngineForWrite(d1, orderEngineId);
  const blocked = blockedReason(engine);
  if (blocked === "Engine not found") return Response.json({ error: blocked }, { status: 404 });
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  const now = Date.now();
  const qty = quantity(payload.quantity);
  const id = crypto.randomUUID();

  if (kind === "work") {
    // Cena jde vždycky z ceníku podle priceItemId — mechanik nemá odkud vzít cenu vlastní.
    const priceItemId = clean(payload.priceItemId, 80);
    if (!priceItemId) return Response.json({ error: "Price item is required" }, { status: 400 });
    const priceItem = await d1.prepare(`
      SELECT code, name_cs AS nameCs, name_en AS nameEn, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents
      FROM service_price_items WHERE id = ? AND archived_at IS NULL
    `).bind(priceItemId).first<{ code: string; nameCs: string; nameEn: string; priceCzkCents: number; priceEurCents: number }>();
    if (!priceItem) return Response.json({ error: "Unknown or inactive price item" }, { status: 400 });

    // Sleva se dopočítá ze zakázky na serveru — nikdy z toho, co poslal klient.
    const discountPercent = engine!.discountWorkPercent;
    const totalCzkCents = lineTotal(priceItem.priceCzkCents, qty, discountPercent);
    const totalEurCents = lineTotal(priceItem.priceEurCents, qty, discountPercent);
    await d1.prepare(`
      INSERT INTO service_order_works (id, order_engine_id, price_item_id, code_snapshot, name_cs_snapshot, name_en_snapshot, quantity, unit_price_czk_cents, unit_price_eur_cents, discount_percent, total_czk_cents, total_eur_cents, created_by, created_by_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, orderEngineId, priceItemId, priceItem.code, priceItem.nameCs, priceItem.nameEn, qty, priceItem.priceCzkCents, priceItem.priceEurCents, discountPercent, totalCzkCents, totalEurCents, user.email, user.fullName, now, now).run();
    return Response.json({ id }, { status: 201 });
  }

  const source = payload.source === "customer" ? "customer" : "stock";
  let code = clean(payload.code, 60);
  let name = clean(payload.name, 200);
  let unitPriceCzkCents = 0;
  let unitPriceEurCents = 0;

  if (source === "stock") {
    // Sklad taky jen výběrem — cena jde z katalogu, ne od mechanika.
    const inventoryPartId = clean(payload.inventoryPartId, 80);
    if (!inventoryPartId) return Response.json({ error: "Inventory part is required" }, { status: 400 });
    const part = await d1.prepare("SELECT code, name, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents FROM inventory_parts WHERE id = ? AND archived_at IS NULL")
      .bind(inventoryPartId).first<{ code: string; name: string; priceCzkCents: number; priceEurCents: number }>();
    if (!part) return Response.json({ error: "Unknown or inactive inventory part" }, { status: 400 });
    code = part.code;
    name = part.name;
    unitPriceCzkCents = part.priceCzkCents;
    unitPriceEurCents = part.priceEurCents;
  } else if (!name) {
    return Response.json({ error: "Part name is required" }, { status: 400 });
  }
  // Zákazníkův vlastní díl (`source === "customer"`) se účtuje nulou — cena zůstává 0 i tady.

  const discountPercent = source === "stock" ? engine!.discountMaterialPercent : 0;
  const totalCzkCents = lineTotal(unitPriceCzkCents, qty, discountPercent);
  const totalEurCents = lineTotal(unitPriceEurCents, qty, discountPercent);
  await d1.prepare(`
    INSERT INTO service_order_materials (id, order_engine_id, inventory_part_id, code, name, quantity, unit_price_czk_cents, unit_price_eur_cents, discount_percent, total_czk_cents, total_eur_cents, source, created_by, created_by_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, orderEngineId, payload.inventoryPartId ? clean(payload.inventoryPartId, 80) : null, code, name, qty, unitPriceCzkCents, unitPriceEurCents, discountPercent, totalCzkCents, totalEurCents, source, user.email, user.fullName, now, now).run();
  return Response.json({ id }, { status: 201 });
}

async function upsertWaitingPart(d1: D1, user: { email: string }, payload: Payload) {
  const action = payload.action ?? "create";

  if (action === "delete") {
    const id = clean(payload.id, 80);
    if (!id) return Response.json({ error: "Waiting part id is required" }, { status: 400 });
    const row = await d1.prepare("SELECT order_engine_id AS orderEngineId FROM service_order_waiting_parts WHERE id = ?").bind(id).first<{ orderEngineId: string }>();
    if (!row) return Response.json({ error: "Waiting part not found" }, { status: 404 });
    const blocked = blockedReason(await loadEngineForWrite(d1, row.orderEngineId));
    if (blocked) return Response.json({ error: blocked }, { status: 409 });
    await d1.prepare("DELETE FROM service_order_waiting_parts WHERE id = ?").bind(id).run();
    return Response.json({ id });
  }

  if (action === "arrived") {
    const id = clean(payload.id, 80);
    if (!id) return Response.json({ error: "Waiting part id is required" }, { status: 400 });
    const row = await d1.prepare("SELECT order_engine_id AS orderEngineId FROM service_order_waiting_parts WHERE id = ?").bind(id).first<{ orderEngineId: string }>();
    if (!row) return Response.json({ error: "Waiting part not found" }, { status: 404 });
    const engine = await loadEngineForWrite(d1, row.orderEngineId);
    const blocked = blockedReason(engine);
    if (blocked) return Response.json({ error: blocked }, { status: 409 });
    const now = Date.now();
    const statements = [d1.prepare("UPDATE service_order_waiting_parts SET arrived_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id)];
    if (engine!.status === "waiting_part") {
      statements.push(d1.prepare("UPDATE service_order_engines SET status = 'in_progress', updated_at = ? WHERE id = ?").bind(now, row.orderEngineId));
    }
    await d1.batch(statements);
    return Response.json({ id });
  }

  const orderEngineId = clean(payload.orderEngineId, 80);
  if (!orderEngineId) return Response.json({ error: "Order engine id is required" }, { status: 400 });
  const name = clean(payload.name, 200);
  if (!name) return Response.json({ error: "Part name is required" }, { status: 400 });
  const blocked = blockedReason(await loadEngineForWrite(d1, orderEngineId));
  if (blocked === "Engine not found") return Response.json({ error: blocked }, { status: 404 });
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  const now = Date.now();
  const id = crypto.randomUUID();
  await d1.prepare(`
    INSERT INTO service_order_waiting_parts (id, order_engine_id, code, name, price_czk_cents, price_eur_cents, expected_date, is_ordered, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)
  `).bind(id, orderEngineId, clean(payload.code, 60), name, clean(payload.expectedDate, 10), payload.isOrdered ? 1 : 0, user.email, now, now).run();
  return Response.json({ id }, { status: 201 });
}
