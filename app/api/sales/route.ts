import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser, type AppUser } from "../../server-auth";

type ItemType = "engine" | "carburetor" | "part" | "service" | "other";
type SaleItemPayload = { itemType?: ItemType; resourceId?: string | null; code?: string; description?: string; descriptionEn?: string; quantity?: number; unitPriceCents?: number };
type NewCustomerPayload = { name?: string; phone?: string; email?: string; address?: string; companyId?: string; vatId?: string };
type SalePayload = {
  id?: string;
  raceId?: string | null;
  saleDate?: string;
  customerId?: string | null;
  teamId?: string | null;
  customerName?: string;
  newCustomer?: NewCustomerPayload | null;
  documentNumber?: string;
  currency?: "CZK" | "EUR";
  paymentMethod?: "cash" | "card" | "bank_transfer" | "invoice" | "other";
  isPaid?: boolean;
  isDelivered?: boolean;
  notes?: string;
  items?: SaleItemPayload[];
};
type NormalizedItem = { itemType: ItemType; resourceId: string | null; code: string; description: string; descriptionEn: string; quantity: number; unitPriceCents: number; lineTotalCents: number };
type ExistingItem = { itemType: string; lineKind: string; resourceId: string; quantity: number };

function clean(value: unknown, max = 300) { return String(value ?? "").trim().slice(0, max); }

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const raceId = clean(new URL(request.url).searchParams.get("raceId"), 80);
  const saleWhere = raceId ? "WHERE s.race_id = ?" : "";
  const salesStatement = d1.prepare(`
    SELECT s.id, s.race_id AS raceId, s.customer_id AS customerId, s.team_id AS teamId,
           s.sale_number AS saleNumber, s.sale_date AS saleDate, s.customer_name AS customerName,
           s.document_number AS documentNumber, s.currency, s.total_cents AS totalCents,
           s.payment_method AS paymentMethod, s.is_paid AS isPaid, s.is_delivered AS isDelivered,
           s.notes, s.voided_at AS voidedAt, s.voided_by AS voidedBy,
           s.created_by AS createdBy, s.created_at AS createdAt, s.updated_at AS updatedAt,
           r.name AS raceName, r.track AS raceTrack
    FROM sales s LEFT JOIN races r ON r.id = s.race_id
    ${saleWhere} ORDER BY s.sale_date DESC, s.created_at DESC
  `);
  const [sales, items, soldEngines, soldCarburetors] = await Promise.all([
    (raceId ? salesStatement.bind(raceId) : salesStatement).all(),
    d1.prepare(`
      SELECT id, sale_id AS saleId, CASE WHEN line_kind = 'service' THEN 'service' ELSE item_type END AS itemType,
             resource_id AS resourceId, code_snapshot AS code, description,
             description_en_snapshot AS descriptionEn, quantity,
             unit_price_cents AS unitPriceCents, line_total_cents AS lineTotalCents
      FROM sale_items ORDER BY rowid
    `).all(),
    d1.prepare(`
      SELECT e.id, e.code, e.category, e.family, e.current_configuration AS currentConfiguration,
             e.kz_generation AS kzGeneration, e.total_minutes AS totalMinutes,
             s.id AS saleId, s.sale_number AS saleNumber, s.sale_date AS saleDate,
             s.customer_name AS customerName, s.currency, si.unit_price_cents AS unitPriceCents
      FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN engines e ON e.id = si.resource_id
      WHERE si.item_type = 'engine' AND s.voided_at IS NULL
      ORDER BY s.sale_date DESC, e.code
    `).all(),
    d1.prepare(`
      SELECT c.id, c.code, c.category, c.family, c.brand, c.model,
             s.id AS saleId, s.sale_number AS saleNumber, s.sale_date AS saleDate,
             s.customer_name AS customerName, s.currency, si.unit_price_cents AS unitPriceCents
      FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN carburetors c ON c.id = si.resource_id
      WHERE si.item_type = 'carburetor' AND s.voided_at IS NULL
      ORDER BY s.sale_date DESC, c.code
    `).all(),
  ]);
  const itemRows = items.results as Array<Record<string, unknown> & { saleId: string }>;
  return Response.json({
    sales: (sales.results as Array<Record<string, unknown> & { id: string }>).map((sale) => ({
      ...sale, isPaid: Boolean(sale.isPaid), isDelivered: Boolean(sale.isDelivered),
      items: itemRows.filter((item) => item.saleId === sale.id),
    })),
    soldEngines: soldEngines.results,
    soldCarburetors: soldCarburetors.results,
  });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request); if (payload instanceof Response) return payload;
  await ensureRuntimeSchema(); return saveSale(payload, user, false);
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request); if (payload instanceof Response) return payload;
  if (!payload.id) return Response.json({ error: "Sale id is required" }, { status: 400 });
  await ensureRuntimeSchema(); return saveSale(payload, user, true);
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request); if (payload instanceof Response) return payload;
  if (!payload.id) return Response.json({ error: "Sale id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const sale = await d1.prepare("SELECT * FROM sales WHERE id = ? AND voided_at IS NULL").bind(payload.id).first<Record<string, unknown>>();
  if (!sale) return Response.json({ error: "Sale not found or already voided" }, { status: 404 });
  const linkedItems = await d1.prepare("SELECT item_type AS itemType, line_kind AS lineKind, resource_id AS resourceId, quantity FROM sale_items WHERE sale_id = ? AND resource_id IS NOT NULL").bind(payload.id).all<ExistingItem>();
  const now = Date.now();
  const restoreStatements = linkedItems.results.flatMap((item) => {
    if (item.itemType === "engine") return [d1.prepare("UPDATE engines SET sold_at = NULL, updated_at = ? WHERE id = ?").bind(now, item.resourceId)];
    if (item.itemType === "carburetor") return [d1.prepare("UPDATE carburetors SET sold_at = NULL, updated_at = ? WHERE id = ?").bind(now, item.resourceId)];
    if (item.itemType === "part") return [d1.prepare("UPDATE inventory_parts SET quantity = quantity + ?, updated_at = ? WHERE id = ?").bind(item.quantity, now, item.resourceId)];
    return [];
  });
  await d1.batch([
    d1.prepare("UPDATE sales SET voided_at = ?, voided_by = ?, updated_at = ? WHERE id = ? AND voided_at IS NULL").bind(now, user.email, now, payload.id),
    ...restoreStatements,
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'void', 'sale', ?, ?, ?)").bind(crypto.randomUUID(), user.email, payload.id, JSON.stringify(sale), now),
  ]);
  return Response.json({ id: payload.id });
}

