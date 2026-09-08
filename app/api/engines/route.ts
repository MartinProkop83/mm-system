import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { applyMiniAutoService } from "../../engine-auto-service";

const allowedStatuses = new Set(["ready", "service_soon", "service", "rebuild", "storage", "retired"]);
const allowedFamilies = new Set(["MINI", "OKJ", "OKN", "OKN-J", "OK", "KZ"]);
const allowedIgnitions = new Set(["", "PVL", "SELETTRA"]);
const allowedMiniConfigurations = new Set(["MINI", "MINI 3", "MINI 4", "BABY", "BABY 3", "BABY 4"]);
const upgradePrefixes: Record<string, string> = {
  OKJ: "A",
  OK: "B",
  OKN: "C",
  "OKN-J": "C",
  KZ: "D",
  MINI: "E",
};

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
  // Dynamic-structure edit, keyed by engine_technical_fields.id — sent by the generated "Upravit
  // technické údaje" form once a family has a confirmed structure. Any of the 10 keys above that also
  // have a legacyKey are folded in automatically server-side, so a caller only needs to send this.
  technicalValues?: Record<string, string>;
};

const technicalFields = [
  "pistonSpec", "cylinderCode", "cylinderUpgrade", "liner", "degree",
  "timing", "carter", "reeds", "spacer", "squish",
] as const;

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

type EngineLoanRow = {
  engineId: string;
  recipientName: string;
  expectedReturnDate: string;
};

export type EngineLocation =
  | { kind: "race"; raceName: string }
  | { kind: "loan"; recipientName: string; expectedReturnDate: string; overdue: boolean }
  | { kind: "workshop" };

