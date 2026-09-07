import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser, type AppUser } from "../../server-auth";

type RaceRow = { id: string; name: string; status: string };
type RaceChecklistRow = { id: string; raceId: string; checklistId: string | null; vehicleId: string | null; vehicleName: string; name: string; notes: string; createdAt: number; updatedAt: number };
type RaceChecklistItemRow = { id: string; raceChecklistId: string; section: string; partNumber: string; name: string; quantity: number; isChecked: number };

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
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
  const d1 = getD1();
  const checklists = await d1.prepare(
    "SELECT id, race_id AS raceId, checklist_id AS checklistId, vehicle_id AS vehicleId, vehicle_name_snapshot AS vehicleName, name, notes, created_at AS createdAt, updated_at AS updatedAt FROM race_checklists WHERE race_id = ? ORDER BY created_at"
  ).bind(raceId).all<RaceChecklistRow>();
  const checklistRows: RaceChecklistRow[] = checklists.results;
  const items = await d1.prepare(
    "SELECT ci.id, ci.race_checklist_id AS raceChecklistId, ci.section, ci.part_number AS partNumber, ci.name, ci.quantity, ci.is_checked AS isChecked FROM race_checklist_items ci JOIN race_checklists c ON c.id = ci.race_checklist_id WHERE c.race_id = ? ORDER BY ci.sort_order"
  ).bind(raceId).all<RaceChecklistItemRow>();
  const itemRows: RaceChecklistItemRow[] = items.results;
  const byChecklist = new Map<string, RaceChecklistItemRow[]>();
  for (const item of itemRows) {
    const list = byChecklist.get(item.raceChecklistId) ?? [];
    list.push(item);
    byChecklist.set(item.raceChecklistId, list);
  }
  return Response.json({
    checklists: checklistRows.map((checklist) => ({
      ...checklist,
      items: (byChecklist.get(checklist.id) ?? []).map((item) => ({ ...item, isChecked: Boolean(item.isChecked) })),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let payload: { raceId?: string; checklistId?: string; vehicleId?: string | null };
  try { payload = await request.json() as typeof payload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const raceId = clean(payload.raceId, 80);
  const checklistId = clean(payload.checklistId, 80);
  const vehicleId = clean(payload.vehicleId, 80) || null;
  if (!raceId || !checklistId) return Response.json({ error: "Race and checklist are required" }, { status: 400 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const race = await getRace(raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const denied = writeError(race, user);
  if (denied) return Response.json({ error: denied }, { status: 403 });

  const source = await d1.prepare("SELECT id, name, notes FROM checklists WHERE id = ? AND archived_at IS NULL").bind(checklistId).first<{ id: string; name: string; notes: string }>();
  if (!source) return Response.json({ error: "Checklist not found" }, { status: 404 });
  const sourceItems = await d1.prepare("SELECT section, part_number AS partNumber, name, quantity FROM checklist_items WHERE checklist_id = ? ORDER BY sort_order").bind(checklistId).all<{ section: string; partNumber: string; name: string; quantity: number }>();
  const sourceItemRows: Array<{ section: string; partNumber: string; name: string; quantity: number }> = sourceItems.results;

  let vehicleName = "";
  if (vehicleId) {
    const vehicle = await d1.prepare("SELECT vehicle_name_snapshot AS vehicleName FROM race_vehicles WHERE race_id = ? AND vehicle_id = ?").bind(raceId, vehicleId).first<{ vehicleName: string }>();
    if (!vehicle) return Response.json({ error: "Vehicle is not assigned to this race" }, { status: 404 });
    vehicleName = vehicle.vehicleName;
  }

  const id = crypto.randomUUID(); const now = Date.now();
  const statements = [
    d1.prepare("INSERT INTO race_checklists (id, race_id, checklist_id, vehicle_id, vehicle_name_snapshot, name, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, raceId, checklistId, vehicleId, vehicleName, source.name, source.notes, user.email, now, now),
  ];
  sourceItemRows.forEach((item, index) => {
    statements.push(d1.prepare("INSERT INTO race_checklist_items (id, race_checklist_id, section, part_number, name, quantity, is_checked, sort_order) VALUES (?, ?, ?, ?, ?, ?, 0, ?)").bind(crypto.randomUUID(), id, item.section, item.partNumber, item.name, item.quantity, index));
  });
  await d1.batch(statements);
  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let payload: { id?: string; isChecked?: boolean };
  try { payload = await request.json() as typeof payload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const itemId = clean(payload.id, 80);
  if (!itemId) return Response.json({ error: "Item id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const item = await d1.prepare(
    "SELECT ci.id AS id, c.race_id AS raceId FROM race_checklist_items ci JOIN race_checklists c ON c.id = ci.race_checklist_id WHERE ci.id = ?"
  ).bind(itemId).first<{ id: string; raceId: string }>();
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 });
  const race = await getRace(item.raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const denied = writeError(race, user);
  if (denied) return Response.json({ error: denied }, { status: 403 });
  await d1.prepare("UPDATE race_checklist_items SET is_checked = ? WHERE id = ?").bind(payload.isChecked ? 1 : 0, itemId).run();
  return Response.json({ id: itemId });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let payload: { id?: string };
  try { payload = await request.json() as typeof payload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Checklist id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const attached = await d1.prepare("SELECT race_id AS raceId FROM race_checklists WHERE id = ?").bind(id).first<{ raceId: string }>();
  if (!attached) return Response.json({ error: "Checklist not found" }, { status: 404 });
  const race = await getRace(attached.raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const denied = writeError(race, user);
  if (denied) return Response.json({ error: denied }, { status: 403 });
  await d1.batch([
    d1.prepare("DELETE FROM race_checklist_items WHERE race_checklist_id = ?").bind(id),
    d1.prepare("DELETE FROM race_checklists WHERE id = ?").bind(id),
  ]);
  return Response.json({ id });
}
