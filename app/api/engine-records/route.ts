import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { raceLogoUrl } from "../../race-logo";

const pistonSizes = new Set([
  "53.83", "53.85", "53.86", "53.87", "53.88", "53.89",
  "53.90", "53.91", "53.92", "53.93", "53.94", "53.95",
]);
const familiesWithPistonSizes = new Set(["OKJ", "OKN", "OKN-J", "OK"]);
const serviceTypes = new Set(["inspection", "piston_service", "top_end", "full_service"]);
const allowedParts = new Set([
  "piston",
  "oil_seals",
  "crank_bearings",
  "connecting_rod",
  "upper_rod_cage",
  "cylinder_gasket",
  "head_gasket",
]);

type EngineRow = {
  id: string;
  code: string;
  family: string;
  totalMinutes: number;
  pistonMinutes: number;
  rodMinutes: number;
  lastOppamaMinutes: number;
  currentPistonSize: string;
  baselineTotalMinutes: number;
  baselinePistonMinutes: number;
  baselineRodMinutes: number;
  baselineLastOppamaMinutes: number;
  baselinePistonSize: string;
  status: string;
  updatedAt: number;
};

type UsageRow = {
  id: string;
  engineId: string;
  entryDate: string;
  oppamaMinutes: number;
  raceName: string;
  driverName: string;
  notes: string;
  createdBy: string;
  createdAt: number;
};

type ServiceRow = {
  id: string;
  engineId: string;
  serviceDate: string;
  serviceType: string;
  replacedParts: string;
  pistonSize: string;
  notes: string;
  pistonMinutesBefore: number;
  rodMinutesBefore: number;
  createdBy: string;
  createdAt: number;
};

type AssignmentRow = {
  id: string;
  driverId: string;
  driverName: string;
  teamName: string;
  category: string;
  raceId: string;
  raceName: string;
  track: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  raceStatus: string;
  raceTemplateId: string | null;
  logoKey: string | null;
  logoUpdatedAt: number | null;
  carburetorId: string | null;
  carburetorCode: string;
  position: number;
};

