import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type ServicePayload = { id?: string; vehicleId?: string; serviceDate?: string; km?: string | number; workDone?: string; mechanicId?: string };

function clean(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }

function kmOrNull(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

async function refreshVehicleSummary(vehicleId: string, now: number) {
  const d1 = getD1();
  const latest = await d1.prepare(`
    SELECT service_date AS serviceDate, km, work_done AS workDone
    FROM vehicle_service_entries WHERE vehicle_id = ? ORDER BY service_date DESC, created_at DESC LIMIT 1
  `).bind(vehicleId).first<{ serviceDate: string; km: number | null; workDone: string }>();
  if (latest) {
    await d1.prepare("UPDATE vehicles SET current_km = COALESCE(?, current_km), last_service_km = ?, last_service_note = ?, last_service_date = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL")
      .bind(latest.km, latest.km, latest.workDone, latest.serviceDate, now, vehicleId).run();
  } else {
    await d1.prepare("UPDATE vehicles SET last_service_km = NULL, last_service_note = '', last_service_date = '', updated_at = ? WHERE id = ? AND archived_at IS NULL")
      .bind(now, vehicleId).run();
  }
}

async function resolveMechanic(d1: ReturnType<typeof getD1>, payload: ServicePayload) {
  const mechanicId = clean(payload.mechanicId, 80);
  const mechanic = mechanicId ? await d1.prepare("SELECT id, name FROM mechanics WHERE id = ? AND archived_at IS NULL").bind(mechanicId).first<{ id: string; name: string }>() : null;
  if (mechanicId && !mechanic) return { error: Response.json({ error: "Mechanic not found" }, { status: 400 }) } as const;
  return { mechanic } as const;
}

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const vehicleId = clean(new URL(request.url).searchParams.get("vehicleId"), 80);
  if (!vehicleId) return Response.json({ error: "Vehicle id is required" }, { status: 400 });
  const d1 = getD1();
  const entries = await d1.prepare(`
    SELECT id, service_date AS serviceDate, km, work_done AS workDone, mechanic_id AS mechanicId, mechanic_name_snapshot AS mechanicName, created_by AS createdBy, created_at AS createdAt
    FROM vehicle_service_entries WHERE vehicle_id = ? ORDER BY service_date DESC, created_at DESC
  `).bind(vehicleId).all<Record<string, unknown>>();
  return Response.json({ entries: entries.results });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let payload: ServicePayload;
  try { payload = await request.json() as ServicePayload; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  await ensureRuntimeSchema();
  const vehicleId = clean(payload.vehicleId, 80);
  const serviceDate = clean(payload.serviceDate, 10);
  if (!vehicleId || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return Response.json({ error: "Vehicle and a valid service date are required" }, { status: 400 });
  const d1 = getD1();
  if (!(await d1.prepare("SELECT id FROM vehicles WHERE id = ? AND archived_at IS NULL").bind(vehicleId).first())) return Response.json({ error: "Vehicle not found" }, { status: 404 });
  const resolved = await resolveMechanic(d1, payload);
  if ("error" in resolved) return resolved.error;
  const mechanic = resolved.mechanic;
  const id = crypto.randomUUID();
  const now = Date.now();
  const km = kmOrNull(payload.km);
  const workDone = clean(payload.workDone, 1500);
  const details = { serviceDate, km, workDone, mechanicName: mechanic?.name ?? "" };
  await d1.batch([
    d1.prepare("INSERT INTO vehicle_service_entries (id, vehicle_id, service_date, km, work_done, mechanic_id, mechanic_name_snapshot, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, vehicleId, serviceDate, km, workDone, mechanic?.id ?? null, mechanic?.name ?? "", user.email, now),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'service', 'vehicle', ?, ?, ?)").bind(crypto.randomUUID(), user.email, vehicleId, JSON.stringify(details), now),
  ]);
  await refreshVehicleSummary(vehicleId, now);
  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let payload: ServicePayload;
  try { payload = await request.json() as ServicePayload; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  await ensureRuntimeSchema();
  const id = clean(payload.id, 80);
  const vehicleId = clean(payload.vehicleId, 80);
  const serviceDate = clean(payload.serviceDate, 10);
  if (!id || !vehicleId || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return Response.json({ error: "Vehicle and a valid service date are required" }, { status: 400 });
  const d1 = getD1();
  const existing = await d1.prepare("SELECT id FROM vehicle_service_entries WHERE id = ? AND vehicle_id = ?").bind(id, vehicleId).first();
  if (!existing) return Response.json({ error: "Service entry not found" }, { status: 404 });
  const resolved = await resolveMechanic(d1, payload);
  if ("error" in resolved) return resolved.error;
  const mechanic = resolved.mechanic;
  const now = Date.now();
  const km = kmOrNull(payload.km);
  const workDone = clean(payload.workDone, 1500);
  const details = { serviceDate, km, workDone, mechanicName: mechanic?.name ?? "" };
  await d1.batch([
    d1.prepare("UPDATE vehicle_service_entries SET service_date = ?, km = ?, work_done = ?, mechanic_id = ?, mechanic_name_snapshot = ? WHERE id = ? AND vehicle_id = ?").bind(serviceDate, km, workDone, mechanic?.id ?? null, mechanic?.name ?? "", id, vehicleId),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'correct_service', 'vehicle', ?, ?, ?)").bind(crypto.randomUUID(), user.email, vehicleId, JSON.stringify(details), now),
  ]);
  await refreshVehicleSummary(vehicleId, now);
  return Response.json({ id });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  let payload: Pick<ServicePayload, "id" | "vehicleId">;
  try { payload = await request.json() as Pick<ServicePayload, "id" | "vehicleId">; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  await ensureRuntimeSchema();
  const id = clean(payload.id, 80);
  const vehicleId = clean(payload.vehicleId, 80);
  if (!id || !vehicleId) return Response.json({ error: "Service entry is required" }, { status: 400 });
  const d1 = getD1();
  const existing = await d1.prepare("SELECT id FROM vehicle_service_entries WHERE id = ? AND vehicle_id = ?").bind(id, vehicleId).first();
  if (!existing) return Response.json({ error: "Service entry not found" }, { status: 404 });
  const now = Date.now();
  await d1.batch([
    d1.prepare("DELETE FROM vehicle_service_entries WHERE id = ? AND vehicle_id = ?").bind(id, vehicleId),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'delete_service', 'vehicle', ?, ?, ?)").bind(crypto.randomUUID(), user.email, vehicleId, JSON.stringify({ id }), now),
  ]);
  await refreshVehicleSummary(vehicleId, now);
  return Response.json({ ok: true });
}
