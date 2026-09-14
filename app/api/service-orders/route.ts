import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";
import { parseTime } from "../../engine-usage";

/**
 * Zakázkový servis pro zákazníky — zakázky, motory na nich a provedená práce/materiál.
 *
 * Sekce Zakázky je mimo mechanika úplně (viz tabulka oprávnění v zadání) — routa je jen pro
 * superadmina a vedení. Mechanik zapisuje práci a materiál přes vlastní úzkou routu
 * `/api/customer-service` (etapa 5), která do stejných tabulek píše, ale ukazuje mu jen to,
 * co potřebuje k práci na jedné dlaždici.
 *
 * Číslo zakázky je ve tvaru SERVIS_26-001 a počítá se z `MAX` existujících čísel v roce, ne
 * z `COUNT` — po smazání/stornu řádku by `COUNT` začalo čísla opakovat.
 */

type D1 = ReturnType<typeof getD1>;

type EnginePayload = {
  customerEngineId?: string;
  newEngine?: { code?: string; serviceEngineTypeId?: string; note?: string };
  /** Motohodiny při příjmu jako "HH:MM" (stejně jako u našich motorů), ne v minutách. */
  engineMinutes?: string | null;
  scope?: string;
  carbService?: boolean;
  customerParts?: boolean;
  customerPartsText?: string;
};

type Payload = {
  kind?: string;
  action?: string;
  id?: string;
  orderId?: string;
  orderEngineId?: string;
  reason?: string;
  // order header
  customerId?: string;
  currency?: string;
  discountWorkPercent?: number;
  discountMaterialPercent?: number;
  receivedAt?: string;
  deadlineDate?: string;
  deadlineNote?: string;
  customerNote?: string;
  internalNote?: string;
  handoverType?: string;
  carrier?: string;
  trackingNumber?: string;
  shippingPriceCzkCents?: number;
  shippingPriceEurCents?: number;
  shippedAt?: string;
  engines?: EnginePayload[];
  // engine sub-payload (create/update)
  customerEngineId?: string;
  newEngine?: EnginePayload["newEngine"];
  engineMinutes?: string | null;
  scope?: string;
  carbService?: boolean;
  customerParts?: boolean;
  customerPartsText?: string;
  status?: string;
  // work / material / waiting part
  priceItemId?: string;
  inventoryPartId?: string;
  code?: string;
  nameCsSnapshot?: string;
  nameEnSnapshot?: string;
  name?: string;
  quantity?: number;
  unitPriceCzkCents?: number;
  unitPriceEurCents?: number;
  priceCzkCents?: number;
  priceEurCents?: number;
  discountPercent?: number;
  source?: string;
  expectedDate?: string;
  isOrdered?: boolean;
};

const STATUSES = ["received", "in_progress", "waiting_part", "done", "checked", "handed_over"] as const;
type Status = (typeof STATUSES)[number];

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}
/** Sleva a podobná celá procenta 0–100 — mimo rozsah se ořeže, ne odmítne. */
function percent(value: unknown) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}
/** Cena v haléřích/centech — nikdy záporná, chybějící hodnota je legitimní nula. */
function cents(value: unknown) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}
function quantity(value: unknown) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 1;
}
/**
 * "HH:MM" → minuty, stejný `parseTime()` jako u motohodin našich motorů (`app/engine-usage.ts`).
 * Prázdné/`null`/`undefined` = nezadáno. `false` = zadáno, ale ve špatném formátu — volající
 * na to musí odpovědět 400, ne si tiše domyslet nulu.
 */
function engineMinutesFromInput(value: unknown): number | null | false {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const minutes = parseTime(text, true);
  return minutes === null ? false : minutes;
}
function lineTotal(unitCents: number, qty: number, discountPercent: number) {
  return Math.round(unitCents * qty * (100 - discountPercent) / 100);
}