type RecordPayload = {
  kind?: "usage" | "service" | "baseline";
  recordId?: string;
  engineId?: string;
  date?: string;
  oppama?: string;
  raceName?: string;
  driverName?: string;
  serviceType?: string;
  replacedParts?: string[];
  pistonSize?: string;
  notes?: string;
  totalTime?: string;
  pistonTime?: string;
  rodTime?: string;
  lastOppama?: string;
};

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseTime(value: string, allowZero = false) {
  const match = value.trim().match(/^(\d{1,4}):([0-5]\d)$/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (!allowZero && minutes <= 0) return null;
  return minutes;
}

function cleanParts(parts: string[] | undefined) {
  return Array.from(new Set(parts ?? [])).filter((part) => allowedParts.has(part));
}

function validatePistonSize(engine: EngineRow, replacedParts: string[], pistonSize: string) {
  const resetsPiston = replacedParts.includes("piston") || replacedParts.includes("connecting_rod");
  return !resetsPiston || !familiesWithPistonSizes.has(engine.family) || pistonSizes.has(pistonSize);
}

function deserializeService(row: ServiceRow) {
  let replacedParts: string[] = [];
  try {
    replacedParts = JSON.parse(row.replacedParts) as string[];
  } catch {
    replacedParts = [];
  }
  return { ...row, replacedParts };
}

async function getEngine(engineId: string) {
  return getD1().prepare(`
    SELECT id, code, family, total_minutes AS totalMinutes,
           piston_minutes AS pistonMinutes, rod_minutes AS rodMinutes,
           last_oppama_minutes AS lastOppamaMinutes,
           current_piston_size AS currentPistonSize,
           baseline_total_minutes AS baselineTotalMinutes,
           baseline_piston_minutes AS baselinePistonMinutes,
           baseline_rod_minutes AS baselineRodMinutes,
           baseline_last_oppama_minutes AS baselineLastOppamaMinutes,
           baseline_piston_size AS baselinePistonSize,
           status, updated_at AS updatedAt
    FROM engines
    WHERE id = ? AND archived_at IS NULL
  `).bind(engineId).first<EngineRow>();
}

async function getUsage(recordId: string, engineId: string) {
  return getD1().prepare(`
    SELECT id, engine_id AS engineId, entry_date AS entryDate,
           oppama_minutes AS oppamaMinutes, race_name AS raceName,
           driver_name AS driverName, notes, created_by AS createdBy,
           created_at AS createdAt
    FROM engine_usage_logs
    WHERE id = ? AND engine_id = ?
  `).bind(recordId, engineId).first<UsageRow>();
}

async function getService(recordId: string, engineId: string) {
  return getD1().prepare(`
    SELECT id, engine_id AS engineId, service_date AS serviceDate,
           service_type AS serviceType, replaced_parts AS replacedParts,
           piston_size AS pistonSize, notes,
           piston_minutes_before AS pistonMinutesBefore,
           rod_minutes_before AS rodMinutesBefore,
           created_by AS createdBy, created_at AS createdAt
    FROM engine_service_entries
    WHERE id = ? AND engine_id = ?
  `).bind(recordId, engineId).first<ServiceRow>();
}

async function recalculateEngine(engineId: string, now = Date.now()) {
  const d1 = getD1();
  const engine = await getEngine(engineId);
  if (!engine) throw new Error("Engine not found");

  const [usageResult, serviceResult] = await Promise.all([
    d1.prepare(`
      SELECT id, engine_id AS engineId, entry_date AS entryDate,
             oppama_minutes AS oppamaMinutes, race_name AS raceName,
             driver_name AS driverName, notes, created_by AS createdBy,
             created_at AS createdAt
      FROM engine_usage_logs WHERE engine_id = ?
    `).bind(engineId).all<UsageRow>(),
    d1.prepare(`
      SELECT id, engine_id AS engineId, service_date AS serviceDate,
             service_type AS serviceType, replaced_parts AS replacedParts,
             piston_size AS pistonSize, notes,
             piston_minutes_before AS pistonMinutesBefore,
             rod_minutes_before AS rodMinutesBefore,
             created_by AS createdBy, created_at AS createdAt
      FROM engine_service_entries WHERE engine_id = ?
    `).bind(engineId).all<ServiceRow>(),
  ]);

  const events = [
    ...usageResult.results.map((record: UsageRow) => ({ kind: "usage" as const, date: record.entryDate, createdAt: record.createdAt, record })),
    ...serviceResult.results.map((record: ServiceRow) => ({ kind: "service" as const, date: record.serviceDate, createdAt: record.createdAt, record })),
  ].sort((left, right) => left.date.localeCompare(right.date) || left.createdAt - right.createdAt || left.kind.localeCompare(right.kind));

  let totalMinutes = engine.baselineTotalMinutes;
  let pistonMinutes = engine.baselinePistonMinutes;
  let rodMinutes = engine.baselineRodMinutes;
  let lastOppamaMinutes = engine.baselineLastOppamaMinutes;
  let currentPistonSize = engine.baselinePistonSize;
  const statements: ReturnType<typeof d1.prepare>[] = [];

  for (const event of events) {
    if (event.kind === "usage") {
      totalMinutes += event.record.oppamaMinutes;
      pistonMinutes += event.record.oppamaMinutes;
      rodMinutes += event.record.oppamaMinutes;
      lastOppamaMinutes = event.record.oppamaMinutes;
      continue;
    }

    statements.push(d1.prepare(`
      UPDATE engine_service_entries
      SET piston_minutes_before = ?, rod_minutes_before = ?
      WHERE id = ? AND engine_id = ?
    `).bind(pistonMinutes, rodMinutes, event.record.id, engineId));

    const parts = cleanParts(deserializeService(event.record).replacedParts);
    if (parts.includes("connecting_rod")) {
      rodMinutes = 0;
      pistonMinutes = 0;
    } else if (parts.includes("piston")) {
      pistonMinutes = 0;
    }
    if ((parts.includes("piston") || parts.includes("connecting_rod")) && event.record.pistonSize) {
      currentPistonSize = event.record.pistonSize;
    }
  }

  statements.push(d1.prepare(`
    UPDATE engines
    SET total_minutes = ?, piston_minutes = ?, rod_minutes = ?,
        last_oppama_minutes = ?, current_piston_size = ?, updated_at = ?
    WHERE id = ? AND archived_at IS NULL
  `).bind(totalMinutes, pistonMinutes, rodMinutes, lastOppamaMinutes, currentPistonSize, now, engineId));

  await d1.batch(statements);
  return getEngine(engineId);
}

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const engineId = new URL(request.url).searchParams.get("engineId")?.trim() ?? "";
  if (!engineId) return Response.json({ error: "Engine id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const engine = await getEngine(engineId);
  if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });

  const d1 = getD1();
  const [usage, service, assignments] = await Promise.all([
    d1.prepare(`
      SELECT id, entry_date AS entryDate, oppama_minutes AS oppamaMinutes,
             race_name AS raceName, driver_name AS driverName, notes,
             created_by AS createdBy, created_at AS createdAt
      FROM engine_usage_logs
      WHERE engine_id = ?
      ORDER BY entry_date DESC, created_at DESC
      LIMIT 100
    `).bind(engineId).all<UsageRow>(),
    d1.prepare(`
      SELECT id, service_date AS serviceDate, service_type AS serviceType,
             replaced_parts AS replacedParts, piston_size AS pistonSize, notes,
             piston_minutes_before AS pistonMinutesBefore,
             rod_minutes_before AS rodMinutesBefore,
             created_by AS createdBy, created_at AS createdAt
      FROM engine_service_entries
      WHERE engine_id = ?
      ORDER BY service_date DESC, created_at DESC
      LIMIT 100
    `).bind(engineId).all<ServiceRow>(),
    d1.prepare(`
      SELECT e.id, e.driver_id AS driverId, e.driver_name_snapshot AS driverName,
             e.team_name_snapshot AS teamName, e.category, r.id AS raceId, r.name AS raceName,
             r.track, r.country_code AS countryCode, r.start_date AS startDate,
             r.end_date AS endDate, r.status AS raceStatus,
             r.race_template_id AS raceTemplateId, rt.logo_key AS logoKey,
             rt.logo_updated_at AS logoUpdatedAt,
             e.carburetor_1_id AS carburetorId, e.carburetor_1_code AS carburetorCode,
             1 AS position
      FROM race_entries e JOIN races r ON r.id = e.race_id
      LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      WHERE e.engine_1_id = ? AND r.status != 'archived'
      UNION ALL
      SELECT e.id, e.driver_id, e.driver_name_snapshot, e.team_name_snapshot, e.category,
             r.id, r.name, r.track, r.country_code, r.start_date, r.end_date, r.status,
             r.race_template_id, rt.logo_key, rt.logo_updated_at,
             e.carburetor_2_id, e.carburetor_2_code, 2
      FROM race_entries e JOIN races r ON r.id = e.race_id
      LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      WHERE e.engine_2_id = ? AND r.status != 'archived'
      UNION ALL
      SELECT e.id, e.driver_id, e.driver_name_snapshot, e.team_name_snapshot, e.category,
             r.id, r.name, r.track, r.country_code, r.start_date, r.end_date, r.status,
             r.race_template_id, rt.logo_key, rt.logo_updated_at,
             e.carburetor_3_id, e.carburetor_3_code, 3
      FROM race_entries e JOIN races r ON r.id = e.race_id
      LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      WHERE e.engine_3_id = ? AND r.status != 'archived'
      ORDER BY startDate DESC
    `).bind(engineId, engineId, engineId).all<AssignmentRow>(),
  ]);

  return Response.json({
    usage: usage.results,
    service: service.results.map(deserializeService),
    assignments: assignments.results.map((assignment) => ({
      ...assignment,
      logoUrl: raceLogoUrl(assignment.raceTemplateId, assignment.logoKey, assignment.logoUpdatedAt),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let payload: RecordPayload;
  try {
    payload = (await request.json()) as RecordPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const engineId = payload.engineId?.trim() ?? "";
  if (!engineId) return Response.json({ error: "Engine id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const engine = await getEngine(engineId);
  if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });

  if (payload.kind === "baseline") {
    if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
    return saveBaseline(payload, engine, user.email);
  }

  const date = payload.date?.trim() ?? "";
  if (!isDate(date)) return Response.json({ error: "Engine and valid date are required" }, { status: 400 });
  if (payload.kind === "usage") return saveUsage(payload, engine, user.email, date);
  if (payload.kind === "service") return saveService(payload, engine, user.email, date);
  return Response.json({ error: "Invalid record type" }, { status: 400 });
}

async function saveBaseline(payload: RecordPayload, engine: EngineRow, actorEmail: string) {
  if (["MINI", "OKJ"].includes(engine.family)) {
    return Response.json({ error: "This engine family does not use Oppama tracking" }, { status: 400 });
  }

  const totalMinutes = parseTime(payload.totalTime ?? "", true);
  const pistonMinutes = parseTime(payload.pistonTime ?? "", true);
  const rodMinutes = parseTime(payload.rodTime ?? "", true);
  const lastOppamaMinutes = parseTime(payload.lastOppama ?? "", true);
  if ([totalMinutes, pistonMinutes, rodMinutes, lastOppamaMinutes].some((value) => value === null)) {
    return Response.json({ error: "All starting counters must use HH:MM" }, { status: 400 });
  }
  if (totalMinutes! < pistonMinutes! || totalMinutes! < rodMinutes!) {
    return Response.json({ error: "Total time cannot be lower than component counters" }, { status: 400 });
  }

  const pistonSize = payload.pistonSize?.trim() ?? "";
  if (pistonSize && familiesWithPistonSizes.has(engine.family) && !pistonSizes.has(pistonSize)) {
    return Response.json({ error: "Select a valid piston size" }, { status: 400 });
  }

  const d1 = getD1();
  const now = Date.now();
  await d1.batch([
    d1.prepare(`
      UPDATE engines
      SET baseline_total_minutes = ?, baseline_piston_minutes = ?,
          baseline_rod_minutes = ?, baseline_last_oppama_minutes = ?,
          baseline_piston_size = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
    `).bind(totalMinutes, pistonMinutes, rodMinutes, lastOppamaMinutes, pistonSize, now, engine.id),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'set_engine_baseline', 'engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), actorEmail, engine.id, JSON.stringify({ totalMinutes, pistonMinutes, rodMinutes, lastOppamaMinutes, pistonSize }), now),
  ]);

  const counters = await recalculateEngine(engine.id, now);
  return Response.json({ counters });
}

async function saveUsage(payload: RecordPayload, engine: EngineRow, actorEmail: string, date: string) {
  if (["MINI", "OKJ"].includes(engine.family)) {
    return Response.json({ error: "This engine family does not use Oppama tracking" }, { status: 400 });
  }
  const oppamaMinutes = parseTime(payload.oppama ?? "");
  if (oppamaMinutes === null) {
    return Response.json({ error: "Oppama must use HH:MM and be greater than 00:00" }, { status: 400 });
  }

  const d1 = getD1();
  const id = crypto.randomUUID();
  const now = Date.now();
  const raceName = payload.raceName?.trim().slice(0, 120) ?? "";
  const driverName = payload.driverName?.trim().slice(0, 120) ?? "";
  const notes = payload.notes?.trim().slice(0, 1000) ?? "";

  await d1.batch([
    d1.prepare(`
      INSERT INTO engine_usage_logs (
        id, engine_id, entry_date, oppama_minutes, race_name, driver_name,
        notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, engine.id, date, oppamaMinutes, raceName, driverName, notes, actorEmail, now),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'log_usage', 'engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), actorEmail, engine.id, JSON.stringify({ recordId: id, date, oppamaMinutes, raceName, driverName }), now),
  ]);

  const counters = await recalculateEngine(engine.id, now);
  const usage = await getUsage(id, engine.id);
  return Response.json({ usage, counters }, { status: 201 });
}

async function saveService(payload: RecordPayload, engine: EngineRow, actorEmail: string, date: string) {
  const serviceType = payload.serviceType?.trim() ?? "";
  if (!serviceTypes.has(serviceType)) return Response.json({ error: "Invalid service type" }, { status: 400 });

  const replacedParts = cleanParts(payload.replacedParts);
  const pistonSize = payload.pistonSize?.trim() ?? "";
  if (!validatePistonSize(engine, replacedParts, pistonSize)) {
    return Response.json({ error: "Select a valid piston size" }, { status: 400 });
  }

  const d1 = getD1();
  const id = crypto.randomUUID();
  const now = Date.now();
  const notes = payload.notes?.trim().slice(0, 1000) ?? "";

  await d1.batch([
    d1.prepare(`
      INSERT INTO engine_service_entries (
        id, engine_id, service_date, service_type, replaced_parts, piston_size,
        notes, piston_minutes_before, rod_minutes_before, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).bind(id, engine.id, date, serviceType, JSON.stringify(replacedParts), pistonSize, notes, actorEmail, now),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'service', 'engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), actorEmail, engine.id, JSON.stringify({ recordId: id, date, serviceType, replacedParts, pistonSize }), now),
  ]);

  const counters = await recalculateEngine(engine.id, now);
  const saved = await getService(id, engine.id);
  return Response.json({ service: saved ? deserializeService(saved) : null, counters }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });

  let payload: RecordPayload;
  try {
    payload = (await request.json()) as RecordPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const engineId = payload.engineId?.trim() ?? "";
  const recordId = payload.recordId?.trim() ?? "";
  const date = payload.date?.trim() ?? "";
  if (!engineId || !recordId || !isDate(date)) return Response.json({ error: "Record and valid date are required" }, { status: 400 });

  await ensureRuntimeSchema();
  const engine = await getEngine(engineId);
  if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });
  if (payload.kind === "usage") return updateUsage(payload, engine, user.email, recordId, date);
  if (payload.kind === "service") return updateService(payload, engine, user.email, recordId, date);
  return Response.json({ error: "Invalid record type" }, { status: 400 });
}

async function updateUsage(payload: RecordPayload, engine: EngineRow, actorEmail: string, recordId: string, date: string) {
  if (["MINI", "OKJ"].includes(engine.family)) return Response.json({ error: "This engine family does not use Oppama tracking" }, { status: 400 });
  const existing = await getUsage(recordId, engine.id);
  if (!existing) return Response.json({ error: "Record not found" }, { status: 404 });
  const oppamaMinutes = parseTime(payload.oppama ?? "");
  if (oppamaMinutes === null) return Response.json({ error: "Oppama must use HH:MM and be greater than 00:00" }, { status: 400 });

  const raceName = payload.raceName?.trim().slice(0, 120) ?? "";
  const driverName = payload.driverName?.trim().slice(0, 120) ?? "";
  const notes = payload.notes?.trim().slice(0, 1000) ?? "";
  const now = Date.now();
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`
      UPDATE engine_usage_logs
      SET entry_date = ?, oppama_minutes = ?, race_name = ?, driver_name = ?, notes = ?
      WHERE id = ? AND engine_id = ?
    `).bind(date, oppamaMinutes, raceName, driverName, notes, recordId, engine.id),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'correct_usage', 'engine_usage', ?, ?, ?)
    `).bind(crypto.randomUUID(), actorEmail, recordId, JSON.stringify({ before: existing, after: { date, oppamaMinutes, raceName, driverName, notes } }), now),
  ]);

  const counters = await recalculateEngine(engine.id, now);
  const usage = await getUsage(recordId, engine.id);
  return Response.json({ usage, counters });
}

async function updateService(payload: RecordPayload, engine: EngineRow, actorEmail: string, recordId: string, date: string) {
  const existing = await getService(recordId, engine.id);
  if (!existing) return Response.json({ error: "Record not found" }, { status: 404 });
  const serviceType = payload.serviceType?.trim() ?? "";
  if (!serviceTypes.has(serviceType)) return Response.json({ error: "Invalid service type" }, { status: 400 });
  const replacedParts = cleanParts(payload.replacedParts);
  const pistonSize = payload.pistonSize?.trim() ?? "";
  if (!validatePistonSize(engine, replacedParts, pistonSize)) return Response.json({ error: "Select a valid piston size" }, { status: 400 });

  const notes = payload.notes?.trim().slice(0, 1000) ?? "";
  const now = Date.now();
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`
      UPDATE engine_service_entries
      SET service_date = ?, service_type = ?, replaced_parts = ?, piston_size = ?, notes = ?
      WHERE id = ? AND engine_id = ?
    `).bind(date, serviceType, JSON.stringify(replacedParts), pistonSize, notes, recordId, engine.id),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'correct_service', 'engine_service', ?, ?, ?)
    `).bind(crypto.randomUUID(), actorEmail, recordId, JSON.stringify({ before: deserializeService(existing), after: { date, serviceType, replacedParts, pistonSize, notes } }), now),
  ]);

  const counters = await recalculateEngine(engine.id, now);
  const saved = await getService(recordId, engine.id);
  return Response.json({ service: saved ? deserializeService(saved) : null, counters });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });

  let payload: Pick<RecordPayload, "kind" | "engineId" | "recordId">;
  try {
    payload = (await request.json()) as Pick<RecordPayload, "kind" | "engineId" | "recordId">;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const engineId = payload.engineId?.trim() ?? "";
  const recordId = payload.recordId?.trim() ?? "";
  if (!engineId || !recordId || !["usage", "service"].includes(payload.kind ?? "")) {
    return Response.json({ error: "Record is required" }, { status: 400 });
  }

  await ensureRuntimeSchema();
  const engine = await getEngine(engineId);
  if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });
  const existing = payload.kind === "usage" ? await getUsage(recordId, engineId) : await getService(recordId, engineId);
  if (!existing) return Response.json({ error: "Record not found" }, { status: 404 });

  const d1 = getD1();
  const now = Date.now();
  const table = payload.kind === "usage" ? "engine_usage_logs" : "engine_service_entries";
  await d1.batch([
    d1.prepare(`DELETE FROM ${table} WHERE id = ? AND engine_id = ?`).bind(recordId, engineId),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      user.email,
      payload.kind === "usage" ? "delete_usage" : "delete_service",
      payload.kind === "usage" ? "engine_usage" : "engine_service",
      recordId,
      JSON.stringify(payload.kind === "service" ? deserializeService(existing as ServiceRow) : existing),
      now,
    ),
  ]);

  const counters = await recalculateEngine(engineId, now);
  return Response.json({ id: recordId, kind: payload.kind, counters });
}
