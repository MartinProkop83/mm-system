import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser, type AppUser } from "../../server-auth";

type PaymentMethod = "cash" | "card" | "bank_transfer" | "invoice" | "other";

type DeliveryPayload = {
  id?: string;
  raceId?: string;
  customerName?: string;
  description?: string;
  quantity?: number;
  currency?: "CZK" | "EUR";
  amountCents?: number;
  paymentMethod?: PaymentMethod;
  isDelivered?: boolean;
  isPaid?: boolean;
  notes?: string;
};

type RaceRow = { id: string; name: string; status: string };

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

async function readPayload(request: Request): Promise<DeliveryPayload | Response> {
  try {
    return (await request.json()) as DeliveryPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

async function getRace(raceId: string) {
  return getD1().prepare("SELECT id, name, status FROM races WHERE id = ? AND status != 'archived'").bind(raceId).first<RaceRow>();
}

function writeError(race: RaceRow, user: AppUser) {
  if (user.role === "mechanic") return "Forbidden";
  if (race.status === "completed" && user.role !== "superadmin") return "Completed races can only be corrected by superadmin";
  return "";
}

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const raceId = new URL(request.url).searchParams.get("raceId")?.trim() ?? "";
  if (!raceId) return Response.json({ error: "Race id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const race = await getRace(raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const deliveries = await getD1().prepare(`
    SELECT id, race_id AS raceId, customer_name AS customerName, description,
           quantity, currency, amount_cents AS amountCents,
           payment_method AS paymentMethod, is_delivered AS isDelivered, is_paid AS isPaid, notes,
           created_at AS createdAt, updated_at AS updatedAt
    FROM race_deliveries WHERE race_id = ? ORDER BY created_at, customer_name
  `).bind(raceId).all<Record<string, unknown>>();
  return Response.json({ deliveries: deliveries.results.map((item) => ({ ...item, isDelivered: Boolean(item.isDelivered), isPaid: Boolean(item.isPaid) })) });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  await ensureRuntimeSchema();
  return saveDelivery(payload, user, false);
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  if (!clean(payload.id, 80)) return Response.json({ error: "Delivery id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  return saveDelivery(payload, user, true);
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  const raceId = clean(payload.raceId, 80);
  const id = clean(payload.id, 80);
  if (!raceId || !id) return Response.json({ error: "Race and delivery are required" }, { status: 400 });
  await ensureRuntimeSchema();
  const race = await getRace(raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const denied = writeError(race, user);
  if (denied) return Response.json({ error: denied }, { status: 403 });
  const d1 = getD1();
  const existing = await d1.prepare("SELECT * FROM race_deliveries WHERE id = ? AND race_id = ?").bind(id, raceId).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Delivery not found" }, { status: 404 });
  const now = Date.now();
  await d1.batch([
    d1.prepare("DELETE FROM race_deliveries WHERE id = ? AND race_id = ?").bind(id, raceId),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'delete', 'race_delivery', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify(existing), now),
  ]);
  return Response.json({ id });
}

async function saveDelivery(payload: DeliveryPayload, user: AppUser, editing: boolean) {
  const raceId = clean(payload.raceId, 80);
  if (!raceId) return Response.json({ error: "Race id is required" }, { status: 400 });
  const race = await getRace(raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const denied = writeError(race, user);
  if (denied) return Response.json({ error: denied }, { status: 403 });

  const customerName = clean(payload.customerName, 160);
  const description = clean(payload.description, 500);
  const notes = clean(payload.notes, 1000);
  const quantity = Number(payload.quantity);
  const amountCents = Number(payload.amountCents);
  const currency = payload.currency;
  const paymentMethod = payload.paymentMethod;
  if (!customerName || !description) return Response.json({ error: "Customer and item are required" }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return Response.json({ error: "Quantity must be a whole positive number" }, { status: 400 });
  if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > 1_000_000_000) return Response.json({ error: "Invalid amount" }, { status: 400 });
  if (!currency || !["CZK", "EUR"].includes(currency)) return Response.json({ error: "Currency must be CZK or EUR" }, { status: 400 });
  if (!paymentMethod || !["cash", "card", "bank_transfer", "invoice", "other"].includes(paymentMethod)) return Response.json({ error: "Invalid payment method" }, { status: 400 });

  const d1 = getD1();
  const id = editing ? clean(payload.id, 80) : crypto.randomUUID();
  const existing = editing ? await d1.prepare("SELECT id FROM race_deliveries WHERE id = ? AND race_id = ?").bind(id, raceId).first() : null;
  if (editing && !existing) return Response.json({ error: "Delivery not found" }, { status: 404 });
  const now = Date.now();
  const isDelivered = payload.isDelivered ? 1 : 0;
  const isPaid = payload.isPaid ? 1 : 0;
  const statement = editing
    ? d1.prepare("UPDATE race_deliveries SET customer_name = ?, description = ?, quantity = ?, currency = ?, amount_cents = ?, payment_method = ?, is_delivered = ?, is_paid = ?, notes = ?, updated_at = ? WHERE id = ? AND race_id = ?").bind(customerName, description, quantity, currency, amountCents, paymentMethod, isDelivered, isPaid, notes, now, id, raceId)
    : d1.prepare("INSERT INTO race_deliveries (id, race_id, customer_name, description, quantity, currency, amount_cents, payment_method, is_delivered, is_paid, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, raceId, customerName, description, quantity, currency, amountCents, paymentMethod, isDelivered, isPaid, notes, user.email, now, now);
  await d1.batch([
    statement,
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, 'race_delivery', ?, ?, ?)").bind(crypto.randomUUID(), user.email, editing ? "update" : "create", id, JSON.stringify({ raceId, customerName, description, quantity, currency, amountCents, paymentMethod, isDelivered: Boolean(isDelivered), isPaid: Boolean(isPaid) }), now),
  ]);
  return Response.json({ id }, { status: editing ? 200 : 201 });
}