// If a race assignment and an active loan both exist for the same engine (should be prevented by the
// collision checks in race-planning/engine-loans, but old/inconsistent data could still have both), the
// race takes priority — the engine is physically needed at the track right now, which is more urgent
// and more likely to be the operationally correct state than a stale loan row.
function deriveEngineLocation(raceName: string | undefined, loan: EngineLoanRow | undefined, today: string): EngineLocation {
  if (raceName) return { kind: "race", raceName };
  if (loan) return { kind: "loan", recipientName: loan.recipientName, expectedReturnDate: loan.expectedReturnDate, overdue: loan.expectedReturnDate < today };
  return { kind: "workshop" };
}

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
  await applyMiniAutoService(d1);
  const [result, assignmentResult, loanResult, layoutResult, sectionResult, fieldResult, optionResult, valueResult] = await Promise.all([
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
      SELECT engine_id AS engineId, recipient_name_snapshot AS recipientName, expected_return_date AS expectedReturnDate
      FROM engine_loans WHERE actual_return_date IS NULL
    `).all<EngineLoanRow>(),
    // The configurable technical-data structure (see engine-technical-structure-panel.tsx). Loaded here,
    // alongside the engines list, so the engine card can render dynamically for a migrated family and
    // fall back to the fixed legacy layout for a family that hasn't gone through the migration draft yet.
    // Archived rows are excluded here on purpose — this is the display path, not the admin CRUD panel.
    d1.prepare("SELECT family, column_count AS columnCount FROM engine_technical_layout").all<{ family: string; columnCount: number }>(),
    d1.prepare("SELECT id, family, label_cs AS labelCs, label_en AS labelEn, sort_order AS sortOrder FROM engine_technical_sections WHERE archived_at IS NULL ORDER BY family, sort_order").all<{ id: string; family: string; labelCs: string; labelEn: string; sortOrder: number }>(),
    d1.prepare("SELECT id, section_id AS sectionId, label_cs AS labelCs, label_en AS labelEn, field_type AS fieldType, show_on_overview AS showOnOverview, sort_order AS sortOrder, legacy_key AS legacyKey FROM engine_technical_fields WHERE archived_at IS NULL ORDER BY section_id, sort_order").all<Record<string, unknown>>(),
    d1.prepare("SELECT id, field_id AS fieldId, value_cs AS valueCs, value_en AS valueEn, sort_order AS sortOrder FROM engine_technical_field_options WHERE archived_at IS NULL ORDER BY field_id, sort_order").all<{ id: string; fieldId: string; valueCs: string; valueEn: string; sortOrder: number }>(),
    d1.prepare("SELECT engine_id AS engineId, field_id AS fieldId, value FROM engine_technical_values").all<{ engineId: string; fieldId: string; value: string }>(),
  ]);

  const assignments = assignmentResult.results;
  const loansByEngine = new Map(loanResult.results.map((loan) => [loan.engineId, loan]));
  const today = localIsoDate(new Date());
  const engines = result.results.map((engine) => {
    const engineId = String(engine.id);
    const matches = assignments.filter((assignment) => [assignment.engine1Id, assignment.engine2Id, assignment.engine3Id].includes(engineId));
    const current = matches
      .filter((assignment) => assignment.raceStatus !== "completed" && assignment.endDate >= today)
      .sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
    const latest = current ?? matches.sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
    return {
      ...engine,
      assignedDriver: latest?.driverName ?? "",
      assignedRace: latest?.raceName ?? "",
      assignmentStatus: current ? "assigned" : latest ? "history" : "none",
      location: deriveEngineLocation(current?.raceName, loansByEngine.get(engineId), today),
    };
  });

  const technicalValues: Record<string, Record<string, string>> = {};
  for (const row of valueResult.results) {
    (technicalValues[row.engineId] ??= {})[row.fieldId] = row.value;
  }

  return Response.json({
    engines,
    technicalStructure: {
      layout: layoutResult.results,
      sections: sectionResult.results,
      fields: fieldResult.results.map((field) => ({ ...field, showOnOverview: Boolean(field.showOnOverview) })),
      options: optionResult.results,
    },
    technicalValues,
  });
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
    SELECT id, code, family, piston_spec AS pistonSpec, cylinder_code AS cylinderCode,
           cylinder_upgrade AS cylinderUpgrade, liner, degree, timing, carter, reeds, spacer, squish
    FROM engines WHERE id = ? AND archived_at IS NULL
  `).bind(payload.id).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Engine not found" }, { status: 404 });

  // Partial merge, not a blanket overwrite: the dynamic form (Krok 3) only sends `technicalValues` for a
  // migrated family, with none of the 10 legacy keys present — a naive "default missing keys to ''" here
  // would silently blank out the `engines` columns on every dynamic-form save. Only a key explicitly
  // present in the payload overwrites its column; everything else keeps its current value.
  const technical = {} as Record<(typeof technicalFields)[number], string>;
  for (const field of technicalFields) {
    technical[field] = payload[field] !== undefined ? (payload[field]?.trim().slice(0, 100) ?? "") : String(existing[field] ?? "");
  }

  // Fields belonging to this engine's family with a confirmed (non-archived) structure — used both to
  // fold `technicalValues` entries that have a legacyKey back into the flat columns above, and to
  // validate/write every entry (legacy-keyed or fully custom, e.g. a hand-added field) into
  // engine_technical_values. An id not in this set (wrong family, archived, or made up) is ignored rather
  // than erroring, since the dynamic form only ever sends ids it just rendered from this same list.
  const familyFields = await d1.prepare(`
    SELECT f.id AS fieldId, f.legacy_key AS legacyKey
    FROM engine_technical_fields f
    JOIN engine_technical_sections s ON s.id = f.section_id
    WHERE s.family = ? AND s.archived_at IS NULL AND f.archived_at IS NULL
  `).bind(existing.family).all<{ fieldId: string; legacyKey: keyof typeof technical | null }>();

  const valueWrites: Array<{ fieldId: string; value: string }> = [];
  if (payload.technicalValues && typeof payload.technicalValues === "object") {
    const validFields = new Map(familyFields.results.map((field) => [field.fieldId, field.legacyKey]));
    for (const [fieldId, rawValue] of Object.entries(payload.technicalValues)) {
      if (!validFields.has(fieldId)) continue;
      const value = String(rawValue ?? "").trim().slice(0, 100);
      valueWrites.push({ fieldId, value });
      const legacyKey = validFields.get(fieldId);
      if (legacyKey) technical[legacyKey] = value;
    }
  }

  const now = Date.now();
  const statements = [
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
  ];

  // Mirror the save into the configurable technical-structure values table (see
  // engine-technical-structure-panel.tsx): every legacy-keyed field gets the (possibly unchanged) merged
  // value above, so a plain legacy-shaped PATCH still stays in sync even without `technicalValues`.
  for (const field of familyFields.results) {
    if (!field.legacyKey) continue;
    statements.push(d1.prepare(`
      INSERT INTO engine_technical_values (id, engine_id, field_id, value, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(engine_id, field_id) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).bind(crypto.randomUUID(), payload.id, field.fieldId, technical[field.legacyKey] ?? "", user.email, now));
  }
  // Explicit `technicalValues` entries for fields with no legacyKey (hand-added, family-specific fields
  // like MINI's own section) — the loop above never touches these since they have no flat column to mirror.
  for (const write of valueWrites) {
    if (familyFields.results.find((field) => field.fieldId === write.fieldId)?.legacyKey) continue;
    statements.push(d1.prepare(`
      INSERT INTO engine_technical_values (id, engine_id, field_id, value, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(engine_id, field_id) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).bind(crypto.randomUUID(), payload.id, write.fieldId, write.value, user.email, now));
  }

  await d1.batch(statements);

  const writtenValues = Object.fromEntries(valueWrites.map((write) => [write.fieldId, write.value]));
  return Response.json({ id: payload.id, technical, technicalValues: writtenValues, updatedAt: now });
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
