import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

const allowedStatuses = new Set(["ready", "service_soon", "service", "rebuild", "storage", "retired"]);
const allowedFamilies = new Set(["MINI", "OKJ", "OKN", "OKN-J", "OK", "KZ"]);
const allowedIgnitions = new Set(["", "PVL", "SELETTRA"]);
const allowedMiniConfigurations = new Set(["MINI", "MINI 3", "MINI 4", "BABY", "BABY 3", "BABY 4"]);
type EnginePayload = {
  id?: string;
  code?: string;
  family?: string;
  ignition?: string;
  kzGeneration?: string | null;
  currentConfiguration?: string | null;
  upgradeCode?: string;
  labelColor?: string;
  purchaseDate?: string | null;
  status?: string;
  notes?: string;
  pistonSpec?: string;
  cylinderCode?: string;
  cylinderUpgrade?: string;
  liner?: string;
  degree?: string;
  timing?: string;
  carter?: string;
  reeds?: string;
  spacer?: string;
  squish?: string;
};

const technicalFields = [
  "pistonSpec", "cylinderCode", "cylinderUpgrade", "liner", "degree",
  "timing", "carter", "reeds", "spacer", "squish",
] as const;

function cleanTechnicalPayload(payload: EnginePayload) {
  const result: Record<(typeof technicalFields)[number], string> = {
    pistonSpec: "", cylinderCode: "", cylinderUpgrade: "", liner: "", degree: "",
    timing: "", carter: "", reeds: "", spacer: "", squish: "",
  };
  for (const field of technicalFields) result[field] = payload[field]?.trim().slice(0, 100) ?? "";
  return result;
}

