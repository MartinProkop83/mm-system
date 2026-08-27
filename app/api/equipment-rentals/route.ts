import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { applyRentalReturns, calculateRentalTotals, canManageRentals, effectiveRentalStatus, isIsoDate, type RentalStatus } from "../../rental-domain";
import { getAppUser, type AppUser } from "../../server-auth";

type Currency = "CZK" | "EUR";
type RentalItemType = "engine" | "carburetor" | "equipment";
type ShipmentDirection = "outbound" | "return";
type RentalItemPayload = {
  id?: string; itemType?: RentalItemType; resourceId?: string | null; description?: string;
  quantity?: number; dailyPriceCents?: number; billableDays?: number | null; driverId?: string | null; returnedDate?: string | null;
};
type ShipmentPayload = {
  id?: string; direction?: ShipmentDirection; transportMode?: "carrier" | "self"; carrier?: string;
  trackingUrl?: string; costCents?: number; currency?: Currency; status?: "planned" | "in_transit" | "delivered";
};
type RentalPayload = {
  id?: string; customerId?: string | null; teamId?: string | null; createdDate?: string; handoverDate?: string;
  plannedReturnDate?: string; actualReturnDate?: string | null; currency?: Currency;
  paymentMethod?: "cash" | "card" | "bank_transfer" | "invoice" | "other"; isPaid?: boolean;
  depositCents?: number; status?: RentalStatus; notes?: string; items?: RentalItemPayload[]; shipments?: ShipmentPayload[];
};
type NormalizedItem = {
  id: string; itemType: RentalItemType; resourceId: string | null; code: string; description: string;
  quantity: number; dailyPriceCents: number; billableDays: number | null; driverId: string | null;
  driverName: string; returnedDate: string | null;
};
type NormalizedShipment = {
  id: string; direction: ShipmentDirection; transportMode: "carrier" | "self"; carrier: string;
  trackingUrl: string; costCents: number; currency: Currency; status: "planned" | "in_transit" | "delivered";
};

