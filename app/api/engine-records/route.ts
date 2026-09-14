import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";
import { raceLogoUrl } from "../../race-logo";
import { NO_HOUR_TRACKING_ENGINE_FAMILIES, AUTO_READY_ON_SERVICE_ENGINE_FAMILIES, DB_BACKED_SERVICE_PART_FAMILIES } from "../../engine-family-rules";
import {
  LEGACY_SERVICE_PARTS, parseTime, deserializeService, getEngine, recalculateEngine,
  type ServicePart, type EngineRow, type UsageRow, type ServiceRow,
} from "../../engine-usage";

const familiesWithPistonSizes = new Set(["OKJ", "OKN", "OKN-J", "OK"]);
const serviceTypes = new Set(["inspection", "piston_service", "top_end", "full_service"]);


// Which list a given family's replaceable parts come from — DB catalog for families already
// migrated (DB_BACKED_SERVICE_PART_FAMILIES), the legacy hardcoded array for everyone else.
async function getServicePartsForFamily(d1: ReturnType<typeof getD1>, family: string): Promise<ServicePart[]> {
  if (!DB_BACKED_SERVICE_PART_FAMILIES.includes(family)) return LEGACY_SERVICE_PARTS;

  const catalog = await d1.prepare(`
    SELECT part_key AS id, label_cs AS cs, label_en AS en
    FROM engine_service_part_catalog
    WHERE family = ? AND archived_at IS NULL
    ORDER BY sort_order ASC
  `).bind(family).all<ServicePart>();
  return catalog.results;
}

/**
 * Nabídka rozměrů pístu pro danou rodinu. Dřív to byl natvrdo psaný seznam v tomhle souboru;
 * teď jsou rozměry variantami v katalogu materiálu (kategorie „Písty"), takže je superadmin
 * spravuje v Nastavení → Servisní karta → Materiál bez zásahu do kódu.
 *
 * Archivované varianty se nenabízejí, ale historie na ně dál odkazuje přes svůj snapshot.
 */
async function pistonSizesForFamily(d1: ReturnType<typeof getD1>, family: string): Promise<string[]> {
  const rows = await d1.prepare(`
    SELECT v.name
    FROM material_variants v
    JOIN material_categories m ON m.id = v.material_category_id
    JOIN engine_categories c ON c.id = m.engine_category_id
    WHERE c.code = ? AND m.name_en = 'Pistons' AND m.archived_at IS NULL AND v.archived_at IS NULL
    ORDER BY v.name
  `).bind(family).all<{ name: string }>();
  return rows.results.map((row) => row.name);
}

async function resolveMechanic(d1: ReturnType<typeof getD1>, mechanicId: string) {
  return d1.prepare("SELECT id, name FROM mechanics WHERE id = ? AND archived_at IS NULL").bind(mechanicId).first<{ id: string; name: string }>();
}


type EngineAuditRow = {
  id: string;
  action: string;
  details: string;
  createdAt: number;
};

type EngineAuditEntry =
  | { id: string; action: "create" | "archive" | "update_technical" | "set_engine_baseline"; isSystem: false; createdAt: number }
  | { id: string; action: "status_change"; isSystem: false; createdAt: number; fromStatus: string; toStatus: string }
  | { id: string; action: "engine_auto_service"; isSystem: true; createdAt: number; raceName: string }
  | { id: string; action: "service"; isSystem: false; createdAt: number; mechanicName: string; partsCount: number };

const AUDIT_ACTIONS_SHOWN = ["create", "archive", "update_technical", "set_engine_baseline", "engine_auto_service", "update", "service"];