async function requireManager(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return { error: auth.error } as const;
  if (auth.user.role === "mechanic") return { error: Response.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { user: auth.user, json: auth.json } as const;
}

/**
 * `SERVIS_26-001`, počítadlo v rámci roku podle MAX z `service_order_numbers`, ne z
 * `service_orders` — ta se po 30 dnech v koši zmenšuje (viz `purgeExpiredTrash`), zatímco
 * ledger čísel zůstává napořád, takže se číslo nikdy nepřidělí podruhé.
 */
async function nextOrderNumber(d1: D1, receivedAt: string) {
  const year = /^\d{4}/.test(receivedAt) ? receivedAt.slice(2, 4) : String(new Date().getFullYear()).slice(2, 4);
  const prefix = `SERVIS_${year}-`;
  const existing = await d1.prepare("SELECT number FROM service_order_numbers WHERE number LIKE ? ORDER BY number DESC LIMIT 1")
    .bind(`${prefix}%`).first<{ number: string }>();
  const lastSeq = existing ? Number.parseInt(existing.number.slice(prefix.length), 10) : 0;
  const nextSeq = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Lazy sweep koše — spouští se opportunisticky při běžném provozu (GET, DELETE), protože
 * projekt nemá cron trigger. Po 30 dnech v koši zmizí obsah zakázky skutečně: fotky z R2,
 * všechny podřízené řádky a samotná zakázka. `service_order_numbers` a `customer_engines`
 * se nikdy nemažou — číslo zůstává rezervované, motor zůstává v historii zákazníka.
 */
async function purgeExpiredTrash(d1: D1) {
  const threshold = Date.now() - THIRTY_DAYS_MS;
  const expired = await d1.prepare("SELECT id FROM service_orders WHERE deleted_at IS NOT NULL AND deleted_at <= ?")
    .bind(threshold).all<{ id: string }>();
  if (!expired.results.length) return;

  const bucket = getAssetsBucket();
  for (const { id: orderId } of expired.results) {
    const photos = await d1.prepare("SELECT object_key AS objectKey FROM service_order_photos WHERE order_id = ?").bind(orderId).all<{ objectKey: string }>();
    await Promise.all(photos.results.map((photo) => bucket.delete(photo.objectKey).catch(() => undefined)));

    const engines = await d1.prepare("SELECT id FROM service_order_engines WHERE order_id = ?").bind(orderId).all<{ id: string }>();
    const engineIds = engines.results.map((row) => row.id);
    const statements = [
      d1.prepare("DELETE FROM service_order_photos WHERE order_id = ?").bind(orderId),
      ...(engineIds.length ? [
        d1.prepare(`DELETE FROM service_order_waiting_parts WHERE order_engine_id IN (${engineIds.map(() => "?").join(",")})`).bind(...engineIds),
        d1.prepare(`DELETE FROM service_order_materials WHERE order_engine_id IN (${engineIds.map(() => "?").join(",")})`).bind(...engineIds),
        d1.prepare(`DELETE FROM service_order_works WHERE order_engine_id IN (${engineIds.map(() => "?").join(",")})`).bind(...engineIds),
      ] : []),
      d1.prepare("DELETE FROM service_order_engines WHERE order_id = ?").bind(orderId),
      d1.prepare("DELETE FROM service_orders WHERE id = ?").bind(orderId),
    ];
    await d1.batch(statements);
  }
}

async function loadOrderEngine(d1: D1, orderEngineId: string) {
  return d1.prepare(`
    SELECT oe.id, oe.order_id AS orderId, oe.status, o.cancelled_at AS orderCancelledAt,
           o.deleted_at AS orderDeletedAt, o.invoiced_at AS invoicedAt, o.unlocked_at AS unlockedAt
    FROM service_order_engines oe JOIN service_orders o ON o.id = oe.order_id
    WHERE oe.id = ?
  `).bind(orderEngineId).first<{ id: string; orderId: string; status: Status; orderCancelledAt: number | null; orderDeletedAt: number | null; invoicedAt: number | null; unlockedAt: number | null }>();
}

/** Po vyfakturování se zakázka uzavírá — editace jde jen po odemknutí superadminem. */
function isLocked(order: { invoicedAt: number | null; unlockedAt: number | null }) {
  return order.invoicedAt !== null && (order.unlockedAt === null || order.unlockedAt < order.invoicedAt);
}

// ——— GET ———

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  await purgeExpiredTrash(d1);
  const url = new URL(request.url);
  const id = clean(url.searchParams.get("id"), 80);

  if (id) return getOrderDetail(d1, id);

  const status = clean(url.searchParams.get("status"), 40);
  const customerId = clean(url.searchParams.get("customerId"), 80);
  const receivedFrom = clean(url.searchParams.get("receivedFrom"), 10);
  const receivedTo = clean(url.searchParams.get("receivedTo"), 10);
  const trash = url.searchParams.get("trash") === "1";
  // Koš vidí jen superadmin — vedení a mechanik o něm nemají ani vědět.
  if (trash && auth.user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const conditions: string[] = [trash ? "o.deleted_at IS NOT NULL" : "o.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (customerId) { conditions.push("o.customer_id = ?"); params.push(customerId); }
  if (receivedFrom) { conditions.push("o.received_at >= ?"); params.push(receivedFrom); }
  if (receivedTo) { conditions.push("o.received_at <= ?"); params.push(receivedTo); }
  if (status) { conditions.push("EXISTS (SELECT 1 FROM service_order_engines oe WHERE oe.order_id = o.id AND oe.status = ?)"); params.push(status); }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const orders = await d1.prepare(`
    SELECT o.id, o.number, o.customer_id AS customerId, c.name AS customerName, o.currency,
           o.received_at AS receivedAt, o.deadline_date AS deadlineDate, o.deadline_note AS deadlineNote,
           o.invoiced_at AS invoicedAt, o.cancelled_at AS cancelledAt,
           o.deleted_at AS deletedAt, o.deleted_by AS deletedBy,
           (SELECT COUNT(*) FROM service_order_engines oe WHERE oe.order_id = o.id) AS engineCount,
           (SELECT COUNT(*) FROM service_order_engines oe WHERE oe.order_id = o.id AND oe.status = 'received') AS receivedCount,
           (SELECT COUNT(*) FROM service_order_engines oe WHERE oe.order_id = o.id AND oe.status = 'in_progress') AS inProgressCount,
           (SELECT COUNT(*) FROM service_order_engines oe WHERE oe.order_id = o.id AND oe.status = 'waiting_part') AS waitingPartCount,
           (SELECT COUNT(*) FROM service_order_engines oe WHERE oe.order_id = o.id AND oe.status = 'done') AS doneCount,
           (SELECT COUNT(*) FROM service_order_engines oe WHERE oe.order_id = o.id AND oe.status = 'checked') AS checkedCount,
           (SELECT COUNT(*) FROM service_order_engines oe WHERE oe.order_id = o.id AND oe.status = 'handed_over') AS handedOverCount,
           COALESCE((SELECT SUM(w.total_czk_cents) FROM service_order_works w JOIN service_order_engines oe ON oe.id = w.order_engine_id WHERE oe.order_id = o.id), 0)
             + COALESCE((SELECT SUM(m.total_czk_cents) FROM service_order_materials m JOIN service_order_engines oe ON oe.id = m.order_engine_id WHERE oe.order_id = o.id), 0) AS totalCzkCents,
           COALESCE((SELECT SUM(w.total_eur_cents) FROM service_order_works w JOIN service_order_engines oe ON oe.id = w.order_engine_id WHERE oe.order_id = o.id), 0)
             + COALESCE((SELECT SUM(m.total_eur_cents) FROM service_order_materials m JOIN service_order_engines oe ON oe.id = m.order_engine_id WHERE oe.order_id = o.id), 0) AS totalEurCents
    FROM service_orders o
    JOIN customers c ON c.id = o.customer_id
    ${where}
    ORDER BY o.received_at DESC, o.number DESC
  `).bind(...params).all();

  return Response.json({ orders: orders.results });
}

async function getOrderDetail(d1: D1, id: string) {
  const order = await d1.prepare(`
    SELECT o.id, o.number, o.customer_id AS customerId, c.name AS customerName, c.phone AS customerPhone, c.email AS customerEmail,
           c.discount_work_percent AS customerDiscountWork,
           c.discount_material_percent AS customerDiscountMaterial, c.country_code AS customerCountryCode,
           o.currency, o.discount_work_percent AS discountWorkPercent, o.discount_material_percent AS discountMaterialPercent,
           o.received_at AS receivedAt, o.deadline_date AS deadlineDate, o.deadline_note AS deadlineNote,
           o.customer_note AS customerNote, o.internal_note AS internalNote,
           o.handover_type AS handoverType, o.carrier, o.tracking_number AS trackingNumber,
           o.shipping_price_czk_cents AS shippingPriceCzkCents, o.shipping_price_eur_cents AS shippingPriceEurCents,
           o.shipped_at AS shippedAt, o.invoiced_at AS invoicedAt, o.unlocked_at AS unlockedAt, o.unlocked_by AS unlockedBy,
           o.cancelled_at AS cancelledAt, o.cancelled_by AS cancelledBy, o.cancelled_reason AS cancelledReason,
           o.deleted_at AS deletedAt, o.deleted_by AS deletedBy,
           o.created_by AS createdBy, o.created_at AS createdAt
    FROM service_orders o JOIN customers c ON c.id = o.customer_id
    WHERE o.id = ?
  `).bind(id).first<Record<string, unknown>>();
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

  const engines = await d1.prepare(`
    SELECT oe.id, oe.order_id AS orderId, oe.customer_engine_id AS customerEngineId,
           ce.code AS engineCode, ce.note AS engineNote, t.name_cs AS typeNameCs, t.name_en AS typeNameEn,
           oe.engine_minutes AS engineMinutes, oe.scope, oe.carb_service AS carbService,
           oe.customer_parts AS customerParts, oe.customer_parts_text AS customerPartsText,
           oe.status, oe.taken_by AS takenBy, oe.taken_by_name AS takenByName, oe.taken_at AS takenAt,
           oe.completed_by AS completedBy, oe.completed_by_name AS completedByName, oe.completed_at AS completedAt,
           oe.checked_by AS checkedBy, oe.checked_at AS checkedAt, oe.handed_over_at AS handedOverAt,
           oe.reopened_at AS reopenedAt, oe.reopened_by AS reopenedBy, oe.reopen_reason AS reopenReason,
           oe.sort_order AS sortOrder
    FROM service_order_engines oe
    JOIN customer_engines ce ON ce.id = oe.customer_engine_id
    JOIN service_engine_types t ON t.id = ce.service_engine_type_id
    WHERE oe.order_id = ?
    ORDER BY oe.sort_order
  `).bind(id).all<Record<string, unknown> & { id: string; carbService: number; customerParts: number }>();

  const engineIds = engines.results.map((row) => row.id as string);
  const [works, materials, waitingParts, photos] = engineIds.length === 0
    ? [{ results: [] }, { results: [] }, { results: [] }, { results: [] }]
    : await Promise.all([
      d1.prepare(`SELECT id, order_engine_id AS orderEngineId, price_item_id AS priceItemId, code_snapshot AS codeSnapshot,
                    name_cs_snapshot AS nameCsSnapshot, name_en_snapshot AS nameEnSnapshot, quantity,
                    unit_price_czk_cents AS unitPriceCzkCents, unit_price_eur_cents AS unitPriceEurCents,
                    discount_percent AS discountPercent, total_czk_cents AS totalCzkCents, total_eur_cents AS totalEurCents,
                    created_by_name AS createdByName, created_at AS createdAt
             FROM service_order_works WHERE order_engine_id IN (${engineIds.map(() => "?").join(",")}) ORDER BY created_at`).bind(...engineIds).all(),
      d1.prepare(`SELECT id, order_engine_id AS orderEngineId, inventory_part_id AS inventoryPartId, code, name, quantity,
                    unit_price_czk_cents AS unitPriceCzkCents, unit_price_eur_cents AS unitPriceEurCents,
                    discount_percent AS discountPercent, total_czk_cents AS totalCzkCents, total_eur_cents AS totalEurCents,
                    source, created_by_name AS createdByName, created_at AS createdAt
             FROM service_order_materials WHERE order_engine_id IN (${engineIds.map(() => "?").join(",")}) ORDER BY created_at`).bind(...engineIds).all(),
      d1.prepare(`SELECT id, order_engine_id AS orderEngineId, code, name, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents,
                    expected_date AS expectedDate, is_ordered AS isOrdered, arrived_at AS arrivedAt, created_at AS createdAt
             FROM service_order_waiting_parts WHERE order_engine_id IN (${engineIds.map(() => "?").join(",")}) ORDER BY created_at`).bind(...engineIds).all(),
      d1.prepare(`SELECT id, order_id AS orderId, order_engine_id AS orderEngineId, file_name AS fileName, content_type AS contentType,
                    size_bytes AS sizeBytes, note, created_by AS createdBy, created_at AS createdAt
             FROM service_order_photos WHERE order_id = ? ORDER BY created_at DESC`).bind(id).all(),
    ]);

  const worksByEngine = new Map<string, unknown[]>();
  for (const row of works.results as Array<{ orderEngineId: string }>) {
    const list = worksByEngine.get(row.orderEngineId) ?? [];
    list.push(row);
    worksByEngine.set(row.orderEngineId, list);
  }
  const materialsByEngine = new Map<string, unknown[]>();
  for (const row of materials.results as Array<{ orderEngineId: string }>) {
    const list = materialsByEngine.get(row.orderEngineId) ?? [];
    list.push(row);
    materialsByEngine.set(row.orderEngineId, list);
  }
  const waitingByEngine = new Map<string, unknown[]>();
  for (const row of waitingParts.results as Array<{ orderEngineId: string }>) {
    const list = waitingByEngine.get(row.orderEngineId) ?? [];
    list.push(row);
    waitingByEngine.set(row.orderEngineId, list);
  }

  return Response.json({
    order: {
      ...order,
      locked: isLocked({ invoicedAt: order.invoicedAt as number | null, unlockedAt: order.unlockedAt as number | null }),
      engines: engines.results.map((engine) => ({
        ...engine,
        carbService: Boolean(engine.carbService),
        customerParts: Boolean(engine.customerParts),
        works: worksByEngine.get(engine.id) ?? [],
        materials: materialsByEngine.get(engine.id) ?? [],
        waitingParts: waitingByEngine.get(engine.id) ?? [],
      })),
      photos: photos.results,
    },
  });
}

// ——— POST ———

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
  const receivedAt = clean(payload.receivedAt, 10);
  const currency = payload.currency === "EUR" ? "EUR" : "CZK";
  if (!customerId) return Response.json({ error: "Customer is required" }, { status: 400 });
  if (!receivedAt) return Response.json({ error: "Received date is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const customer = await d1.prepare("SELECT id, discount_work_percent AS discountWorkPercent, discount_material_percent AS discountMaterialPercent FROM customers WHERE id = ? AND archived_at IS NULL")
    .bind(customerId).first<{ discountWorkPercent: number; discountMaterialPercent: number }>();
  if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });

  const discountWorkPercent = payload.discountWorkPercent !== undefined ? percent(payload.discountWorkPercent) : customer.discountWorkPercent;
  const discountMaterialPercent = payload.discountMaterialPercent !== undefined ? percent(payload.discountMaterialPercent) : customer.discountMaterialPercent;

  const engineInputs = Array.isArray(payload.engines) ? payload.engines : [];
  // Motor buď existující ze zákazníkovy historie, nebo se založí nový hned tady.
  const resolvedEngines: Array<{ customerEngineId: string; isNew: boolean; input: EnginePayload }> = [];
  for (const engineInput of engineInputs) {
    if (engineMinutesFromInput(engineInput.engineMinutes) === false) {
      return Response.json({ error: "Engine hours must use HH:MM" }, { status: 400 });
    }
    if (engineInput.customerEngineId) {
      const customerEngineId = clean(engineInput.customerEngineId, 80);
      const engine = await d1.prepare("SELECT id FROM customer_engines WHERE id = ? AND customer_id = ?").bind(customerEngineId, customerId).first();
      if (!engine) return Response.json({ error: "Customer engine not found" }, { status: 404 });
      resolvedEngines.push({ customerEngineId, isNew: false, input: engineInput });
    } else if (engineInput.newEngine) {
      const code = clean(engineInput.newEngine.code, 120);
      const serviceEngineTypeId = clean(engineInput.newEngine.serviceEngineTypeId, 80);
      if (!code) return Response.json({ error: "New engine code is required" }, { status: 400 });
      if (!serviceEngineTypeId) return Response.json({ error: "New engine type is required" }, { status: 400 });
      const [type, collision] = await Promise.all([
        d1.prepare("SELECT id FROM service_engine_types WHERE id = ? AND archived_at IS NULL").bind(serviceEngineTypeId).first(),
        d1.prepare("SELECT id FROM customer_engines WHERE LOWER(code) = LOWER(?) AND archived_at IS NULL").bind(code).first(),
      ]);
      if (!type) return Response.json({ error: "Unknown or inactive engine type" }, { status: 400 });
      if (collision) return Response.json({ error: "Engine code already exists" }, { status: 409 });
      resolvedEngines.push({ customerEngineId: crypto.randomUUID(), isNew: true, input: { ...engineInput, newEngine: { code, serviceEngineTypeId, note: clean(engineInput.newEngine.note, 1500) } } });
    } else {
      return Response.json({ error: "Each engine needs an existing customerEngineId or newEngine" }, { status: 400 });
    }
  }

  const now = Date.now();
  const orderId = crypto.randomUUID();
  const statements = [];

  for (const resolved of resolvedEngines) {
    if (resolved.isNew && resolved.input.newEngine) {
      statements.push(d1.prepare(`
        INSERT INTO customer_engines (id, customer_id, code, service_engine_type_id, note, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(resolved.customerEngineId, customerId, resolved.input.newEngine.code, resolved.input.newEngine.serviceEngineTypeId, resolved.input.newEngine.note ?? "", guard.user.email, now, now));
    }
  }

  let orderNumber = await nextOrderNumber(d1, receivedAt);
  const orderStatement = () => d1.prepare(`
    INSERT INTO service_orders (
      id, number, customer_id, currency, discount_work_percent, discount_material_percent,
      received_at, deadline_date, deadline_note, customer_note, internal_note,
      handover_type, carrier, tracking_number, shipping_price_czk_cents, shipping_price_eur_cents, shipped_at,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    orderId, orderNumber, customerId, currency, discountWorkPercent, discountMaterialPercent,
    receivedAt, clean(payload.deadlineDate, 10), clean(payload.deadlineNote, 500), clean(payload.customerNote, 2000), clean(payload.internalNote, 2000),
    ["personal", "carrier", "race"].includes(payload.handoverType ?? "") ? payload.handoverType : "personal",
    clean(payload.carrier, 160), clean(payload.trackingNumber, 160), cents(payload.shippingPriceCzkCents), cents(payload.shippingPriceEurCents), clean(payload.shippedAt, 10),
    guard.user.email, now, now,
  );
  // Rezervace čísla v trvalém ledgeru — ve stejné dávce jako založení zakázky, ať se číslo
  // nikdy nevydá bez odpovídajícího záznamu (a naopak).
  const numberLedgerStatement = () => d1.prepare("INSERT INTO service_order_numbers (number, order_id, created_at) VALUES (?, ?, ?)").bind(orderNumber, orderId, now);

  resolvedEngines.forEach((resolved, index) => {
    statements.push(d1.prepare(`
      INSERT INTO service_order_engines (
        id, order_id, customer_engine_id, engine_minutes, scope, carb_service, customer_parts, customer_parts_text,
        sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), orderId, resolved.customerEngineId,
      // Formát už je ověřený výš (jinak by request skončil 400) — tady je jistě number|null.
      engineMinutesFromInput(resolved.input.engineMinutes) as number | null, clean(resolved.input.scope, 2000), resolved.input.carbService ? 1 : 0,
      resolved.input.customerParts ? 1 : 0, clean(resolved.input.customerPartsText, 2000),
      (index + 1) * 10, now, now,
    ));
  });

  statements.push(d1.prepare(`
    INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, 'create', 'service_order', ?, ?, ?)
  `).bind(crypto.randomUUID(), guard.user.email, orderId, JSON.stringify({ number: orderNumber, customerId, engineCount: resolvedEngines.length }), now));

  // Retry stejně jako u prodejů — souběžný zápis ve stejné vteřině může narazit na unikátní číslo.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await d1.batch([orderStatement(), numberLedgerStatement(), ...statements]);
      return Response.json({ id: orderId, number: orderNumber }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("unique") && message.includes("number") && attempt < 4) {
        orderNumber = await nextOrderNumber(d1, receivedAt);
        continue;
      }
      throw error;
    }
  }
  return Response.json({ error: "Could not create order" }, { status: 500 });
}

// ——— PUT ———

export async function PUT(request: Request) {
  const guard = await requireManager(request);
  if (guard.error) return guard.error;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await ensureRuntimeSchema();
  const d1 = getD1();
  await purgeExpiredTrash(d1);
  const kind = payload.kind ?? "";

  if (kind === "order") return updateOrder(d1, guard.user, payload);
  if (kind === "engine") return upsertEngine(d1, guard.user, payload);
  if (kind === "engineStatus") return updateEngineStatus(d1, guard.user, payload);
  if (kind === "work") return upsertLine(d1, guard.user, "work", payload);
  if (kind === "material") return upsertLine(d1, guard.user, "material", payload);
  if (kind === "waitingPart") return upsertWaitingPart(d1, guard.user, payload);
  if (kind === "invoice") return invoiceOrder(d1, payload);
  if (kind === "unlock") return unlockOrder(d1, guard.user, payload);
  if (kind === "trash") return trashOrder(d1, guard.user, payload);
  if (kind === "restore") return restoreOrder(d1, payload);
  return Response.json({ error: "Unknown kind" }, { status: 400 });
}

/**
 * Přesun zakázky do koše — jen zviditelnění (`deleted_at`), R2 fotky ani podřízené řádky se
 * nedotknou. Skutečně zmizí až po 30 dnech přes `purgeExpiredTrash`. Jen superadmin.
 */
async function trashOrder(d1: D1, user: { email: string; role: string }, payload: Payload) {
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = clean(payload.orderId ?? payload.id, 80);
  if (!id) return Response.json({ error: "Order id is required" }, { status: 400 });
  const now = Date.now();
  const result = await d1.prepare("UPDATE service_orders SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
    .bind(now, user.email, now, id).run();
  if (!result.meta.changes) return Response.json({ error: "Order not found or already in trash" }, { status: 409 });
  await d1.prepare(`
    INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, 'trash', 'service_order', ?, '{}', ?)
  `).bind(crypto.randomUUID(), user.email, id, now).run();
  return Response.json({ id });
}

/** Obnovení z koše — zakázka se vrátí přesně do stavu, v jakém byla (storno/fakturace se nemění). */
async function restoreOrder(d1: D1, payload: Payload) {
  const id = clean(payload.orderId ?? payload.id, 80);
  if (!id) return Response.json({ error: "Order id is required" }, { status: 400 });
  const now = Date.now();
  const result = await d1.prepare("UPDATE service_orders SET deleted_at = NULL, deleted_by = '', updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL")
    .bind(now, id).run();
  if (!result.meta.changes) return Response.json({ error: "Order not found or not in trash" }, { status: 409 });
  return Response.json({ id });
}

async function updateOrder(d1: D1, user: { email: string }, payload: Payload) {
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Order id is required" }, { status: 400 });
  const order = await d1.prepare("SELECT id, invoiced_at AS invoicedAt, unlocked_at AS unlockedAt, cancelled_at AS cancelledAt, deleted_at AS deletedAt FROM service_orders WHERE id = ?")
    .bind(id).first<{ invoicedAt: number | null; unlockedAt: number | null; cancelledAt: number | null; deletedAt: number | null }>();
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (order.deletedAt) return Response.json({ error: "Order is in trash" }, { status: 409 });
  if (order.cancelledAt) return Response.json({ error: "Order is cancelled" }, { status: 409 });
  if (isLocked(order)) return Response.json({ error: "Order is locked after invoicing" }, { status: 409 });

  const now = Date.now();
  const fields: Array<[string, unknown]> = [];
  if (payload.currency !== undefined) fields.push(["currency", payload.currency === "EUR" ? "EUR" : "CZK"]);
  if (payload.discountWorkPercent !== undefined) fields.push(["discount_work_percent", percent(payload.discountWorkPercent)]);
  if (payload.discountMaterialPercent !== undefined) fields.push(["discount_material_percent", percent(payload.discountMaterialPercent)]);
  if (payload.deadlineDate !== undefined) fields.push(["deadline_date", clean(payload.deadlineDate, 10)]);
  if (payload.deadlineNote !== undefined) fields.push(["deadline_note", clean(payload.deadlineNote, 500)]);
  if (payload.customerNote !== undefined) fields.push(["customer_note", clean(payload.customerNote, 2000)]);
  if (payload.internalNote !== undefined) fields.push(["internal_note", clean(payload.internalNote, 2000)]);
  if (payload.handoverType !== undefined) fields.push(["handover_type", ["personal", "carrier", "race"].includes(payload.handoverType) ? payload.handoverType : "personal"]);
  if (payload.carrier !== undefined) fields.push(["carrier", clean(payload.carrier, 160)]);
  if (payload.trackingNumber !== undefined) fields.push(["tracking_number", clean(payload.trackingNumber, 160)]);
  if (payload.shippingPriceCzkCents !== undefined) fields.push(["shipping_price_czk_cents", cents(payload.shippingPriceCzkCents)]);
  if (payload.shippingPriceEurCents !== undefined) fields.push(["shipping_price_eur_cents", cents(payload.shippingPriceEurCents)]);
  if (payload.shippedAt !== undefined) fields.push(["shipped_at", clean(payload.shippedAt, 10)]);
  if (!fields.length) return Response.json({ id });

  await d1.prepare(`UPDATE service_orders SET ${fields.map(([column]) => `${column} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...fields.map(([, value]) => value), now, id).run();
  return Response.json({ id });
}

async function upsertEngine(d1: D1, user: { email: string }, payload: Payload) {
  const now = Date.now();

  if (payload.orderEngineId) {
    const id = clean(payload.orderEngineId, 80);
    const existing = await loadOrderEngine(d1, id);
    if (!existing) return Response.json({ error: "Order engine not found" }, { status: 404 });
    if (existing.orderDeletedAt) return Response.json({ error: "Order is in trash" }, { status: 409 });
    if (existing.orderCancelledAt) return Response.json({ error: "Order is cancelled" }, { status: 409 });
    if (isLocked(existing)) return Response.json({ error: "Order is locked after invoicing" }, { status: 409 });

    const fields: Array<[string, unknown]> = [];
    if (payload.engineMinutes !== undefined) {
      const minutes = engineMinutesFromInput(payload.engineMinutes);
      if (minutes === false) return Response.json({ error: "Engine hours must use HH:MM" }, { status: 400 });
      fields.push(["engine_minutes", minutes]);
    }
    if (payload.scope !== undefined) fields.push(["scope", clean(payload.scope, 2000)]);
    if (payload.carbService !== undefined) fields.push(["carb_service", payload.carbService ? 1 : 0]);
    if (payload.customerParts !== undefined) fields.push(["customer_parts", payload.customerParts ? 1 : 0]);
    if (payload.customerPartsText !== undefined) fields.push(["customer_parts_text", clean(payload.customerPartsText, 2000)]);
    if (!fields.length) return Response.json({ id });
    await d1.prepare(`UPDATE service_order_engines SET ${fields.map(([column]) => `${column} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
      .bind(...fields.map(([, value]) => value), now, id).run();
    return Response.json({ id });
  }

  const orderId = clean(payload.orderId, 80);
  if (!orderId) return Response.json({ error: "Order id is required" }, { status: 400 });
  const order = await d1.prepare("SELECT id, customer_id AS customerId, invoiced_at AS invoicedAt, unlocked_at AS unlockedAt, cancelled_at AS cancelledAt, deleted_at AS deletedAt FROM service_orders WHERE id = ?")
    .bind(orderId).first<{ customerId: string; invoicedAt: number | null; unlockedAt: number | null; cancelledAt: number | null; deletedAt: number | null }>();
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (order.deletedAt) return Response.json({ error: "Order is in trash" }, { status: 409 });
  if (order.cancelledAt) return Response.json({ error: "Order is cancelled" }, { status: 409 });
  if (isLocked(order)) return Response.json({ error: "Order is locked after invoicing" }, { status: 409 });

  let customerEngineId = "";
  const statements = [];
  if (payload.customerEngineId) {
    customerEngineId = clean(payload.customerEngineId, 80);
    const engine = await d1.prepare("SELECT id FROM customer_engines WHERE id = ? AND customer_id = ?").bind(customerEngineId, order.customerId).first();
    if (!engine) return Response.json({ error: "Customer engine not found" }, { status: 404 });
  } else if (payload.newEngine) {
    const code = clean(payload.newEngine.code, 120);
    const serviceEngineTypeId = clean(payload.newEngine.serviceEngineTypeId, 80);
    if (!code) return Response.json({ error: "New engine code is required" }, { status: 400 });
    if (!serviceEngineTypeId) return Response.json({ error: "New engine type is required" }, { status: 400 });
    const [type, collision] = await Promise.all([
      d1.prepare("SELECT id FROM service_engine_types WHERE id = ? AND archived_at IS NULL").bind(serviceEngineTypeId).first(),
      d1.prepare("SELECT id FROM customer_engines WHERE LOWER(code) = LOWER(?) AND archived_at IS NULL").bind(code).first(),
    ]);
    if (!type) return Response.json({ error: "Unknown or inactive engine type" }, { status: 400 });
    if (collision) return Response.json({ error: "Engine code already exists" }, { status: 409 });
    customerEngineId = crypto.randomUUID();
    statements.push(d1.prepare(`
      INSERT INTO customer_engines (id, customer_id, code, service_engine_type_id, note, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(customerEngineId, order.customerId, code, serviceEngineTypeId, clean(payload.newEngine.note, 1500), user.email, now, now));
  } else {
    return Response.json({ error: "customerEngineId or newEngine is required" }, { status: 400 });
  }

  const engineMinutes = engineMinutesFromInput(payload.engineMinutes);
  if (engineMinutes === false) return Response.json({ error: "Engine hours must use HH:MM" }, { status: 400 });

  const maxSort = Number((await d1.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM service_order_engines WHERE order_id = ?").bind(orderId).first<{ value: number }>())?.value ?? 0);
  const orderEngineId = crypto.randomUUID();
  statements.push(d1.prepare(`
    INSERT INTO service_order_engines (id, order_id, customer_engine_id, engine_minutes, scope, carb_service, customer_parts, customer_parts_text, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(orderEngineId, orderId, customerEngineId, engineMinutes, clean(payload.scope, 2000), payload.carbService ? 1 : 0, payload.customerParts ? 1 : 0, clean(payload.customerPartsText, 2000), maxSort + 10, now, now));

  await d1.batch(statements);
  return Response.json({ id: orderEngineId }, { status: 201 });
}

async function updateEngineStatus(d1: D1, user: { email: string; fullName: string }, payload: Payload) {
  const orderEngineId = clean(payload.orderEngineId, 80);
  const status = payload.status;
  if (!orderEngineId) return Response.json({ error: "Order engine id is required" }, { status: 400 });
  if (!STATUSES.includes(status as Status)) return Response.json({ error: "Unknown status" }, { status: 400 });

  const existing = await loadOrderEngine(d1, orderEngineId);
  if (!existing) return Response.json({ error: "Order engine not found" }, { status: 404 });
  if (existing.orderDeletedAt) return Response.json({ error: "Order is in trash" }, { status: 409 });
  if (existing.orderCancelledAt) return Response.json({ error: "Order is cancelled" }, { status: 409 });

  const now = Date.now();
  const fields: Array<[string, unknown]> = [["status", status]];
  const statements = [];

  if (status === "in_progress" && (existing.status === "done" || existing.status === "checked")) {
    // Vrácení z „hotovo“ zpátky do práce — důvod nepovinný, ale zapíše se, kdo a kdy.
    fields.push(["reopened_at", now], ["reopened_by", user.email], ["reopen_reason", clean(payload.reason, 500)]);
  }
  if (status === "in_progress" && existing.status === "received") {
    fields.push(["taken_by", user.email], ["taken_by_name", user.fullName], ["taken_at", now]);
  }
  if (status === "done") {
    fields.push(["completed_by", user.email], ["completed_by_name", user.fullName], ["completed_at", now]);
  }
  if (status === "checked") {
    fields.push(["checked_by", user.email], ["checked_at", now]);
  }
  if (status === "handed_over") {
    fields.push(["handed_over_at", now]);
  }

  statements.push(d1.prepare(`UPDATE service_order_engines SET ${fields.map(([column]) => `${column} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...fields.map(([, value]) => value), now, orderEngineId));

  if (existing.status === "done" || existing.status === "checked") {
    // Změna po „hotovo“ se loguje — zakázka se fakturuje a chyba se musí dát dohledat.
    statements.push(d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'status_change_after_done', 'service_order_engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), user.email, orderEngineId, JSON.stringify({ from: existing.status, to: status, reason: payload.reason ?? "" }), now));
  }

  await d1.batch(statements);
  return Response.json({ id: orderEngineId });
}

async function logEditAfterDone(d1: D1, statements: Array<ReturnType<D1["prepare"]>>, orderEngineId: string, status: Status, user: { email: string }, action: string, details: unknown) {
  if (status !== "done" && status !== "checked") return;
  statements.push(d1.prepare(`
    INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, 'service_order_engine', ?, ?, ?)
  `).bind(crypto.randomUUID(), user.email, action, orderEngineId, JSON.stringify(details), Date.now()));
}

async function upsertLine(d1: D1, user: { email: string; fullName: string }, kind: "work" | "material", payload: Payload) {
  const action = payload.action ?? "create";
  const table = kind === "work" ? "service_order_works" : "service_order_materials";

  if (action === "delete") {
    const id = clean(payload.id, 80);
    if (!id) return Response.json({ error: "Line id is required" }, { status: 400 });
    const row = await d1.prepare(`SELECT order_engine_id AS orderEngineId FROM ${table} WHERE id = ?`).bind(id).first<{ orderEngineId: string }>();
    if (!row) return Response.json({ error: "Line not found" }, { status: 404 });
    const engine = await loadOrderEngine(d1, row.orderEngineId);
    if (!engine) return Response.json({ error: "Order engine not found" }, { status: 404 });
    if (engine.orderDeletedAt) return Response.json({ error: "Order is in trash" }, { status: 409 });
    if (engine.orderCancelledAt) return Response.json({ error: "Order is cancelled" }, { status: 409 });
    if (isLocked(engine)) return Response.json({ error: "Order is locked after invoicing" }, { status: 409 });
    const statements = [d1.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id)];
    await logEditAfterDone(d1, statements, row.orderEngineId, engine.status, user, `delete_${kind}`, { id });
    await d1.batch(statements);
    return Response.json({ id });
  }

  const orderEngineId = clean(action === "create" ? payload.orderEngineId : undefined, 80) || undefined;
  const existingId = action === "update" ? clean(payload.id, 80) : "";
  if (action === "update" && !existingId) return Response.json({ error: "Line id is required" }, { status: 400 });

  const targetOrderEngineId = action === "create" ? orderEngineId : (
    await d1.prepare(`SELECT order_engine_id AS orderEngineId FROM ${table} WHERE id = ?`).bind(existingId).first<{ orderEngineId: string }>()
  )?.orderEngineId;
  if (!targetOrderEngineId) return Response.json({ error: "Order engine id is required" }, { status: 400 });

  const engine = await loadOrderEngine(d1, targetOrderEngineId);
  if (!engine) return Response.json({ error: "Order engine not found" }, { status: 404 });
  if (engine.orderDeletedAt) return Response.json({ error: "Order is in trash" }, { status: 409 });
  if (engine.orderCancelledAt) return Response.json({ error: "Order is cancelled" }, { status: 409 });
  if (isLocked(engine)) return Response.json({ error: "Order is locked after invoicing" }, { status: 409 });

  const orderRow = await d1.prepare("SELECT discount_work_percent AS discountWorkPercent, discount_material_percent AS discountMaterialPercent FROM service_orders WHERE id = ?")
    .bind(engine.orderId).first<{ discountWorkPercent: number; discountMaterialPercent: number }>();
  const defaultDiscount = kind === "work" ? (orderRow?.discountWorkPercent ?? 0) : (orderRow?.discountMaterialPercent ?? 0);

  const qty = quantity(payload.quantity);
  const discountPercent = payload.discountPercent !== undefined ? percent(payload.discountPercent) : defaultDiscount;
  const now = Date.now();
  const statements = [];
  let resultId = existingId;

  if (kind === "work") {
    let codeSnapshot = clean(payload.code, 40);
    let nameCsSnapshot = clean(payload.nameCsSnapshot, 160);
    let nameEnSnapshot = clean(payload.nameEnSnapshot, 160) || nameCsSnapshot;
    let unitPriceCzkCents = cents(payload.unitPriceCzkCents);
    let unitPriceEurCents = cents(payload.unitPriceEurCents);

    if (payload.priceItemId) {
      const priceItem = await d1.prepare(`
        SELECT code, name_cs AS nameCs, name_en AS nameEn, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents
        FROM service_price_items WHERE id = ? AND archived_at IS NULL
      `).bind(clean(payload.priceItemId, 80)).first<{ code: string; nameCs: string; nameEn: string; priceCzkCents: number; priceEurCents: number }>();
      if (!priceItem) return Response.json({ error: "Unknown or inactive price item" }, { status: 400 });
      codeSnapshot = priceItem.code;
      nameCsSnapshot = priceItem.nameCs;
      nameEnSnapshot = priceItem.nameEn;
      unitPriceCzkCents = priceItem.priceCzkCents;
      unitPriceEurCents = priceItem.priceEurCents;
    }
    if (!nameCsSnapshot) return Response.json({ error: "Work name is required" }, { status: 400 });

    const totalCzkCents = lineTotal(unitPriceCzkCents, qty, discountPercent);
    const totalEurCents = lineTotal(unitPriceEurCents, qty, discountPercent);

    if (action === "create") {
      resultId = crypto.randomUUID();
      statements.push(d1.prepare(`
        INSERT INTO service_order_works (id, order_engine_id, price_item_id, code_snapshot, name_cs_snapshot, name_en_snapshot, quantity, unit_price_czk_cents, unit_price_eur_cents, discount_percent, total_czk_cents, total_eur_cents, created_by, created_by_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(resultId, targetOrderEngineId, payload.priceItemId ? clean(payload.priceItemId, 80) : null, codeSnapshot, nameCsSnapshot, nameEnSnapshot, qty, unitPriceCzkCents, unitPriceEurCents, discountPercent, totalCzkCents, totalEurCents, user.email, user.fullName, now, now));
    } else {
      statements.push(d1.prepare(`
        UPDATE service_order_works SET code_snapshot = ?, name_cs_snapshot = ?, name_en_snapshot = ?, quantity = ?, unit_price_czk_cents = ?, unit_price_eur_cents = ?, discount_percent = ?, total_czk_cents = ?, total_eur_cents = ?, updated_at = ?
        WHERE id = ?
      `).bind(codeSnapshot, nameCsSnapshot, nameEnSnapshot, qty, unitPriceCzkCents, unitPriceEurCents, discountPercent, totalCzkCents, totalEurCents, now, existingId));
    }
    await logEditAfterDone(d1, statements, targetOrderEngineId, engine.status, user, action === "create" ? "add_work" : "update_work", { id: resultId, nameCsSnapshot, totalCzkCents, totalEurCents });
  } else {
    let code = clean(payload.code, 60);
    let name = clean(payload.name, 200);
    let unitPriceCzkCents = cents(payload.unitPriceCzkCents);
    let unitPriceEurCents = cents(payload.unitPriceEurCents);
    const source = payload.source === "customer" ? "customer" : "stock";

    if (payload.inventoryPartId) {
      const part = await d1.prepare("SELECT code, name, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents FROM inventory_parts WHERE id = ? AND archived_at IS NULL")
        .bind(clean(payload.inventoryPartId, 80)).first<{ code: string; name: string; priceCzkCents: number; priceEurCents: number }>();
      if (!part) return Response.json({ error: "Unknown or inactive inventory part" }, { status: 400 });
      code = part.code;
      name = part.name;
      unitPriceCzkCents = part.priceCzkCents;
      unitPriceEurCents = part.priceEurCents;
    }
    if (!name) return Response.json({ error: "Material name is required" }, { status: 400 });
    // Zákazníkův vlastní díl se účtuje nulou, ale v seznamu zůstává, ať je doložené, co se použilo.
    if (source === "customer") { unitPriceCzkCents = 0; unitPriceEurCents = 0; }

    const totalCzkCents = lineTotal(unitPriceCzkCents, qty, discountPercent);
    const totalEurCents = lineTotal(unitPriceEurCents, qty, discountPercent);

    if (action === "create") {
      resultId = crypto.randomUUID();
      statements.push(d1.prepare(`
        INSERT INTO service_order_materials (id, order_engine_id, inventory_part_id, code, name, quantity, unit_price_czk_cents, unit_price_eur_cents, discount_percent, total_czk_cents, total_eur_cents, source, created_by, created_by_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(resultId, targetOrderEngineId, payload.inventoryPartId ? clean(payload.inventoryPartId, 80) : null, code, name, qty, unitPriceCzkCents, unitPriceEurCents, discountPercent, totalCzkCents, totalEurCents, source, user.email, user.fullName, now, now));
    } else {
      statements.push(d1.prepare(`
        UPDATE service_order_materials SET code = ?, name = ?, quantity = ?, unit_price_czk_cents = ?, unit_price_eur_cents = ?, discount_percent = ?, total_czk_cents = ?, total_eur_cents = ?, source = ?, updated_at = ?
        WHERE id = ?
      `).bind(code, name, qty, unitPriceCzkCents, unitPriceEurCents, discountPercent, totalCzkCents, totalEurCents, source, now, existingId));
    }
    await logEditAfterDone(d1, statements, targetOrderEngineId, engine.status, user, action === "create" ? "add_material" : "update_material", { id: resultId, name, totalCzkCents, totalEurCents });
  }

  await d1.batch(statements);
  return Response.json({ id: resultId }, { status: action === "create" ? 201 : 200 });
}

async function upsertWaitingPart(d1: D1, user: { email: string }, payload: Payload) {
  const action = payload.action ?? "create";

  if (action === "delete") {
    const id = clean(payload.id, 80);
    if (!id) return Response.json({ error: "Waiting part id is required" }, { status: 400 });
    await d1.prepare("DELETE FROM service_order_waiting_parts WHERE id = ?").bind(id).run();
    return Response.json({ id });
  }

  if (action === "arrived") {
    const id = clean(payload.id, 80);
    if (!id) return Response.json({ error: "Waiting part id is required" }, { status: 400 });
    const row = await d1.prepare("SELECT order_engine_id AS orderEngineId FROM service_order_waiting_parts WHERE id = ?").bind(id).first<{ orderEngineId: string }>();
    if (!row) return Response.json({ error: "Waiting part not found" }, { status: 404 });
    const now = Date.now();
    const statements = [d1.prepare("UPDATE service_order_waiting_parts SET arrived_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id)];
    // Po dorazení dílu se motor jedním kliknutím vrátí do práce, pokud na něj čekal.
    const engine = await loadOrderEngine(d1, row.orderEngineId);
    if (engine?.orderDeletedAt) return Response.json({ error: "Order is in trash" }, { status: 409 });
    if (engine && engine.status === "waiting_part") {
      statements.push(d1.prepare("UPDATE service_order_engines SET status = 'in_progress', updated_at = ? WHERE id = ?").bind(now, row.orderEngineId));
    }
    await d1.batch(statements);
    return Response.json({ id });
  }

  const orderEngineId = clean(payload.orderEngineId, 80);
  if (action === "create" && !orderEngineId) return Response.json({ error: "Order engine id is required" }, { status: 400 });
  const name = clean(payload.name, 200);
  if (action === "create" && !name) return Response.json({ error: "Part name is required" }, { status: 400 });

  const now = Date.now();
  if (action === "create") {
    const engine = await loadOrderEngine(d1, orderEngineId);
    if (!engine) return Response.json({ error: "Order engine not found" }, { status: 404 });
    if (engine.orderDeletedAt) return Response.json({ error: "Order is in trash" }, { status: 409 });
    const id = crypto.randomUUID();
    await d1.prepare(`
      INSERT INTO service_order_waiting_parts (id, order_engine_id, code, name, price_czk_cents, price_eur_cents, expected_date, is_ordered, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, orderEngineId, clean(payload.code, 60), name, cents(payload.priceCzkCents), cents(payload.priceEurCents), clean(payload.expectedDate, 10), payload.isOrdered ? 1 : 0, user.email, now, now).run();
    return Response.json({ id }, { status: 201 });
  }

  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Waiting part id is required" }, { status: 400 });
  await d1.prepare(`
    UPDATE service_order_waiting_parts SET code = ?, name = ?, price_czk_cents = ?, price_eur_cents = ?, expected_date = ?, is_ordered = ?, updated_at = ? WHERE id = ?
  `).bind(clean(payload.code, 60), name, cents(payload.priceCzkCents), cents(payload.priceEurCents), clean(payload.expectedDate, 10), payload.isOrdered ? 1 : 0, now, id).run();
  return Response.json({ id });
}

async function invoiceOrder(d1: D1, payload: Payload) {
  const id = clean(payload.orderId ?? payload.id, 80);
  if (!id) return Response.json({ error: "Order id is required" }, { status: 400 });
  const now = Date.now();
  const result = await d1.prepare("UPDATE service_orders SET invoiced_at = ?, updated_at = ? WHERE id = ? AND invoiced_at IS NULL AND cancelled_at IS NULL AND deleted_at IS NULL").bind(now, now, id).run();
  if (!result.meta.changes) return Response.json({ error: "Order not found, already invoiced, cancelled or in trash" }, { status: 409 });
  return Response.json({ id });
}

async function unlockOrder(d1: D1, user: { email: string; role: string }, payload: Payload) {
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = clean(payload.orderId ?? payload.id, 80);
  if (!id) return Response.json({ error: "Order id is required" }, { status: 400 });
  const now = Date.now();
  await d1.prepare("UPDATE service_orders SET unlocked_at = ?, unlocked_by = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL").bind(now, user.email, now, id).run();
  return Response.json({ id });
}

// ——— DELETE (storno celé zakázky) ———

export async function DELETE(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Order id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  await purgeExpiredTrash(d1);
  const now = Date.now();
  // Storno (tohle DELETE), ne totez jako kos - zakazka i motory na ni zustavaji dohledatelne
  // a viditelne v beznem seznamu. Kos (kind: "trash" v PUT) je samostatny, ostrejsi krok.
  const result = await d1.prepare("UPDATE service_orders SET cancelled_at = ?, cancelled_by = ?, cancelled_reason = ?, updated_at = ? WHERE id = ? AND cancelled_at IS NULL AND deleted_at IS NULL")
    .bind(now, auth.user.email, clean(payload.reason, 500), now, id).run();
  if (!result.meta.changes) return Response.json({ error: "Order not found, already cancelled or in trash" }, { status: 409 });

  await d1.prepare(`
    INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, 'cancel', 'service_order', ?, ?, ?)
  `).bind(crypto.randomUUID(), auth.user.email, id, JSON.stringify({ reason: payload.reason ?? "" }), now).run();
  return Response.json({ id });
}