const rentalStatuses = new Set<RentalStatus>(["preparing", "sent", "active", "overdue", "returned", "cancelled"]);
const paymentMethods = new Set(["cash", "card", "bank_transfer", "invoice", "other"]);
const itemTypes = new Set<RentalItemType>(["engine", "carburetor", "equipment"]);
const shipmentDirections = new Set<ShipmentDirection>(["outbound", "return"]);
const shipmentStatuses = new Set(["planned", "in_transit", "delivered"]);
const clean = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const todayIso = () => new Date().toISOString().slice(0, 10);

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const search = new URL(request.url).searchParams;
  const itemType = clean(search.get("itemType"), 20);
  const resourceId = clean(search.get("resourceId"), 80);
  const customerId = clean(search.get("customerId"), 80);
  const teamId = clean(search.get("teamId"), 80);
  const where: string[] = [];
  const bindings: string[] = [];
  if (itemType && resourceId) { where.push("EXISTS (SELECT 1 FROM equipment_rental_items filter_item WHERE filter_item.rental_id = r.id AND filter_item.item_type = ? AND filter_item.resource_id = ?)"); bindings.push(itemType, resourceId); }
  if (customerId) { where.push("r.customer_id = ?"); bindings.push(customerId); }
  if (teamId) { where.push("r.team_id = ?"); bindings.push(teamId); }
  const rentalsStatement = d1.prepare(`
    SELECT r.id, r.rental_number AS rentalNumber, r.customer_id AS customerId, r.team_id AS teamId,
           r.customer_name_snapshot AS customerName, r.created_date AS createdDate,
           r.handover_date AS handoverDate, r.planned_return_date AS plannedReturnDate,
           r.actual_return_date AS actualReturnDate, r.currency, r.total_cents AS totalCents,
           r.payment_method AS paymentMethod, r.is_paid AS isPaid, r.deposit_cents AS depositCents,
           r.status, r.notes, COALESCE(creator.full_name, r.created_by) AS createdBy,
           COALESCE(updater.full_name, r.updated_by) AS updatedBy,
           r.created_at AS createdAt, r.updated_at AS updatedAt
    FROM equipment_rentals r
    LEFT JOIN app_users creator ON creator.email = r.created_by
    LEFT JOIN app_users updater ON updater.email = r.updated_by
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY r.handover_date DESC, r.created_at DESC
  `);
  const [rentals, items, shipments, customers, teams, drivers, engines, carburetors] = await Promise.all([
    (bindings.length ? rentalsStatement.bind(...bindings) : rentalsStatement).all<Record<string, unknown> & { id: string }>(),
    d1.prepare(`SELECT id, rental_id AS rentalId, item_type AS itemType, resource_id AS resourceId,
                       code_snapshot AS code, description, quantity, daily_price_cents AS dailyPriceCents,
                       billable_days AS billableDays, driver_id AS driverId, driver_name_snapshot AS driverName,
                       returned_date AS returnedDate FROM equipment_rental_items ORDER BY rowid`).all<Record<string, unknown> & { rentalId: string }>(),
    d1.prepare(`SELECT id, rental_id AS rentalId, direction, transport_mode AS transportMode, carrier,
                       tracking_url AS trackingUrl, cost_cents AS costCents, currency, status
                FROM equipment_rental_shipments ORDER BY direction`).all<Record<string, unknown> & { rentalId: string }>(),
    d1.prepare("SELECT id, name FROM customers WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE").all(),
    d1.prepare("SELECT id, name FROM teams WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE").all(),
    d1.prepare("SELECT id, name, team_id AS teamId FROM drivers WHERE archived_at IS NULL AND is_active = 1 ORDER BY name COLLATE NOCASE").all(),
    d1.prepare("SELECT id, code, family, category FROM engines WHERE archived_at IS NULL AND sold_at IS NULL ORDER BY code COLLATE NOCASE").all(),
    d1.prepare("SELECT id, code, family, category, brand, model FROM carburetors WHERE archived_at IS NULL AND sold_at IS NULL ORDER BY code COLLATE NOCASE").all(),
  ]);
  const itemRows = items.results as Array<Record<string, unknown> & { rentalId: string }>;
  const shipmentRows = shipments.results as Array<Record<string, unknown> & { rentalId: string }>;
  const currentDate = todayIso();
  return Response.json({
    canManage: canManageRentals(user.role),
    rentals: rentals.results.map((row) => {
      const rentalItems = itemRows.filter((item) => item.rentalId === row.id);
      const calculations = calculateRentalTotals(String(row.handoverDate), String(row.plannedReturnDate), row.actualReturnDate ? String(row.actualReturnDate) : null, rentalItems.map((item) => ({ dailyPriceCents: Number(item.dailyPriceCents), quantity: Number(item.quantity), returnedDate: item.returnedDate ? String(item.returnedDate) : null, billableDays: item.billableDays === null ? null : Number(item.billableDays) })));
      const effectiveStatus = effectiveRentalStatus(row.status as RentalStatus, String(row.plannedReturnDate), row.actualReturnDate ? String(row.actualReturnDate) : null, currentDate);
      return { ...row, isPaid: Boolean(row.isPaid), status: effectiveStatus, isOverdue: effectiveStatus === "overdue", ...calculations, items: rentalItems, shipments: shipmentRows.filter((shipment) => shipment.rentalId === row.id) };
    }),
    customers: customers.results, teams: teams.results, drivers: drivers.results, engines: engines.results, carburetors: carburetors.results,
  });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageRentals(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request); if (payload instanceof Response) return payload;
  await ensureRuntimeSchema();
  return saveRental(payload, user, false);
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageRentals(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request); if (payload instanceof Response) return payload;
  if (!clean(payload.id, 80)) return Response.json({ error: "Rental id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  return saveRental(payload, user, true);
}

export async function PATCH(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageRentals(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
  let payload: { id?: string; itemIds?: string[]; returnedDate?: string };
  try { payload = await request.json() as typeof payload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = clean(payload.id, 80); const returnedDate = clean(payload.returnedDate, 10);
  const itemIds = Array.isArray(payload.itemIds) ? [...new Set(payload.itemIds.map((value) => clean(value, 80)).filter(Boolean))] : [];
  if (!id || !isIsoDate(returnedDate) || itemIds.length === 0) return Response.json({ error: "Rental, returned items and date are required" }, { status: 400 });
  await ensureRuntimeSchema(); const d1 = getD1();
  const rental = await d1.prepare("SELECT handover_date AS handoverDate, planned_return_date AS plannedReturnDate, status FROM equipment_rentals WHERE id = ?").bind(id).first<{ handoverDate: string; plannedReturnDate: string; status: RentalStatus }>();
  if (!rental) return Response.json({ error: "Rental not found" }, { status: 404 });
  if (rental.status === "cancelled") return Response.json({ error: "Cancelled rental cannot be returned" }, { status: 409 });
  if (returnedDate < rental.handoverDate) return Response.json({ error: "Return date cannot be before handover" }, { status: 400 });
  const allItems = await d1.prepare("SELECT id, daily_price_cents AS dailyPriceCents, quantity, billable_days AS billableDays, returned_date AS returnedDate FROM equipment_rental_items WHERE rental_id = ?").bind(id).all<{ id: string; dailyPriceCents: number; quantity: number; billableDays: number | null; returnedDate: string | null }>();
  if (itemIds.some((itemId) => !allItems.results.some((item) => item.id === itemId))) return Response.json({ error: "Rental item not found" }, { status: 404 });
  const result = applyRentalReturns(rental.handoverDate, rental.plannedReturnDate, rental.status, allItems.results, itemIds, returnedDate);
  const now = Date.now();
  await d1.batch([
    ...itemIds.map((itemId) => d1.prepare("UPDATE equipment_rental_items SET returned_date = ? WHERE id = ? AND rental_id = ?").bind(returnedDate, itemId, id)),
    d1.prepare("UPDATE equipment_rentals SET actual_return_date = ?, status = ?, total_cents = ?, updated_by = ?, updated_at = ? WHERE id = ?").bind(result.actualReturnDate, result.status, result.totalCents, user.email, now, id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'return_items', 'equipment_rental', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify({ itemIds, returnedDate, allReturned: result.allReturned, totalCents: result.totalCents }), now),
  ]);
  return Response.json({ id, allReturned: result.allReturned, actualReturnDate: result.actualReturnDate, totalCents: result.totalCents });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Only superadmin can delete a rental" }, { status: 403 });
  let payload: { id?: string };
  try { payload = await request.json() as typeof payload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Rental id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const rental = await d1.prepare("SELECT * FROM equipment_rentals WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!rental) return Response.json({ error: "Rental not found" }, { status: 404 });
  const [items, shipments] = await Promise.all([
    d1.prepare("SELECT * FROM equipment_rental_items WHERE rental_id = ?").bind(id).all<Record<string, unknown>>(),
    d1.prepare("SELECT * FROM equipment_rental_shipments WHERE rental_id = ?").bind(id).all<Record<string, unknown>>(),
  ]);
  const now = Date.now();
  await d1.batch([
    d1.prepare("DELETE FROM equipment_rental_shipments WHERE rental_id = ?").bind(id),
    d1.prepare("DELETE FROM equipment_rental_items WHERE rental_id = ?").bind(id),
    d1.prepare("DELETE FROM equipment_rentals WHERE id = ?").bind(id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'delete', 'equipment_rental', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify({ rental, items: items.results, shipments: shipments.results }), now),
  ]);
  return Response.json({ id });
}

async function saveRental(payload: RentalPayload, user: AppUser, editing: boolean) {
  const d1 = getD1();
  const id = editing ? clean(payload.id, 80) : crypto.randomUUID();
  const customerId = clean(payload.customerId, 80) || null; const teamId = clean(payload.teamId, 80) || null;
  const createdDate = clean(payload.createdDate, 10); const handoverDate = clean(payload.handoverDate, 10); const plannedReturnDate = clean(payload.plannedReturnDate, 10);
  let actualReturnDate = clean(payload.actualReturnDate, 10) || null;
  const currency = payload.currency; const paymentMethod = payload.paymentMethod ?? "cash"; const isPaid = Boolean(payload.isPaid);
  const depositCents = Number(payload.depositCents ?? 0); let status = payload.status ?? "preparing"; const notes = clean(payload.notes, 3000);
  if ((customerId ? 1 : 0) + (teamId ? 1 : 0) !== 1) return Response.json({ error: "Select exactly one customer or team" }, { status: 400 });
  if (![createdDate, handoverDate, plannedReturnDate].every(isIsoDate)) return Response.json({ error: "Valid rental dates are required" }, { status: 400 });
  if (plannedReturnDate < handoverDate) return Response.json({ error: "Planned return cannot be before handover" }, { status: 400 });
  if (actualReturnDate && (!isIsoDate(actualReturnDate) || actualReturnDate < handoverDate)) return Response.json({ error: "Actual return cannot be before handover" }, { status: 400 });
  if (!currency || !["CZK", "EUR"].includes(currency)) return Response.json({ error: "Currency must be CZK or EUR" }, { status: 400 });
  if (!paymentMethods.has(paymentMethod)) return Response.json({ error: "Invalid payment method" }, { status: 400 });
  if (!rentalStatuses.has(status)) return Response.json({ error: "Invalid rental status" }, { status: 400 });
  if (!Number.isSafeInteger(depositCents) || depositCents < 0 || depositCents > 1_000_000_000) return Response.json({ error: "Invalid deposit" }, { status: 400 });
  if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > 100) return Response.json({ error: "Add at least one rental item" }, { status: 400 });
  const existing = editing ? await d1.prepare("SELECT rental_number AS rentalNumber FROM equipment_rentals WHERE id = ?").bind(id).first<{ rentalNumber: string }>() : null;
  if (editing && !existing) return Response.json({ error: "Rental not found" }, { status: 404 });
  const holder = customerId
    ? await d1.prepare("SELECT id, name FROM customers WHERE id = ? AND archived_at IS NULL").bind(customerId).first<{ id: string; name: string }>()
    : await d1.prepare("SELECT id, name FROM teams WHERE id = ? AND archived_at IS NULL").bind(teamId).first<{ id: string; name: string }>();
  if (!holder) return Response.json({ error: customerId ? "Customer not found" : "Team not found" }, { status: 404 });

  const normalizedItems: NormalizedItem[] = []; const resourceKeys = new Set<string>();
  for (const raw of payload.items) {
    const itemType = raw.itemType; const resourceId = clean(raw.resourceId, 80) || null; const quantity = Number(raw.quantity ?? 1); const dailyPriceCents = Number(raw.dailyPriceCents ?? 0);
    const billableDays = raw.billableDays === null || raw.billableDays === undefined ? null : Number(raw.billableDays);
    const driverId = clean(raw.driverId, 80) || null; const returnedDate = clean(raw.returnedDate, 10) || actualReturnDate;
    if (!itemType || !itemTypes.has(itemType)) return Response.json({ error: "Invalid rental item type" }, { status: 400 });
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) return Response.json({ error: "Rental quantity must be a whole positive number" }, { status: 400 });
    if (!Number.isSafeInteger(dailyPriceCents) || dailyPriceCents < 0 || dailyPriceCents > 1_000_000_000) return Response.json({ error: "Invalid daily rental price" }, { status: 400 });
    if (billableDays !== null && (!Number.isSafeInteger(billableDays) || billableDays < 0 || billableDays > 10_000)) return Response.json({ error: "Billable days must be a whole non-negative number" }, { status: 400 });
    if (returnedDate && (!isIsoDate(returnedDate) || returnedDate < handoverDate)) return Response.json({ error: "Item return cannot be before handover" }, { status: 400 });
    let driverName = "";
    if (driverId) {
      const driver = await d1.prepare("SELECT id, name FROM drivers WHERE id = ? AND archived_at IS NULL").bind(driverId).first<{ id: string; name: string }>();
      if (!driver) return Response.json({ error: "Driver not found" }, { status: 404 });
      driverName = driver.name;
    }
    let code = ""; let description = clean(raw.description, 500);
    if (itemType === "engine" || itemType === "carburetor") {
      if (!resourceId || quantity !== 1) return Response.json({ error: "Select one specific engine or carburetor" }, { status: 400 });
      const key = `${itemType}:${resourceId}`; if (resourceKeys.has(key)) return Response.json({ error: "The same equipment cannot be added twice" }, { status: 409 }); resourceKeys.add(key);
      const table = itemType === "engine" ? "engines" : "carburetors";
      const resource = await d1.prepare(`SELECT id, code, sold_at AS soldAt FROM ${table} WHERE id = ? AND archived_at IS NULL`).bind(resourceId).first<{ id: string; code: string; soldAt: number | null }>();
      if (!resource) return Response.json({ error: itemType === "engine" ? "Engine not found" : "Carburetor not found" }, { status: 404 });
      if (resource.soldAt) return Response.json({ error: `${resource.code} has already been sold` }, { status: 409 });
      if (status !== "cancelled") {
        const rentalConflict = await findRentalConflict(itemType, resourceId, handoverDate, returnedDate || actualReturnDate || plannedReturnDate, id);
        if (rentalConflict) return Response.json({ error: `${resource.code} conflicts with rental ${rentalConflict}` }, { status: 409 });
        const raceConflict = await findRaceConflict(itemType, resourceId, handoverDate, returnedDate || actualReturnDate || plannedReturnDate);
        if (raceConflict) return Response.json({ error: `${resource.code} is assigned to race ${raceConflict} during this rental` }, { status: 409 });
      }
      code = resource.code; description ||= itemType === "engine" ? `Motor ${resource.code}` : `Karburátor ${resource.code}`;
    } else {
      if (resourceId) return Response.json({ error: "Additional equipment does not support linked inventory yet" }, { status: 400 });
      if (!description) return Response.json({ error: "Equipment description is required" }, { status: 400 });
    }
    normalizedItems.push({ id: clean(raw.id, 80) || crypto.randomUUID(), itemType, resourceId, code, description, quantity, dailyPriceCents, billableDays, driverId, driverName, returnedDate: returnedDate || null });
  }
  const normalizedShipments = normalizeShipments(payload.shipments ?? [], currency);
  if (normalizedShipments instanceof Response) return normalizedShipments;
  const allReturned = normalizedItems.every((item) => Boolean(item.returnedDate));
  if (status === "returned" && !actualReturnDate && !allReturned) return Response.json({ error: "Actual return date is required for a returned rental" }, { status: 400 });
  if (status !== "cancelled" && actualReturnDate) {
    normalizedItems.forEach((item) => { item.returnedDate ||= actualReturnDate; }); status = "returned";
  } else if (status !== "cancelled" && allReturned) {
    actualReturnDate = normalizedItems.reduce((latest, item) => item.returnedDate && item.returnedDate > latest ? item.returnedDate : latest, handoverDate); status = "returned";
  } else if (status === "overdue") status = plannedReturnDate < todayIso() ? "overdue" : "active";
  const totals = calculateRentalTotals(handoverDate, plannedReturnDate, actualReturnDate, normalizedItems);
  const rentalNumber = existing?.rentalNumber ?? await nextRentalNumber(createdDate);
  const now = Date.now();
  const statements = editing
    ? [d1.prepare(`UPDATE equipment_rentals SET customer_id = ?, team_id = ?, customer_name_snapshot = ?, created_date = ?, handover_date = ?, planned_return_date = ?, actual_return_date = ?, currency = ?, total_cents = ?, payment_method = ?, is_paid = ?, deposit_cents = ?, status = ?, notes = ?, updated_by = ?, updated_at = ? WHERE id = ?`).bind(customerId, teamId, holder.name, createdDate, handoverDate, plannedReturnDate, actualReturnDate, currency, totals.totalCents, paymentMethod, isPaid ? 1 : 0, depositCents, status, notes, user.email, now, id), d1.prepare("DELETE FROM equipment_rental_items WHERE rental_id = ?").bind(id), d1.prepare("DELETE FROM equipment_rental_shipments WHERE rental_id = ?").bind(id)]
    : [d1.prepare(`INSERT INTO equipment_rentals (id, rental_number, customer_id, team_id, customer_name_snapshot, created_date, handover_date, planned_return_date, actual_return_date, currency, total_cents, payment_method, is_paid, deposit_cents, status, notes, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, rentalNumber, customerId, teamId, holder.name, createdDate, handoverDate, plannedReturnDate, actualReturnDate, currency, totals.totalCents, paymentMethod, isPaid ? 1 : 0, depositCents, status, notes, user.email, user.email, now, now)];
  for (const item of normalizedItems) statements.push(d1.prepare("INSERT INTO equipment_rental_items (id, rental_id, item_type, resource_id, code_snapshot, description, quantity, daily_price_cents, billable_days, driver_id, driver_name_snapshot, returned_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(item.id, id, item.itemType, item.resourceId, item.code, item.description, item.quantity, item.dailyPriceCents, item.billableDays, item.driverId, item.driverName, item.returnedDate));
  for (const shipment of normalizedShipments) statements.push(d1.prepare("INSERT INTO equipment_rental_shipments (id, rental_id, direction, transport_mode, carrier, tracking_url, cost_cents, currency, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(shipment.id, id, shipment.direction, shipment.transportMode, shipment.carrier, shipment.trackingUrl, shipment.costCents, shipment.currency, shipment.status));
  statements.push(d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, 'equipment_rental', ?, ?, ?)").bind(crypto.randomUUID(), user.email, editing ? "update" : "create", id, JSON.stringify({ rentalNumber, holder: holder.name, handoverDate, plannedReturnDate, actualReturnDate, status, totalCents: totals.totalCents, itemCount: normalizedItems.length, shipments: normalizedShipments }), now));
  try { await d1.batch(statements); }
  catch (error) { const message = error instanceof Error ? error.message.toLowerCase() : ""; return Response.json({ error: message.includes("unique") ? "Rental number collision; please save again" : "Could not save rental" }, { status: message.includes("unique") ? 409 : 500 }); }
  return Response.json({ id, rentalNumber, totalCents: totals.totalCents, plannedDays: totals.plannedDays, actualDays: totals.actualDays }, { status: editing ? 200 : 201 });
}

function normalizeShipments(payloads: ShipmentPayload[], fallbackCurrency: Currency): NormalizedShipment[] | Response {
  const result: NormalizedShipment[] = [];
  for (const raw of payloads) {
    const direction = raw.direction; const transportMode = raw.transportMode ?? "carrier"; const carrier = clean(raw.carrier, 120);
    const trackingUrl = clean(raw.trackingUrl, 1000); const costCents = Number(raw.costCents ?? 0); const currency = raw.currency ?? fallbackCurrency; const status = raw.status ?? "planned";
    if (!direction || !shipmentDirections.has(direction) || result.some((item) => item.direction === direction)) return Response.json({ error: "Each shipping direction can be entered once" }, { status: 400 });
    if (!["carrier", "self"].includes(transportMode) || !shipmentStatuses.has(status)) return Response.json({ error: "Invalid shipping details" }, { status: 400 });
    if (!Number.isSafeInteger(costCents) || costCents < 0 || costCents > 1_000_000_000 || !["CZK", "EUR"].includes(currency)) return Response.json({ error: "Invalid shipping price" }, { status: 400 });
    if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) return Response.json({ error: "Tracking link must start with http:// or https://" }, { status: 400 });
    result.push({ id: clean(raw.id, 80) || crypto.randomUUID(), direction, transportMode, carrier, trackingUrl, costCents, currency, status });
  }
  return result;
}

async function findRentalConflict(itemType: "engine" | "carburetor", resourceId: string, startDate: string, endDate: string, excludedRentalId: string) {
  const conflict = await getD1().prepare(`
    SELECT r.rental_number AS rentalNumber
    FROM equipment_rental_items item JOIN equipment_rentals r ON r.id = item.rental_id
    WHERE item.item_type = ? AND item.resource_id = ? AND r.id != ? AND r.status != 'cancelled'
      AND ((item.returned_date IS NULL AND r.status IN ('sent', 'active', 'overdue'))
        OR (r.handover_date <= ? AND COALESCE(item.returned_date, r.actual_return_date, r.planned_return_date) >= ?))
    LIMIT 1
  `).bind(itemType, resourceId, excludedRentalId, endDate, startDate).first<{ rentalNumber: string }>();
  return conflict?.rentalNumber ?? "";
}

async function findRaceConflict(itemType: "engine" | "carburetor", resourceId: string, startDate: string, endDate: string) {
  const d1 = getD1(); const prefix = itemType === "engine" ? "engine" : "carburetor";
  const entry = await d1.prepare(`SELECT r.name FROM race_entries e JOIN races r ON r.id = e.race_id
    WHERE (e.${prefix}_1_id = ? OR e.${prefix}_2_id = ? OR e.${prefix}_3_id = ?)
      AND r.status != 'archived' AND r.start_date <= ? AND r.end_date >= ? LIMIT 1`).bind(resourceId, resourceId, resourceId, endDate, startDate).first<{ name: string }>();
  if (entry?.name) return entry.name;
  const extra = await d1.prepare(`SELECT r.name FROM race_extras x JOIN races r ON r.id = x.race_id
    WHERE x.resource_type = ? AND x.resource_id = ? AND r.status != 'archived'
      AND r.start_date <= ? AND r.end_date >= ? LIMIT 1`).bind(itemType, resourceId, endDate, startDate).first<{ name: string }>();
  return extra?.name ?? "";
}

async function nextRentalNumber(createdDate: string) {
  const year = createdDate.slice(0, 4);
  const row = await getD1().prepare("SELECT MAX(CAST(SUBSTR(rental_number, 10) AS INTEGER)) AS sequence FROM equipment_rentals WHERE rental_number LIKE ?").bind(`REN-${year}-%`).first<{ sequence: number | null }>();
  return `REN-${year}-${String((row?.sequence ?? 0) + 1).padStart(4, "0")}`;
}

async function readPayload(request: Request): Promise<RentalPayload | Response> {
  try { return await request.json() as RentalPayload; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
}