function parseAuditDetails(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function toEngineAuditEntry(row: EngineAuditRow): EngineAuditEntry | null {
  if (row.action === "update") {
    const details = parseAuditDetails(row.details);
    const before = (details.before && typeof details.before === "object" ? details.before : {}) as Record<string, unknown>;
    const after = (details.after && typeof details.after === "object" ? details.after : {}) as Record<string, unknown>;
    const fromStatus = typeof before.status === "string" ? before.status : "";
    const toStatus = typeof after.status === "string" ? after.status : "";
    if (!fromStatus || !toStatus || fromStatus === toStatus) return null;
    return { id: row.id, action: "status_change", isSystem: false, createdAt: row.createdAt, fromStatus, toStatus };
  }
  if (row.action === "engine_auto_service") {
    const details = parseAuditDetails(row.details);
    const raceName = typeof details.raceName === "string" ? details.raceName : "";
    return { id: row.id, action: "engine_auto_service", isSystem: true, createdAt: row.createdAt, raceName };
  }
  if (row.action === "service") {
    const details = parseAuditDetails(row.details);
    const mechanicName = typeof details.mechanicName === "string" ? details.mechanicName : "";
    const replacedParts = Array.isArray(details.replacedParts) ? details.replacedParts : [];
    return { id: row.id, action: "service", isSystem: false, createdAt: row.createdAt, mechanicName, partsCount: replacedParts.length };
  }
  if (row.action === "create" || row.action === "archive" || row.action === "update_technical" || row.action === "set_engine_baseline") {
    return { id: row.id, action: row.action, isSystem: false, createdAt: row.createdAt };
  }
  return null;
}

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
  mechanicId?: string;
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


async function validatePistonSize(engine: EngineRow, replacedParts: string[], pistonSize: string) {
  const resetsPiston = replacedParts.includes("piston") || replacedParts.includes("connecting_rod");
  if (!resetsPiston || !familiesWithPistonSizes.has(engine.family)) return true;
  return (await pistonSizesForFamily(getD1(), engine.family)).includes(pistonSize);
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
           replaced_parts_snapshot AS replacedPartsSnapshot,
           piston_size AS pistonSize, notes,
           piston_minutes_before AS pistonMinutesBefore,
           rod_minutes_before AS rodMinutesBefore,
           mechanic_id AS mechanicId, mechanic_name_snapshot AS mechanicName,
           created_by AS createdBy, created_at AS createdAt
    FROM engine_service_entries
    WHERE id = ? AND engine_id = ?
  `).bind(recordId, engineId).first<ServiceRow>();
}


export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;

  const engineId = new URL(request.url).searchParams.get("engineId")?.trim() ?? "";
  if (!engineId) return Response.json({ error: "Engine id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const engine = await getEngine(engineId);
  if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });

  const d1 = getD1();
  const [usage, service, assignments, audit] = await Promise.all([
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
             replaced_parts AS replacedParts, replaced_parts_snapshot AS replacedPartsSnapshot,
             piston_size AS pistonSize, notes,
             piston_minutes_before AS pistonMinutesBefore,
             rod_minutes_before AS rodMinutesBefore,
             mechanic_id AS mechanicId, mechanic_name_snapshot AS mechanicName,
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
    d1.prepare(`
      SELECT id, action, details, created_at AS createdAt
      FROM audit_logs
      WHERE entity_type = 'engine' AND entity_id = ?
        AND action IN (${AUDIT_ACTIONS_SHOWN.map(() => "?").join(", ")})
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(engineId, ...AUDIT_ACTIONS_SHOWN).all<EngineAuditRow>(),
  ]);

  const auditEntries = audit.results
    .map(toEngineAuditEntry)
    .filter((entry): entry is EngineAuditEntry => entry !== null)
    .slice(0, 50);
  if (!auditEntries.some((entry) => entry.action === "create")) {
    auditEntries.push({ id: "fallback-create", action: "create", isSystem: false, createdAt: engine.createdAt });
    auditEntries.sort((left, right) => right.createdAt - left.createdAt);
  }

  const serviceParts = await getServicePartsForFamily(d1, engine.family);
  const pistonSizes = await pistonSizesForFamily(d1, engine.family);

  return Response.json({
    usage: usage.results,
    service: service.results.map(deserializeService),
    assignments: assignments.results.map((assignment) => ({
      ...assignment,
      logoUrl: raceLogoUrl(assignment.raceTemplateId, assignment.logoKey, assignment.logoUpdatedAt),
    })),
    audit: auditEntries,
    serviceParts,
    pistonSizes,
  });
}

