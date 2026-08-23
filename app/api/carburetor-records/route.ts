import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { raceLogoUrl } from "../../race-logo";

const serviceTypes = new Set(["check", "routine", "full", "repair"]);
type ServicePayload = { carburetorId?: string; serviceDate?: string; serviceType?: string; mechanicId?: string; workDone?: string; replacedParts?: string; notes?: string };
function clean(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const id = clean(new URL(request.url).searchParams.get("id"), 80);
  if (!id) return Response.json({ error: "Carburetor id is required" }, { status: 400 });
  const d1 = getD1();
  const [carburetor, assignments, services, mechanics] = await Promise.all([
    d1.prepare(`SELECT id, code, carburetor_type_id AS carburetorTypeId, category, family, brand, model, status, notes, sold_at AS soldAt, created_at AS createdAt, updated_at AS updatedAt FROM carburetors WHERE id = ? AND archived_at IS NULL`).bind(id).first<Record<string, unknown>>(),
    d1.prepare(`
      SELECT e.id, e.driver_id AS driverId, e.driver_name_snapshot AS driverName,
             e.team_name_snapshot AS teamName, e.category, r.id AS raceId, r.name AS raceName,
             r.track, r.country_code AS countryCode, r.start_date AS startDate,
             r.end_date AS endDate, r.status AS raceStatus,
             r.race_template_id AS raceTemplateId, rt.logo_key AS logoKey,
             rt.logo_updated_at AS logoUpdatedAt, e.engine_1_id AS engineId,
             e.engine_1_code AS engineCode, 1 AS position
      FROM race_entries e JOIN races r ON r.id = e.race_id
      LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      WHERE e.carburetor_1_id = ? AND r.status != 'archived'
      UNION ALL
      SELECT e.id, e.driver_id, e.driver_name_snapshot, e.team_name_snapshot, e.category,
             r.id, r.name, r.track, r.country_code, r.start_date, r.end_date, r.status,
             r.race_template_id, rt.logo_key, rt.logo_updated_at,
             e.engine_2_id, e.engine_2_code, 2
      FROM race_entries e JOIN races r ON r.id = e.race_id
      LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      WHERE e.carburetor_2_id = ? AND r.status != 'archived'
      UNION ALL
      SELECT e.id, e.driver_id, e.driver_name_snapshot, e.team_name_snapshot, e.category,
             r.id, r.name, r.track, r.country_code, r.start_date, r.end_date, r.status,
             r.race_template_id, rt.logo_key, rt.logo_updated_at,
             e.engine_3_id, e.engine_3_code, 3
      FROM race_entries e JOIN races r ON r.id = e.race_id
      LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      WHERE e.carburetor_3_id = ? AND r.status != 'archived'
      ORDER BY startDate DESC
    `).bind(id, id, id).all<Record<string, unknown>>(),
    d1.prepare(`SELECT id, service_date AS serviceDate, service_type AS serviceType, mechanic_id AS mechanicId, mechanic_name_snapshot AS mechanicName, work_done AS workDone, replaced_parts AS replacedParts, notes, created_by AS createdBy, created_at AS createdAt FROM carburetor_service_entries WHERE carburetor_id = ? ORDER BY service_date DESC, created_at DESC`).bind(id).all<Record<string, unknown>>(),
    d1.prepare("SELECT id, name FROM mechanics WHERE archived_at IS NULL ORDER BY name").all<{ id: string; name: string }>(),
  ]);
  if (!carburetor) return Response.json({ error: "Carburetor not found" }, { status: 404 });
  return Response.json({
    carburetor,
    assignments: (assignments.results as Array<Record<string, unknown>>).map((assignment) => ({
      ...assignment,
      logoUrl: raceLogoUrl(assignment.raceTemplateId, assignment.logoKey, assignment.logoUpdatedAt),
    })),
    services: services.results,
    mechanics: mechanics.results,
  });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let payload: ServicePayload;
  try { payload = await request.json() as ServicePayload; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  await ensureRuntimeSchema();
  const carburetorId = clean(payload.carburetorId, 80);
  const serviceDate = clean(payload.serviceDate, 10);
  const serviceType = clean(payload.serviceType, 20);
  if (!carburetorId || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !serviceTypes.has(serviceType)) return Response.json({ error: "Service date and type are required" }, { status: 400 });
  const d1 = getD1();
  if (!(await d1.prepare("SELECT id FROM carburetors WHERE id = ? AND archived_at IS NULL").bind(carburetorId).first())) return Response.json({ error: "Carburetor not found" }, { status: 404 });
  const mechanicId = clean(payload.mechanicId, 80);
  const mechanic = mechanicId ? await d1.prepare("SELECT id, name FROM mechanics WHERE id = ? AND archived_at IS NULL").bind(mechanicId).first<{ id: string; name: string }>() : null;
  if (mechanicId && !mechanic) return Response.json({ error: "Mechanic not found" }, { status: 400 });
  const id = crypto.randomUUID();
  const now = Date.now();
  const details = { serviceDate, serviceType, mechanicId: mechanic?.id ?? null, mechanicName: mechanic?.name ?? user.fullName, workDone: clean(payload.workDone, 1500), replacedParts: clean(payload.replacedParts, 1000), notes: clean(payload.notes, 1500) };
  await d1.batch([
    d1.prepare("INSERT INTO carburetor_service_entries (id, carburetor_id, service_date, service_type, mechanic_id, mechanic_name_snapshot, work_done, replaced_parts, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, carburetorId, details.serviceDate, details.serviceType, details.mechanicId, details.mechanicName, details.workDone, details.replacedParts, details.notes, user.email, now),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'service', 'carburetor', ?, ?, ?)").bind(crypto.randomUUID(), user.email, carburetorId, JSON.stringify(details), now),
  ]);
  return Response.json({ id }, { status: 201 });
}
