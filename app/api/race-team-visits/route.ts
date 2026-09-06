import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser, type AppUser } from "../../server-auth";

type ItemType = "part" | "service" | "stock" | "oil" | "other";

type VisitPayload = {
  id?: string;
  raceId?: string;
  teamId?: string | null;
  teamName?: string;
  driverId?: string | null;
  driverName?: string;
  itemType?: ItemType;
  resourceId?: string | null;
  description?: string;
  visitDate?: string;
  mechanicId?: string | null;
  mechanicName?: string;
  currency?: "CZK" | "EUR";
  amountCents?: number | null;
  notes?: string;
};

type RaceRow = { id: string; name: string; status: string };

const ITEM_TYPES: ItemType[] = ["part", "service", "stock", "oil", "other"];

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanOrNull(value: unknown, max = 80) {
  const cleaned = clean(value, max);
  return cleaned || null;
}

async function readPayload(request: Request): Promise<VisitPayload | Response> {
  try {
    return (await request.json()) as VisitPayload;
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
  const visits = await getD1().prepare(`
    SELECT id, race_id AS raceId, team_id AS teamId, team_name AS teamName,
           driver_id AS driverId, driver_name AS driverName, item_type AS itemType,
           resource_id AS resourceId, description, visit_date AS visitDate, mechanic_id AS mechanicId, mechanic_name AS mechanicName, currency, amount_cents AS amountCents, notes,
           created_at AS createdAt, updated_at AS updatedAt
    FROM race_team_visits WHERE race_id = ? ORDER BY team_name COLLATE NOCASE, created_at
  `).bind(raceId).all<Record<string, unknown>>();
  const visitRows: Array<Record<string, unknown>> = visits.results;
  return Response.json({ visits: visitRows.map((item) => ({ ...item, amountCents: item.amountCents === null ? null : Number(item.amountCents) })) });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  await ensureRuntimeSchema();
  return saveVisit(payload, user, false);
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  if (!clean(payload.id, 80)) return Response.json({ error: "Visit id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  return saveVisit(payload, user, true);
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  const raceId = clean(payload.raceId, 80);
  const id = clean(payload.id, 80);
  if (!raceId || !id) return Response.json({ error: "Race and visit are required" }, { status: 400 });
  await ensureRuntimeSchema();
  const race = await getRace(raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const denied = writeError(race, user);
  if (denied) return Response.json({ error: denied }, { status: 403 });
  const d1 = getD1();
  const existing = await d1.prepare("SELECT * FROM race_team_visits WHERE id = ? AND race_id = ?").bind(id, raceId).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Visit not found" }, { status: 404 });
  const now = Date.now();
  const statements = [
    d1.prepare("DELETE FROM race_team_visits WHERE id = ? AND race_id = ?").bind(id, raceId),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'delete', 'race_team_visit', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify(existing), now),
  ];
  if (existing.item_type === "stock" && existing.resource_id) statements.push(d1.prepare("UPDATE inventory_parts SET quantity = quantity + 1, updated_at = ? WHERE id = ?").bind(now, existing.resource_id as string));
  await d1.batch(statements);
  return Response.json({ id });
}

async function saveVisit(payload: VisitPayload, user: AppUser, editing: boolean) {
  const raceId = clean(payload.raceId, 80);
  if (!raceId) return Response.json({ error: "Race id is required" }, { status: 400 });
  const race = await getRace(raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const denied = writeError(race, user);
  if (denied) return Response.json({ error: denied }, { status: 403 });

  const teamName = clean(payload.teamName, 160);
  const teamId = cleanOrNull(payload.teamId);
  const driverName = clean(payload.driverName, 160);
  const driverId = cleanOrNull(payload.driverId);
  const itemType = payload.itemType;
  const resourceId = cleanOrNull(payload.resourceId);
  const description = clean(payload.description, 500);
  const notes = clean(payload.notes, 1000);
  const visitDate = clean(payload.visitDate, 10) || new Date().toISOString().slice(0, 10);
  const mechanicId = cleanOrNull(payload.mechanicId);
  const mechanicName = clean(payload.mechanicName, 120);
  const currency = payload.currency;
  const hasAmount = payload.amountCents !== null && payload.amountCents !== undefined && payload.amountCents !== ("" as unknown);
  const amountCents = hasAmount ? Number(payload.amountCents) : null;

  if (!teamName) return Response.json({ error: "Team is required" }, { status: 400 });
  if (!itemType || !ITEM_TYPES.includes(itemType)) return Response.json({ error: "Invalid item type" }, { status: 400 });
  if (!description) return Response.json({ error: "Description is required" }, { status: 400 });
  if (!currency || !["CZK", "EUR"].includes(currency)) return Response.json({ error: "Currency must be CZK or EUR" }, { status: 400 });
  if (amountCents !== null && (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > 1_000_000_000)) return Response.json({ error: "Invalid amount" }, { status: 400 });

  const d1 = getD1();
  const id = editing ? clean(payload.id, 80) : crypto.randomUUID();
  const existing = editing ? await d1.prepare("SELECT id, item_type AS itemType, resource_id AS resourceId FROM race_team_visits WHERE id = ? AND race_id = ?").bind(id, raceId).first<{ id: string; itemType: ItemType; resourceId: string | null }>() : null;
  if (editing && !existing) return Response.json({ error: "Visit not found" }, { status: 404 });

  const previousStockId = existing?.itemType === "stock" ? existing.resourceId : null;
  const nextStockId = itemType === "stock" ? resourceId : null;
  if (nextStockId && nextStockId !== previousStockId) {
    const part = await d1.prepare("SELECT quantity FROM inventory_parts WHERE id = ? AND archived_at IS NULL").bind(nextStockId).first<{ quantity: number }>();
    if (!part) return Response.json({ error: "Stock item not found" }, { status: 404 });
    if (part.quantity < 1) return Response.json({ error: "Stock item is out of stock" }, { status: 409 });
  }

  const now = Date.now();
  const statement = editing
    ? d1.prepare("UPDATE race_team_visits SET team_id = ?, team_name = ?, driver_id = ?, driver_name = ?, item_type = ?, resource_id = ?, description = ?, visit_date = ?, mechanic_id = ?, mechanic_name = ?, currency = ?, amount_cents = ?, notes = ?, updated_at = ? WHERE id = ? AND race_id = ?").bind(teamId, teamName, driverId, driverName, itemType, resourceId, description, visitDate, mechanicId, mechanicName, currency, amountCents, notes, now, id, raceId)
    : d1.prepare("INSERT INTO race_team_visits (id, race_id, team_id, team_name, driver_id, driver_name, item_type, resource_id, description, visit_date, mechanic_id, mechanic_name, currency, amount_cents, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, raceId, teamId, teamName, driverId, driverName, itemType, resourceId, description, visitDate, mechanicId, mechanicName, currency, amountCents, notes, user.email, now, now);
  const statements = [
    statement,
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, 'race_team_visit', ?, ?, ?)").bind(crypto.randomUUID(), user.email, editing ? "update" : "create", id, JSON.stringify({ raceId, teamName, driverName, itemType, description, currency, amountCents }), now),
  ];
  if (previousStockId && previousStockId !== nextStockId) statements.push(d1.prepare("UPDATE inventory_parts SET quantity = quantity + 1, updated_at = ? WHERE id = ?").bind(now, previousStockId));
  if (nextStockId && nextStockId !== previousStockId) statements.push(d1.prepare("UPDATE inventory_parts SET quantity = quantity - 1, updated_at = ? WHERE id = ?").bind(now, nextStockId));
  await d1.batch(statements);
  return Response.json({ id }, { status: editing ? 200 : 201 });
}