export async function POST(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;

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
  if (NO_HOUR_TRACKING_ENGINE_FAMILIES.includes(engine.family)) {
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
  if (pistonSize && familiesWithPistonSizes.has(engine.family)) {
    const allowed = await pistonSizesForFamily(getD1(), engine.family);
    if (!allowed.includes(pistonSize)) return Response.json({ error: "Select a valid piston size" }, { status: 400 });
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
  if (NO_HOUR_TRACKING_ENGINE_FAMILIES.includes(engine.family)) {
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

/**
 * Kategorie přepnutá na novou servisní kartu (`engine_categories.service_card_migrated`) sem už
 * zapisovat nesmí — nový záznam ve staré tabulce by při dalším běhu přenosu historie vypadal
 * jako nepřenesený „starý" záznam a vznikl by duplikát. UI jí starý formulář nenabízí; tohle
 * je pojistka pro přímé volání endpointu.
 */
async function usesLegacyServiceCard(d1: ReturnType<typeof getD1>, family: string) {
  const category = await d1.prepare("SELECT service_card_migrated AS migrated FROM engine_categories WHERE code = ?")
    .bind(family).first<{ migrated: number }>();
  return !category?.migrated;
}

async function saveService(payload: RecordPayload, engine: EngineRow, actorEmail: string, date: string) {
  const serviceType = payload.serviceType?.trim() ?? "";
  if (!serviceTypes.has(serviceType)) return Response.json({ error: "Invalid service type" }, { status: 400 });

  const d1 = getD1();
  if (!await usesLegacyServiceCard(d1, engine.family)) {
    return Response.json({ error: "This category uses the new service card — use /api/service-records" }, { status: 400 });
  }

  const mechanicId = payload.mechanicId?.trim() ?? "";
  if (!mechanicId) return Response.json({ error: "Mechanic is required" }, { status: 400 });
  const mechanic = await resolveMechanic(d1, mechanicId);
  if (!mechanic) return Response.json({ error: "Mechanic not found" }, { status: 400 });

  const availableParts = await getServicePartsForFamily(d1, engine.family);
  const availablePartIds = new Set(availableParts.map((part) => part.id));
  const replacedParts = Array.from(new Set(payload.replacedParts ?? [])).filter((part) => availablePartIds.has(part));
  const replacedPartsSnapshot = replacedParts.map((partId) => {
    const part = availableParts.find((candidate) => candidate.id === partId)!;
    return { partKey: part.id, labelCs: part.cs, labelEn: part.en };
  });

  const pistonSize = payload.pistonSize?.trim() ?? "";
  if (!await validatePistonSize(engine, replacedParts, pistonSize)) {
    return Response.json({ error: "Select a valid piston size" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const notes = payload.notes?.trim().slice(0, 1000) ?? "";
  const autoReady = AUTO_READY_ON_SERVICE_ENGINE_FAMILIES.includes(engine.family);
  const skipHourRecalculation = NO_HOUR_TRACKING_ENGINE_FAMILIES.includes(engine.family);

  const statements = [
    d1.prepare(`
      INSERT INTO engine_service_entries (
        id, engine_id, service_date, service_type, replaced_parts, replaced_parts_snapshot, piston_size,
        notes, piston_minutes_before, rod_minutes_before, mechanic_id, mechanic_name_snapshot, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
    `).bind(id, engine.id, date, serviceType, JSON.stringify(replacedParts), JSON.stringify(replacedPartsSnapshot), pistonSize, notes, mechanic.id, mechanic.name, actorEmail, now),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'service', 'engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), actorEmail, engine.id, JSON.stringify({ recordId: id, date, serviceType, replacedParts, pistonSize, mechanicName: mechanic.name, autoReady }), now),
  ];
  if (autoReady) {
    statements.push(d1.prepare(`
      UPDATE engines SET status = 'ready', updated_at = ? WHERE id = ? AND archived_at IS NULL
    `).bind(now, engine.id));
  }
  await d1.batch(statements);
  // Zápis ze staré karty odbaví frontu stejně jako zápis z nové — jinak by motor po uložení
  // servisu zůstal ve frontě a mechanik by ho musel odklikávat ještě jednou.
  await resolveLegacyQueueForEngine(d1, engine.id, id, actorEmail, now);

  const counters = skipHourRecalculation ? await getEngine(engine.id) : await recalculateEngine(engine.id, now);
  const saved = await getService(id, engine.id);
  return Response.json({ service: saved ? deserializeService(saved) : null, counters }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
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
  if (NO_HOUR_TRACKING_ENGINE_FAMILIES.includes(engine.family)) return Response.json({ error: "This engine family does not use Oppama tracking" }, { status: 400 });
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

  const d1 = getD1();
  const mechanicId = payload.mechanicId?.trim() ?? "";
  if (!mechanicId) return Response.json({ error: "Mechanic is required" }, { status: 400 });
  const mechanic = await resolveMechanic(d1, mechanicId);
  if (!mechanic) return Response.json({ error: "Mechanic not found" }, { status: 400 });

  const availableParts = await getServicePartsForFamily(d1, engine.family);
  const availablePartIds = new Set(availableParts.map((part) => part.id));
  const replacedParts = Array.from(new Set(payload.replacedParts ?? [])).filter((part) => availablePartIds.has(part));
  const replacedPartsSnapshot = replacedParts.map((partId) => {
    const part = availableParts.find((candidate) => candidate.id === partId)!;
    return { partKey: part.id, labelCs: part.cs, labelEn: part.en };
  });

  const pistonSize = payload.pistonSize?.trim() ?? "";
  if (!await validatePistonSize(engine, replacedParts, pistonSize)) return Response.json({ error: "Select a valid piston size" }, { status: 400 });

  const notes = payload.notes?.trim().slice(0, 1000) ?? "";
  const now = Date.now();
  await d1.batch([
    d1.prepare(`
      UPDATE engine_service_entries
      SET service_date = ?, service_type = ?, replaced_parts = ?, replaced_parts_snapshot = ?, piston_size = ?, notes = ?,
          mechanic_id = ?, mechanic_name_snapshot = ?
      WHERE id = ? AND engine_id = ?
    `).bind(date, serviceType, JSON.stringify(replacedParts), JSON.stringify(replacedPartsSnapshot), pistonSize, notes, mechanic.id, mechanic.name, recordId, engine.id),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'correct_service', 'engine_service', ?, ?, ?)
    `).bind(crypto.randomUUID(), actorEmail, recordId, JSON.stringify({ before: deserializeService(existing), after: { date, serviceType, replacedParts, pistonSize, notes, mechanicName: mechanic.name } }), now),
  ]);

  const skipHourRecalculation = NO_HOUR_TRACKING_ENGINE_FAMILIES.includes(engine.family);
  const counters = skipHourRecalculation ? await getEngine(engine.id) : await recalculateEngine(engine.id, now);
  const saved = await getService(recordId, engine.id);
  return Response.json({ service: saved ? deserializeService(saved) : null, counters });
}

export async function DELETE(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
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

/**
 * Odbavení fronty starým servisním záznamem.
 *
 * Nová servisní karta to řeší v `app/api/service-records/route.ts`; kategorie, které na ni
 * ještě nepřešly, zapisují sem, a bez tohohle by motor po uložení servisu zůstal ve frontě.
 * Vyřízení míří na `legacy_entry_id`, protože `service_record_id` patří do `service_records`.
 */
async function resolveLegacyQueueForEngine(
  d1: ReturnType<typeof getD1>,
  engineId: string,
  legacyEntryId: string,
  actor: string,
  now: number,
) {
  const open = await d1.prepare(`
    SELECT 'race' AS sourceType, r.id AS sourceId
    FROM race_entries re
    JOIN races r ON r.id = re.race_id
    WHERE r.status != 'archived' AND r.end_date < date('now')
      AND ? IN (re.engine_1_id, re.engine_2_id, re.engine_3_id)
      -- Závod, na kterém motor „nejel", ve frontě nikdy nebyl, takže se ani neodbavuje.
      AND NOT EXISTS (SELECT 1 FROM race_engine_runs rr
                      WHERE rr.race_id = r.id AND rr.engine_id = ? AND rr.raced = 0)
      AND NOT EXISTS (SELECT 1 FROM engine_service_queue_resolutions q
                      WHERE q.engine_id = ? AND q.source_type = 'race' AND q.source_id = r.id)
    UNION
    SELECT 'loan', l.id
    FROM engine_loans l
    WHERE l.engine_id = ? AND l.actual_return_date IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM engine_service_queue_resolutions q
                      WHERE q.engine_id = ? AND q.source_type = 'loan' AND q.source_id = l.id)
    UNION
    SELECT 'manual', m.id
    FROM engine_service_queue_manual m
    WHERE m.engine_id = ?
      AND NOT EXISTS (SELECT 1 FROM engine_service_queue_resolutions q
                      WHERE q.engine_id = ? AND q.source_type = 'manual' AND q.source_id = m.id)
  `).bind(engineId, engineId, engineId, engineId, engineId, engineId, engineId).all<{ sourceType: string; sourceId: string }>();

  const statements = open.results.map((row) => d1.prepare(`
    INSERT INTO engine_service_queue_resolutions (id, engine_id, source_type, source_id, resolution, legacy_entry_id, resolved_by, resolved_at)
    VALUES (?, ?, ?, ?, 'serviced', ?, ?, ?)
    ON CONFLICT (engine_id, source_type, source_id) DO NOTHING
  `).bind(crypto.randomUUID(), engineId, row.sourceType, row.sourceId, legacyEntryId, actor, now));

  // Servis je zapsaný, takže označení rozpracovaného motoru padá stejně jako u nové karty.
  statements.push(d1.prepare(
    "UPDATE engine_service_claims SET released_at = ?, released_by = ?, release_reason = 'service' WHERE engine_id = ? AND released_at IS NULL",
  ).bind(now, actor, engineId));

  for (let offset = 0; offset < statements.length; offset += 50) {
    await d1.batch(statements.slice(offset, offset + 50));
  }
}
