import { getD1 } from "../db";

/**
 * Motohodiny motoru a přepočet počítadel.
 *
 * Bydlí to mimo routy, protože zapisovat motohodiny umí dvě místa: karta motoru
 * (`/api/engine-records`) a RACE MODE přímo na place (`/api/race-mode`). Dva opisy téhle
 * logiky by se dřív nebo později rozešly a počítadla pístu a ojnice by přestala sedět.
 */

type ServicePart = { id: string; cs: string; en: string };

// Single remaining hardcoded parts list — only for families NOT in DB_BACKED_SERVICE_PART_FAMILIES.
// Once a family's catalog moves into engine_service_part_catalog, remove it from here too.
const LEGACY_SERVICE_PARTS: ServicePart[] = [
  { id: "piston", cs: "Píst", en: "Piston" },
  { id: "oil_seals", cs: "Gufera", en: "Oil seals" },
  { id: "crank_bearings", cs: "Ložiska kliky", en: "Crank bearings" },
  { id: "connecting_rod", cs: "Kompletní ojnice", en: "Complete connecting rod" },
  { id: "upper_rod_cage", cs: "Horní klec ojnice", en: "Upper rod cage" },
  { id: "cylinder_gasket", cs: "Těsnění válce", en: "Cylinder gasket" },
  { id: "head_gasket", cs: "Těsnění hlavy", en: "Head gasket" },
];
const LEGACY_SERVICE_PART_IDS = new Set(LEGACY_SERVICE_PARTS.map((part) => part.id));

export { LEGACY_SERVICE_PARTS, LEGACY_SERVICE_PART_IDS };
export type { ServicePart };

export type EngineRow = {
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
  createdAt: number;
  updatedAt: number;
};

export type UsageRow = {
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

export type ServiceRow = {
  id: string;
  engineId: string;
  serviceDate: string;
  serviceType: string;
  replacedParts: string;
  replacedPartsSnapshot: string;
  pistonSize: string;
  notes: string;
  pistonMinutesBefore: number;
  rodMinutesBefore: number;
  mechanicId: string | null;
  mechanicName: string;
  createdBy: string;
  createdAt: number;
};

/** „HH:MM" na minuty. Bez `allowZero` odmítne i 00:00 — nulový zápis motohodin nedává smysl. */
export function parseTime(value: string, allowZero = false) {
  const match = value.trim().match(/^(\d{1,4}):([0-5]\d)$/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (!allowZero && minutes <= 0) return null;
  return minutes;
}

// Used only inside recalculateEngine, which (per NO_HOUR_TRACKING_ENGINE_FAMILIES) only ever
// runs for families still on the legacy hardcoded parts list — never for DB-backed families.
function cleanLegacyParts(parts: string[] | undefined) {
  return Array.from(new Set(parts ?? [])).filter((part) => LEGACY_SERVICE_PART_IDS.has(part));
}

export function deserializeService(row: ServiceRow) {
  let replacedParts: string[] = [];
  try {
    replacedParts = JSON.parse(row.replacedParts) as string[];
  } catch {
    replacedParts = [];
  }
  let replacedPartsSnapshot: Array<{ partKey: string; labelCs: string; labelEn: string }> = [];
  try {
    replacedPartsSnapshot = JSON.parse(row.replacedPartsSnapshot) as Array<{ partKey: string; labelCs: string; labelEn: string }>;
  } catch {
    replacedPartsSnapshot = [];
  }
  return { ...row, replacedParts, replacedPartsSnapshot };
}

export async function getEngine(engineId: string) {
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
           status, created_at AS createdAt, updated_at AS updatedAt
    FROM engines
    WHERE id = ? AND archived_at IS NULL
  `).bind(engineId).first<EngineRow>();
}

/**
 * Přepočte počítadla motoru od výchozího stavu přes všechny zápisy motohodin a servisy
 * seřazené v čase. Volá se po každém zápisu, opravě i smazání — proto se nikdy nerozejde
 * s tím, co je v historii.
 */
export async function recalculateEngine(engineId: string, now = Date.now()) {
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
             replaced_parts_snapshot AS replacedPartsSnapshot,
             piston_size AS pistonSize, notes,
             piston_minutes_before AS pistonMinutesBefore,
             rod_minutes_before AS rodMinutesBefore,
             mechanic_id AS mechanicId, mechanic_name_snapshot AS mechanicName,
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

    const parts = cleanLegacyParts(deserializeService(event.record).replacedParts);
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