async function saveSale(payload: SalePayload, user: AppUser, editing: boolean) {
  const saleDate = clean(payload.saleDate, 10); const raceId = clean(payload.raceId, 80) || null;
  const documentNumber = clean(payload.documentNumber, 80); const currency = payload.currency;
  const paymentMethod = payload.paymentMethod ?? "cash"; const isPaid = Boolean(payload.isPaid); const isDelivered = Boolean(payload.isDelivered);
  const notes = clean(payload.notes, 2000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return Response.json({ error: "Valid sale date is required" }, { status: 400 });
  if (!currency || !["CZK", "EUR"].includes(currency)) return Response.json({ error: "Currency must be CZK or EUR" }, { status: 400 });
  if (!["cash", "card", "bank_transfer", "invoice", "other"].includes(paymentMethod)) return Response.json({ error: "Invalid payment method" }, { status: 400 });
  if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > 100) return Response.json({ error: "Add at least one sale item" }, { status: 400 });

  const d1 = getD1();
  if (raceId && !(await d1.prepare("SELECT id FROM races WHERE id = ? AND status != 'archived'").bind(raceId).first())) return Response.json({ error: "Race not found" }, { status: 404 });
  const id = editing ? clean(payload.id, 80) : crypto.randomUUID();
  const existingSale = editing ? await d1.prepare("SELECT * FROM sales WHERE id = ? AND voided_at IS NULL").bind(id).first<Record<string, unknown>>() : null;
  if (editing && !existingSale) return Response.json({ error: "Sale not found" }, { status: 404 });
  const resolvedBuyer = await resolveBuyer(payload, user.email);
  if (resolvedBuyer instanceof Response) return resolvedBuyer;
  // Re-bound to a fresh const so its type stays narrowed (excluding Response) when
  // referenced from the buildStatements() closure below — TS doesn't carry control-flow
  // narrowing of an outer variable into a nested function, only its inferred type at declaration.
  const buyer = resolvedBuyer;

  const oldItems = editing
    ? await d1.prepare("SELECT item_type AS itemType, line_kind AS lineKind, resource_id AS resourceId, quantity FROM sale_items WHERE sale_id = ? AND resource_id IS NOT NULL").bind(id).all<ExistingItem>()
    : { results: [] as ExistingItem[] };
  const oldEquipmentKeys = new Set(oldItems.results.filter((item) => item.itemType === "engine" || item.itemType === "carburetor").map((item) => `${item.itemType}:${item.resourceId}`));
  const oldPartQuantities = new Map<string, number>();
  for (const item of oldItems.results.filter((entry) => entry.itemType === "part")) oldPartQuantities.set(item.resourceId, (oldPartQuantities.get(item.resourceId) ?? 0) + item.quantity);
  const requestedPartQuantities = new Map<string, number>();
  const normalizedItems: NormalizedItem[] = []; const newResourceKeys = new Set<string>();

  for (const rawItem of payload.items) {
    const itemType = rawItem.itemType;
    if (!itemType || !["engine", "carburetor", "part", "service", "other"].includes(itemType)) return Response.json({ error: "Invalid sale item type" }, { status: 400 });
    const quantity = Number(rawItem.quantity); let unitPriceCents = Number(rawItem.unitPriceCents);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return Response.json({ error: "Quantity must be a whole positive number" }, { status: 400 });
    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0 || unitPriceCents > 1_000_000_000) return Response.json({ error: "Invalid item price" }, { status: 400 });
    let resourceId = clean(rawItem.resourceId, 80) || null; let code = clean(rawItem.code, 80); let description = clean(rawItem.description, 1000); let descriptionEn = clean(rawItem.descriptionEn, 1000);

    if (itemType === "engine" || itemType === "carburetor") {
      if (!resourceId) return Response.json({ error: "Select a specific engine or carburetor" }, { status: 400 });
      if (quantity !== 1) return Response.json({ error: "Specific engines and carburetors must have quantity 1" }, { status: 400 });
      const key = `${itemType}:${resourceId}`;
      if (newResourceKeys.has(key)) return Response.json({ error: "The same equipment cannot be sold twice" }, { status: 409 });
      newResourceKeys.add(key);
      const table = itemType === "engine" ? "engines" : "carburetors";
      const resource = await d1.prepare(`SELECT id, code, sold_at AS soldAt FROM ${table} WHERE id = ? AND archived_at IS NULL`).bind(resourceId).first<{ id: string; code: string; soldAt: number | null }>();
      if (!resource) return Response.json({ error: itemType === "engine" ? "Engine not found" : "Carburetor not found" }, { status: 404 });
      if (resource.soldAt && !oldEquipmentKeys.has(key)) return Response.json({ error: `${resource.code} has already been sold` }, { status: 409 });
      const conflict = await findFutureAssignment(itemType, resource.id, saleDate);
      if (conflict) return Response.json({ error: `${resource.code} is assigned to ${conflict}` }, { status: 409 });
      code = resource.code; description ||= itemType === "engine" ? `Motor ${resource.code}` : `Karburátor ${resource.code}`; descriptionEn ||= itemType === "engine" ? `Engine ${resource.code}` : `Carburetor ${resource.code}`;
    } else if (itemType === "part") {
      if (!resourceId) {
        if (!editing || !description) return Response.json({ error: "Select a stock part" }, { status: 400 });
      } else {
        const part = await d1.prepare("SELECT id, code, name, quantity FROM inventory_parts WHERE id = ? AND archived_at IS NULL").bind(resourceId).first<{ id: string; code: string; name: string; quantity: number }>();
        if (!part) return Response.json({ error: "Stock part not found" }, { status: 404 });
        const requested = (requestedPartQuantities.get(resourceId) ?? 0) + quantity;
        const available = part.quantity + (oldPartQuantities.get(resourceId) ?? 0);
        if (requested > available) return Response.json({ error: `Not enough stock for ${part.code}; available ${available}` }, { status: 409 });
        requestedPartQuantities.set(resourceId, requested); code = part.code; description = part.name; descriptionEn = part.name;
      }
    } else if (itemType === "service") {
      if (!resourceId) {
        if (!editing || !description) return Response.json({ error: "Select a service" }, { status: 400 });
      } else {
        const service = await d1.prepare("SELECT id, name, description_cs AS descriptionCs, description_en AS descriptionEn, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents FROM service_catalog WHERE id = ? AND archived_at IS NULL").bind(resourceId).first<{ id: string; name: string; descriptionCs: string; descriptionEn: string; priceCzkCents: number; priceEurCents: number }>();
        if (!service) return Response.json({ error: "Service not found" }, { status: 404 });
        code = service.name; description = service.descriptionCs || service.name; descriptionEn = service.descriptionEn || service.descriptionCs || service.name; unitPriceCents = currency === "CZK" ? service.priceCzkCents : service.priceEurCents;
      }
    } else {
      resourceId = null; if (!description) return Response.json({ error: "Part description is required" }, { status: 400 });
    }
    descriptionEn ||= description;
    normalizedItems.push({ itemType, resourceId, code, description, descriptionEn, quantity, unitPriceCents, lineTotalCents: quantity * unitPriceCents });
  }

  const totalCents = normalizedItems.reduce((sum, item) => sum + item.lineTotalCents, 0); const now = Date.now();
  let saleNumber = editing ? String(existingSale?.sale_number ?? "") : await nextSaleNumber(saleDate);

  function buildStatements() {
    const statements = [];
    if (buyer.newCustomer) statements.push(d1.prepare("INSERT INTO customers (id, name, phone, email, address, company_id, vat_id, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)").bind(buyer.newCustomer!.id, buyer.newCustomer!.name, buyer.newCustomer!.phone, buyer.newCustomer!.email, buyer.newCustomer!.address, buyer.newCustomer!.companyId, buyer.newCustomer!.vatId, user.email, now, now));
    if (editing) {
      statements.push(d1.prepare("UPDATE sales SET race_id = ?, customer_id = ?, team_id = ?, sale_date = ?, customer_name = ?, document_number = ?, currency = ?, total_cents = ?, payment_method = ?, is_paid = ?, is_delivered = ?, notes = ?, updated_at = ? WHERE id = ? AND voided_at IS NULL").bind(raceId, buyer.customerId, buyer.teamId, saleDate, buyer.name, documentNumber, currency, totalCents, paymentMethod, isPaid ? 1 : 0, isDelivered ? 1 : 0, notes, now, id));
      statements.push(d1.prepare("DELETE FROM sale_items WHERE sale_id = ?").bind(id));
      for (const item of oldItems.results) {
        if (item.itemType === "engine") statements.push(d1.prepare("UPDATE engines SET sold_at = NULL, updated_at = ? WHERE id = ?").bind(now, item.resourceId));
        else if (item.itemType === "carburetor") statements.push(d1.prepare("UPDATE carburetors SET sold_at = NULL, updated_at = ? WHERE id = ?").bind(now, item.resourceId));
        else if (item.itemType === "part") statements.push(d1.prepare("UPDATE inventory_parts SET quantity = quantity + ?, updated_at = ? WHERE id = ?").bind(item.quantity, now, item.resourceId));
      }
    } else {
      statements.push(d1.prepare("INSERT INTO sales (id, race_id, customer_id, team_id, sale_number, sale_date, customer_name, document_number, currency, total_cents, payment_method, is_paid, is_delivered, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, raceId, buyer.customerId, buyer.teamId, saleNumber, saleDate, buyer.name, documentNumber, currency, totalCents, paymentMethod, isPaid ? 1 : 0, isDelivered ? 1 : 0, notes, user.email, now, now));
    }
    for (const item of normalizedItems) {
      statements.push(d1.prepare("INSERT INTO sale_items (id, sale_id, item_type, line_kind, resource_id, code_snapshot, description, description_en_snapshot, quantity, unit_price_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), id, item.itemType === "service" ? "other" : item.itemType, item.itemType === "service" ? "service" : "", item.resourceId, item.code, item.description, item.descriptionEn, item.quantity, item.unitPriceCents, item.lineTotalCents));
      if (item.itemType === "engine") statements.push(d1.prepare("UPDATE engines SET sold_at = ?, updated_at = ? WHERE id = ?").bind(now, now, item.resourceId));
      else if (item.itemType === "carburetor") statements.push(d1.prepare("UPDATE carburetors SET sold_at = ?, updated_at = ? WHERE id = ?").bind(now, now, item.resourceId));
      else if (item.itemType === "part") statements.push(d1.prepare("UPDATE inventory_parts SET quantity = quantity - ?, updated_at = ? WHERE id = ?").bind(item.quantity, now, item.resourceId));
    }
    statements.push(d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, 'sale', ?, ?, ?)").bind(crypto.randomUUID(), user.email, editing ? "update" : "create", id, JSON.stringify({ saleNumber, saleDate, customerName: buyer.name, currency, totalCents }), now));
    return statements;
  }

  // Sale numbers are assigned from a COUNT(*)-based sequence, so two concurrent
  // creates in the same year can compute the same number; retry with a freshly
  // generated one on that specific collision instead of surfacing it to the user.
  const maxAttempts = editing ? 1 : 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await d1.batch(buildStatements());
      return Response.json({ id, saleNumber, customerId: buyer.customerId }, { status: editing ? 200 : 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Database error";
      const isSaleNumberCollision = !editing && message.toLowerCase().includes("unique") && message.toLowerCase().includes("sale_number");
      if (isSaleNumberCollision && attempt < maxAttempts) { saleNumber = await nextSaleNumber(saleDate); continue; }
      if (message.toLowerCase().includes("unique")) return Response.json({ error: "Sale or customer collision; please save again" }, { status: 409 });
      return Response.json({ error: "Could not save sale" }, { status: 500 });
    }
  }
  return Response.json({ error: "Could not save sale" }, { status: 500 });
}

async function resolveBuyer(payload: SalePayload, actorEmail: string) {
  const d1 = getD1(); const customerId = clean(payload.customerId, 80); const teamId = clean(payload.teamId, 80);
  if (customerId && teamId) return Response.json({ error: "Select a customer or a team, not both" }, { status: 400 });
  if (teamId) {
    const team = await d1.prepare("SELECT id, name FROM teams WHERE id = ? AND archived_at IS NULL").bind(teamId).first<{ id: string; name: string }>();
    return team ? { customerId: null, teamId: team.id, name: team.name, newCustomer: null } : Response.json({ error: "Team not found" }, { status: 404 });
  }
  if (customerId) {
    const customer = await d1.prepare("SELECT id, name FROM customers WHERE id = ? AND archived_at IS NULL").bind(customerId).first<{ id: string; name: string }>();
    return customer ? { customerId: customer.id, teamId: null, name: customer.name, newCustomer: null } : Response.json({ error: "Customer not found" }, { status: 404 });
  }
  const raw = payload.newCustomer ?? { name: payload.customerName };
  const name = clean(raw?.name ?? payload.customerName, 160); const email = clean(raw?.email, 160).toLowerCase();
  if (!name) return Response.json({ error: "Customer is required" }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Invalid customer email" }, { status: 400 });
  const existing = email
    ? await d1.prepare("SELECT id, name FROM customers WHERE LOWER(email) = ? AND archived_at IS NULL").bind(email).first<{ id: string; name: string }>()
    : await d1.prepare("SELECT id, name FROM customers WHERE LOWER(name) = LOWER(?) AND archived_at IS NULL LIMIT 1").bind(name).first<{ id: string; name: string }>();
  if (existing) return { customerId: existing.id, teamId: null, name: existing.name, newCustomer: null };
  const newCustomer = { id: crypto.randomUUID(), name, phone: clean(raw?.phone, 60), email, address: clean(raw?.address, 500), companyId: clean(raw?.companyId, 40), vatId: clean(raw?.vatId, 40), actorEmail };
  return { customerId: newCustomer.id, teamId: null, name, newCustomer };
}

async function findFutureAssignment(type: "engine" | "carburetor", resourceId: string, saleDate: string) {
  const prefix = type === "engine" ? "engine" : "carburetor"; const d1 = getD1();
  const entry = await d1.prepare(`SELECT r.name FROM race_entries e JOIN races r ON r.id = e.race_id WHERE (e.${prefix}_1_id = ? OR e.${prefix}_2_id = ? OR e.${prefix}_3_id = ?) AND r.status IN ('planned', 'active') AND r.return_date >= ? LIMIT 1`).bind(resourceId, resourceId, resourceId, saleDate).first<{ name: string }>();
  if (entry) return entry.name;
  const extra = await d1.prepare("SELECT r.name FROM race_extras x JOIN races r ON r.id = x.race_id WHERE x.resource_type = ? AND x.resource_id = ? AND r.status IN ('planned', 'active') AND r.return_date >= ? LIMIT 1").bind(type, resourceId, saleDate).first<{ name: string }>();
  return extra?.name ?? "";
}

async function nextSaleNumber(saleDate: string) {
  const year = saleDate.slice(0, 4); const result = await getD1().prepare("SELECT COUNT(*) AS count FROM sales WHERE sale_number LIKE ?").bind(`PRO-${year}-%`).first<{ count: number }>();
  return `PRO-${year}-${String((result?.count ?? 0) + 1).padStart(4, "0")}`;
}

async function readPayload(request: Request): Promise<SalePayload | Response> {
  try { return await request.json() as SalePayload; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
}