function normalizeEnginePayload(payload: EnginePayload) {
  const code = payload.code?.trim().replace(/\s+/g, " ").toUpperCase() ?? "";
  const family = payload.family?.trim().toUpperCase() ?? "";
  const ignition = payload.ignition?.trim().toUpperCase() ?? "";
  const status = payload.status?.trim() || "ready";
  const kzGeneration = family === "KZ" ? payload.kzGeneration?.trim().toUpperCase() || null : null;
  const currentConfiguration = family === "MINI" ? payload.currentConfiguration?.trim().toUpperCase() || "MINI" : null;
  const upgradeCode = payload.upgradeCode?.trim().toUpperCase() ?? "";
  const labelColor = payload.labelColor?.trim().toUpperCase() ?? "";
  const purchaseDate = payload.purchaseDate?.trim() || null;
  const notes = payload.notes?.trim() ?? "";

  let error: string | null = null;
  if (!/^[\p{L}\p{N} ()/._+-]{2,24}$/u.test(code)) error = "Kód motoru musí mít 2–24 znaků; povolena jsou písmena, čísla, mezery, závorky, tečka, lomítko, podtržítko, plus a pomlčka.";
  else if (!allowedFamilies.has(family)) error = "Invalid engine family";
  else if (!allowedIgnitions.has(ignition)) error = "Invalid ignition";
  else if (!allowedStatuses.has(status)) error = "Invalid status";
  else if (family === "KZ" && !["R2", "R3"].includes(kzGeneration ?? "")) error = "KZ generation is required";
  else if (family === "MINI" && !allowedMiniConfigurations.has(currentConfiguration ?? "")) error = "Invalid MINI configuration";
  else if (upgradeCode && !/^[\p{L}\p{N} ()/._+*\-]{1,40}$/u.test(upgradeCode)) {
    error = "Úprava motoru může mít nejvýše 40 znaků; povolena jsou písmena, čísla, mezery, závorky, tečka, lomítko, +, *, _ a pomlčka.";
  }
  if (!error && labelColor && !/^#[0-9A-F]{6}$/.test(labelColor)) error = "Neplatná barva motoru";
  if (!error && purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) error = "Invalid purchase date";

  return { code, family, ignition, status, kzGeneration, currentConfiguration, upgradeCode, labelColor, purchaseDate, notes, error };
}

function engineCategoryScope(family: string, currentConfiguration: string | null) {
  if (family === "MINI") return currentConfiguration?.startsWith("BABY") ? "BABY" : "MINI";
  if (family === "OKN-J") return "OKN";
  return family;
}

type EngineAssignmentRow = {
  driverName: string;
  raceName: string;
  raceStatus: string;
  startDate: string;
  endDate: string;
  engine1Id: string | null;
  engine2Id: string | null;
  engine3Id: string | null;
};

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const [result, assignmentResult, rentalResult] = await Promise.all([
    d1.prepare(`
      SELECT id, code, category, family, ignition, kz_generation AS kzGeneration,
             current_configuration AS currentConfiguration, upgrade_code AS upgradeCode, label_color AS labelColor,
             purchase_date AS purchaseDate, status, total_minutes AS totalMinutes,
             piston_minutes AS pistonMinutes, rod_minutes AS rodMinutes,
             last_oppama_minutes AS lastOppamaMinutes, current_piston_size AS currentPistonSize,
             baseline_total_minutes AS baselineTotalMinutes,
             baseline_piston_minutes AS baselinePistonMinutes,
             baseline_rod_minutes AS baselineRodMinutes,
             baseline_last_oppama_minutes AS baselineLastOppamaMinutes,
             baseline_piston_size AS baselinePistonSize,
             piston_spec AS pistonSpec, cylinder_code AS cylinderCode,
             cylinder_upgrade AS cylinderUpgrade, liner, degree, timing, carter,
             reeds, spacer, squish, notes, sold_at AS soldAt, created_at AS createdAt, updated_at AS updatedAt
      FROM engines
      WHERE archived_at IS NULL
      ORDER BY code ASC
    `).all<Record<string, unknown>>(),
    d1.prepare(`
      SELECT e.driver_name_snapshot AS driverName, r.name AS raceName, r.status AS raceStatus,
             r.start_date AS startDate, r.end_date AS endDate,
             e.engine_1_id AS engine1Id, e.engine_2_id AS engine2Id, e.engine_3_id AS engine3Id
      FROM race_entries e JOIN races r ON r.id = e.race_id
      WHERE r.status != 'archived'
    `).all<EngineAssignmentRow>(),
    d1.prepare(`
      SELECT item.resource_id AS engineId, item.driver_name_snapshot AS driverName,
             r.id AS rentalId, r.rental_number AS rentalNumber,
             r.customer_name_snapshot AS rentalHolder, r.handover_date AS handoverDate,
             r.planned_return_date AS plannedReturnDate, r.status
      FROM equipment_rental_items item JOIN equipment_rentals r ON r.id = item.rental_id
      WHERE item.item_type = 'engine' AND item.resource_id IS NOT NULL
        AND item.returned_date IS NULL AND r.status NOT IN ('cancelled', 'returned')
    `).all<{ engineId: string; driverName: string; rentalId: string; rentalNumber: string; rentalHolder: string; handoverDate: string; plannedReturnDate: string; status: string }>(),
  ]);

  const assignments = assignmentResult.results;
  const today = localIsoDate(new Date());
  const engines = result.results.map((engine) => {
    const engineId = String(engine.id);
    const matches = assignments.filter((assignment) => [assignment.engine1Id, assignment.engine2Id, assignment.engine3Id].includes(engineId));
    const current = matches
      .filter((assignment) => assignment.raceStatus !== "completed" && assignment.endDate >= today)
      .sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
    const latest = current ?? matches.sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
    const currentRental = rentalResult.results.find((rental) => rental.engineId === engineId && rental.status !== "preparing")
      ?? rentalResult.results.find((rental) => rental.engineId === engineId);
    return {
      ...engine,
      assignedDriver: latest?.driverName ?? "",
      assignedRace: latest?.raceName ?? "",
      assignmentStatus: current ? "assigned" : latest ? "history" : "none",
      currentRental: currentRental ?? null,
    };
  });

  return Response.json({ engines });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });

  let payload: EnginePayload;
  try {
    payload = (await request.json()) as EnginePayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const normalized = normalizeEnginePayload(payload);
  if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
  const { code, family, ignition, status, kzGeneration, currentConfiguration, upgradeCode, labelColor, purchaseDate, notes } = normalized;
  const category = engineCategoryScope(family, currentConfiguration);

  await ensureRuntimeSchema();
  const d1 = getD1();
  const id = crypto.randomUUID();
  const now = Date.now();
  const duplicate = await d1.prepare("SELECT id FROM engines WHERE code = ? AND category = ? LIMIT 1").bind(code, category).first<{ id: string }>();
  if (duplicate) return Response.json({ error: "Engine code already exists in this category" }, { status: 409 });

  try {
    await d1.batch([
      d1.prepare(`
        INSERT INTO engines (
          id, code, serial_number, brand, model, category, family, ignition,
          kz_generation, current_configuration, upgrade_code, label_color, purchase_date,
          status, total_minutes, service_interval_minutes, notes, created_by,
          created_at, updated_at
        ) VALUES (?, ?, '', 'TM Racing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 360, ?, ?, ?, ?)
      `).bind(
        id,
        code,
        family,
        category,
        family,
        ignition,
        kzGeneration,
        currentConfiguration,
        upgradeCode,
        labelColor,
        purchaseDate,
        status,
        notes,
        user.email,
        now,
        now,
      ),
      d1.prepare(`
        INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, 'create', 'engine', ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        user.email,
        id,
        JSON.stringify({ code, category, family, ignition, kzGeneration, currentConfiguration, upgradeCode, labelColor }),
        now,
      ),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    if (message.includes("UNIQUE") || message.includes("unique")) {
      return Response.json({ error: "Engine code already exists in this category" }, { status: 409 });
    }
    return Response.json({ error: "Could not save engine" }, { status: 500 });
  }

  return Response.json({
    engine: {
      id,
      code,
      family,
      ignition,
      kzGeneration,
      currentConfiguration,
      upgradeCode,
      labelColor,
      purchaseDate,
      status,
      totalMinutes: 0,
      pistonMinutes: 0,
      rodMinutes: 0,
      lastOppamaMinutes: 0,
      currentPistonSize: "",
      baselineTotalMinutes: 0,
      baselinePistonMinutes: 0,
      baselineRodMinutes: 0,
      baselineLastOppamaMinutes: 0,
      baselinePistonSize: "",
      pistonSpec: "",
      cylinderCode: "",
      cylinderUpgrade: "",
      liner: "",
      degree: "",
      timing: "",
      carter: "",
      reeds: "",
      spacer: "",
      squish: "",
      notes,
      soldAt: null,
      createdAt: now,
      updatedAt: now,
    },
  }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });

  let payload: EnginePayload;
  try {
    payload = (await request.json()) as EnginePayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload.id) return Response.json({ error: "Engine id is required" }, { status: 400 });

  const normalized = normalizeEnginePayload(payload);
  if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
  const { code, family, ignition, status, kzGeneration, currentConfiguration, upgradeCode, labelColor, purchaseDate, notes } = normalized;
  const category = engineCategoryScope(family, currentConfiguration);

  await ensureRuntimeSchema();
  const d1 = getD1();
  const existing = await d1.prepare(`
    SELECT id, code, family, ignition, kz_generation AS kzGeneration,
           current_configuration AS currentConfiguration, upgrade_code AS upgradeCode, label_color AS labelColor,
           purchase_date AS purchaseDate, status, total_minutes AS totalMinutes,
           piston_minutes AS pistonMinutes, rod_minutes AS rodMinutes,
           last_oppama_minutes AS lastOppamaMinutes, current_piston_size AS currentPistonSize,
           baseline_total_minutes AS baselineTotalMinutes,
           baseline_piston_minutes AS baselinePistonMinutes,
           baseline_rod_minutes AS baselineRodMinutes,
           baseline_last_oppama_minutes AS baselineLastOppamaMinutes,
           baseline_piston_size AS baselinePistonSize,
           piston_spec AS pistonSpec, cylinder_code AS cylinderCode,
           cylinder_upgrade AS cylinderUpgrade, liner, degree, timing, carter,
           reeds, spacer, squish, notes, sold_at AS soldAt, created_at AS createdAt
    FROM engines
    WHERE id = ? AND archived_at IS NULL
  `).bind(payload.id).first<Record<string, unknown>>();

  if (!existing) return Response.json({ error: "Engine not found" }, { status: 404 });
  if (user.role !== "superadmin" && (existing.family !== family || existing.ignition !== ignition || (family === "KZ" && existing.kzGeneration !== kzGeneration))) {
    return Response.json({ error: "Permanent engine fields cannot be changed" }, { status: 400 });
  }

  const duplicate = await d1.prepare("SELECT id FROM engines WHERE code = ? AND category = ? AND id != ? LIMIT 1").bind(code, category, payload.id).first<{ id: string }>();
  if (duplicate) return Response.json({ error: "Engine code already exists in this category" }, { status: 409 });

  const now = Date.now();
  try {
    await d1.batch([
      d1.prepare(`
        UPDATE engines
        SET code = ?, model = ?, category = ?, family = ?, ignition = ?, kz_generation = ?,
            current_configuration = ?, upgrade_code = ?, label_color = ?, purchase_date = ?, status = ?, notes = ?, updated_at = ?
        WHERE id = ? AND archived_at IS NULL
      `).bind(code, family, category, family, ignition, kzGeneration, currentConfiguration, upgradeCode, labelColor, purchaseDate, status, notes, now, payload.id),
      d1.prepare(`
        INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, 'update', 'engine', ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        user.email,
        payload.id,
        JSON.stringify({ before: existing, after: { code, category, currentConfiguration, upgradeCode, labelColor, purchaseDate, status, notes } }),
        now,
      ),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    if (message.includes("UNIQUE") || message.includes("unique")) {
      return Response.json({ error: "Engine code already exists in this category" }, { status: 409 });
    }
    return Response.json({ error: "Could not update engine" }, { status: 500 });
  }

  return Response.json({
    engine: {
      id: payload.id,
      code,
      family,
      ignition,
      kzGeneration,
      currentConfiguration,
      upgradeCode,
      labelColor,
      purchaseDate,
      status,
      totalMinutes: Number(existing.totalMinutes ?? 0),
      pistonMinutes: Number(existing.pistonMinutes ?? 0),
      rodMinutes: Number(existing.rodMinutes ?? 0),
      lastOppamaMinutes: Number(existing.lastOppamaMinutes ?? 0),
      currentPistonSize: String(existing.currentPistonSize ?? ""),
      baselineTotalMinutes: Number(existing.baselineTotalMinutes ?? 0),
      baselinePistonMinutes: Number(existing.baselinePistonMinutes ?? 0),
      baselineRodMinutes: Number(existing.baselineRodMinutes ?? 0),
      baselineLastOppamaMinutes: Number(existing.baselineLastOppamaMinutes ?? 0),
      baselinePistonSize: String(existing.baselinePistonSize ?? ""),
      pistonSpec: String(existing.pistonSpec ?? ""),
      cylinderCode: String(existing.cylinderCode ?? ""),
      cylinderUpgrade: String(existing.cylinderUpgrade ?? ""),
      liner: String(existing.liner ?? ""),
      degree: String(existing.degree ?? ""),
      timing: String(existing.timing ?? ""),
      carter: String(existing.carter ?? ""),
      reeds: String(existing.reeds ?? ""),
      spacer: String(existing.spacer ?? ""),
      squish: String(existing.squish ?? ""),
      notes,
      createdAt: existing.createdAt,
      updatedAt: now,
    },
  });
}

export async function PATCH(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });

  let payload: EnginePayload;
  try {
    payload = (await request.json()) as EnginePayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload.id) return Response.json({ error: "Engine id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const existing = await d1.prepare(`
    SELECT id, code FROM engines WHERE id = ? AND archived_at IS NULL
  `).bind(payload.id).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Engine not found" }, { status: 404 });

  const technical = cleanTechnicalPayload(payload);
  const now = Date.now();
  await d1.batch([
    d1.prepare(`
      UPDATE engines
      SET piston_spec = ?, cylinder_code = ?, cylinder_upgrade = ?, liner = ?, degree = ?,
          timing = ?, carter = ?, reeds = ?, spacer = ?, squish = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
    `).bind(
      technical.pistonSpec, technical.cylinderCode, technical.cylinderUpgrade,
      technical.liner, technical.degree, technical.timing, technical.carter,
      technical.reeds, technical.spacer, technical.squish, now, payload.id,
    ),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'update_technical', 'engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), user.email, payload.id, JSON.stringify(technical), now),
  ]);

  return Response.json({ id: payload.id, technical, updatedAt: now });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });

  let payload: { id?: string };
  try {
    payload = (await request.json()) as { id?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload.id) return Response.json({ error: "Engine id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const existing = await d1.prepare(`
    SELECT id, code, family, status
    FROM engines
    WHERE id = ? AND archived_at IS NULL
  `).bind(payload.id).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Engine not found" }, { status: 404 });

  const now = Date.now();
  await d1.batch([
    d1.prepare(`
      UPDATE engines SET archived_at = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
    `).bind(now, now, payload.id),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'archive', 'engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), user.email, payload.id, JSON.stringify(existing), now),
  ]);

  return Response.json({ id: payload.id });
}
