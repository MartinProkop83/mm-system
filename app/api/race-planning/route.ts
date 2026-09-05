import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser, type AppUser } from "../../server-auth";

const categories = new Set(["BABY", "MINI", "MINI U10", "MINI GR3", "OKJ", "OKN-J", "OKN", "OK", "KZ"]);
type PlanningKind = "entry" | "mechanic" | "vehicle" | "extra" | "confirmation";

type RaceRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  departureDate: string;
  returnDate: string;
  status: string;
};

type PlanningPayload = {
  kind?: PlanningKind;
  id?: string;
  raceId?: string;
  category?: string;
  driverId?: string;
  engineIds?: Array<string | null>;
  carburetorIds?: Array<string | null>;
  mechanicId?: string;
  vehicleId?: string;
  resourceType?: "engine" | "carburetor";
  resourceId?: string;
  notes?: string;
  isConfirmed?: boolean | number | string;
};

function clean(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

async function getRace(raceId: string) {
  return getD1().prepare(`
    SELECT id, name, start_date AS startDate, end_date AS endDate,
           departure_date AS departureDate, return_date AS returnDate, status
    FROM races WHERE id = ? AND status != 'archived'
  `).bind(raceId).first<RaceRow>();
}

function intervalsOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

async function assertWritable(race: RaceRow, user: AppUser) {
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
  const d1 = getD1();
  const [entries, mechanics, vehicles, extras, equipmentAssignments] = await Promise.all([
    d1.prepare(`SELECT id, category, driver_id AS driverId, driver_name_snapshot AS driverName, team_id AS teamId, team_name_snapshot AS teamName, engine_1_id AS engine1Id, engine_1_code AS engine1Code, engine_1_configuration AS engine1Configuration, engine_2_id AS engine2Id, engine_2_code AS engine2Code, engine_2_configuration AS engine2Configuration, engine_3_id AS engine3Id, engine_3_code AS engine3Code, engine_3_configuration AS engine3Configuration, carburetor_1_id AS carburetor1Id, carburetor_1_code AS carburetor1Code, carburetor_2_id AS carburetor2Id, carburetor_2_code AS carburetor2Code, carburetor_3_id AS carburetor3Id, carburetor_3_code AS carburetor3Code, is_confirmed AS isConfirmed, notes FROM race_entries WHERE race_id = ? ORDER BY category, driver_name_snapshot`).bind(raceId).all(),
    d1.prepare("SELECT id, mechanic_id AS mechanicId, mechanic_name_snapshot AS mechanicName, vehicle_id AS vehicleId FROM race_mechanics WHERE race_id = ? ORDER BY mechanic_name_snapshot").bind(raceId).all(),
    d1.prepare("SELECT id, vehicle_id AS vehicleId, vehicle_name_snapshot AS vehicleName, license_plate_snapshot AS licensePlate FROM race_vehicles WHERE race_id = ? ORDER BY vehicle_name_snapshot").bind(raceId).all(),
    d1.prepare("SELECT id, category, resource_type AS resourceType, resource_id AS resourceId, resource_code_snapshot AS resourceCode, notes FROM race_extras WHERE race_id = ? ORDER BY category, resource_type, resource_code_snapshot").bind(raceId).all(),
    loadEquipmentAssignments(),
  ]);
  const normalizedEntries = entries.results.map((entry) => ({ ...entry, isConfirmed: Boolean(entry.isConfirmed) }));
  return Response.json({ race, entries: normalizedEntries, mechanics: mechanics.results, vehicles: vehicles.results, extras: extras.results, equipmentAssignments });
}

async function loadEquipmentAssignments() {
  const d1 = getD1();
  const slots = [
    { resourceType: "engine", column: "engine_1_id" },
    { resourceType: "engine", column: "engine_2_id" },
    { resourceType: "engine", column: "engine_3_id" },
    { resourceType: "carburetor", column: "carburetor_1_id" },
    { resourceType: "carburetor", column: "carburetor_2_id" },
    { resourceType: "carburetor", column: "carburetor_3_id" },
  ] as const;
  const [slotResults, extraResults] = await Promise.all([
    Promise.all(slots.map((slot) => d1.prepare(`
      SELECT '${slot.resourceType}' AS resourceType, e.${slot.column} AS resourceId, e.id AS entryId,
             e.driver_name_snapshot AS driverName, r.id AS raceId, r.name AS raceName,
             r.start_date AS startDate, r.end_date AS endDate, r.status AS raceStatus, 0 AS isExtra
      FROM race_entries e JOIN races r ON r.id = e.race_id
      WHERE e.${slot.column} IS NOT NULL AND r.status != 'archived'
    `).all())),
    d1.prepare(`
      SELECT x.resource_type AS resourceType, x.resource_id AS resourceId, x.id AS entryId,
             '' AS driverName, r.id AS raceId, r.name AS raceName,
             r.start_date AS startDate, r.end_date AS endDate, r.status AS raceStatus, 1 AS isExtra
      FROM race_extras x JOIN races r ON r.id = x.race_id
      WHERE r.status != 'archived'
    `).all(),
  ]);
  return [...slotResults.flatMap((result) => result.results), ...extraResults.results];
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  const raceId = clean(payload.raceId);
  if (!raceId) return Response.json({ error: "Race id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const race = await getRace(raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const writeError = await assertWritable(race, user);
  if (writeError) return Response.json({ error: writeError }, { status: 403 });
  if (payload.kind === "entry") return saveEntry(payload, race, user, false);
  if (payload.kind === "mechanic") return addMechanic(payload, race, user);
  if (payload.kind === "vehicle") return addVehicle(payload, race, user);
  if (payload.kind === "extra") return addExtra(payload, race, user);
  return Response.json({ error: "Invalid planning type" }, { status: 400 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  if (!["entry", "confirmation", "mechanic"].includes(payload.kind ?? "") || !payload.id) return Response.json({ error: "Entry id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const race = await getRace(clean(payload.raceId));
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const writeError = await assertWritable(race, user);
  if (writeError) return Response.json({ error: writeError }, { status: 403 });
  if (payload.kind === "confirmation") return updateConfirmation(payload, race, user);
  if (payload.kind === "mechanic") return updateMechanicVehicle(payload, race, user);
  return saveEntry(payload, race, user, true);
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  const race = await getRace(clean(payload.raceId));
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const writeError = await assertWritable(race, user);
  if (writeError) return Response.json({ error: writeError }, { status: 403 });
  if (!payload.id || !payload.kind) return Response.json({ error: "Planning item is required" }, { status: 400 });
  const table = ({ entry: "race_entries", mechanic: "race_mechanics", vehicle: "race_vehicles", extra: "race_extras" } as const)[payload.kind as Exclude<PlanningKind, "confirmation">];
  if (!table) return Response.json({ error: "Invalid planning type" }, { status: 400 });
  const d1 = getD1();
  const existing = await d1.prepare(`SELECT * FROM ${table} WHERE id = ? AND race_id = ?`).bind(payload.id, race.id).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Planning item not found" }, { status: 404 });
  const now = Date.now();
  await d1.batch([
    d1.prepare(`DELETE FROM ${table} WHERE id = ? AND race_id = ?`).bind(payload.id, race.id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'remove_from_race', ?, ?, ?, ?)").bind(crypto.randomUUID(), user.email, payload.kind, payload.id, JSON.stringify(existing), now),
  ]);
  return Response.json({ id: payload.id });
}

async function saveEntry(payload: PlanningPayload, race: RaceRow, user: AppUser, editing: boolean) {
  const category = clean(payload.category);
  const driverId = clean(payload.driverId);
  if (!categories.has(category) || !driverId) return Response.json({ error: "Driver and category are required" }, { status: 400 });
  const d1 = getD1();
  const categoryExists = await d1.prepare("SELECT id FROM race_categories WHERE race_id = ? AND category = ?").bind(race.id, category).first();
  if (!categoryExists) return Response.json({ error: "Category is not enabled for this race" }, { status: 400 });
  const existingId = editing ? clean(payload.id) : "";
  const existingEntry = editing ? await d1.prepare("SELECT id, driver_id AS driverId, is_confirmed AS isConfirmed FROM race_entries WHERE id = ? AND race_id = ?").bind(existingId, race.id).first<{ id: string; driverId: string; isConfirmed: number }>() : null;
  if (editing && !existingEntry) return Response.json({ error: "Entry not found" }, { status: 404 });
  const driver = await d1.prepare(`SELECT d.id, d.name, d.team_id AS teamId, COALESCE(t.name, '') AS teamName, d.is_active AS isActive FROM drivers d LEFT JOIN teams t ON t.id = d.team_id WHERE d.id = ? AND d.archived_at IS NULL`).bind(driverId).first<{ id: string; name: string; teamId: string | null; teamName: string; isActive: number }>();
  if (!driver) return Response.json({ error: "Driver not found" }, { status: 404 });
  if (!driver.isActive && existingEntry?.driverId !== driverId) return Response.json({ error: "Driver is inactive" }, { status: 409 });

  const engineSlots = normalizeSlots(payload.engineIds);
  const carburetorSlots = normalizeSlots(payload.carburetorIds);
  const engineIds = engineSlots.filter(Boolean) as string[];
  const carburetorIds = carburetorSlots.filter(Boolean) as string[];
  if (new Set(engineIds).size !== engineIds.length || new Set(carburetorIds).size !== carburetorIds.length) return Response.json({ error: "A resource cannot be selected twice" }, { status: 409 });

  const driverConflict = await findDriverConflict(driverId, race, existingId);
  if (driverConflict) return Response.json({ error: driverConflict }, { status: 409 });
  const engines = new Map<string, { id: string; code: string; currentConfiguration: string }>();
  for (const engineId of engineIds) {
    const engine = await d1.prepare("SELECT id, code, family, current_configuration AS currentConfiguration FROM engines WHERE id = ? AND archived_at IS NULL AND sold_at IS NULL").bind(engineId).first<{ id: string; code: string; family: string; currentConfiguration: string }>();
    if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });
    if (!engineMatchesCategory(engine.family, category)) return Response.json({ error: `${engine.code} is not compatible with ${category}` }, { status: 409 });
    const conflict = await findEquipmentConflict("engine", engine.id, race, existingId);
    if (conflict) return Response.json({ error: conflict }, { status: 409 });
    engines.set(engine.id, engine);
  }
  const carburetors = new Map<string, { id: string; code: string }>();
  for (const carburetorId of carburetorIds) {
    const carburetor = await d1.prepare("SELECT id, code, family FROM carburetors WHERE id = ? AND archived_at IS NULL AND sold_at IS NULL AND status != 'retired'").bind(carburetorId).first<{ id: string; code: string; family: string }>();
    if (!carburetor) return Response.json({ error: "Carburetor not found" }, { status: 404 });
    if (!carburetorMatchesCategory(carburetor.family, category)) return Response.json({ error: `${carburetor.code} is not compatible with ${category}` }, { status: 409 });
    const conflict = await findEquipmentConflict("carburetor", carburetor.id, race, existingId);
    if (conflict) return Response.json({ error: conflict }, { status: 409 });
    carburetors.set(carburetor.id, carburetor);
  }

  const id = existingId || crypto.randomUUID();
  const now = Date.now();
  const notes = clean(payload.notes);
  const isConfirmed = payload.isConfirmed === undefined && existingEntry ? Boolean(existingEntry.isConfirmed) : parseBoolean(payload.isConfirmed);
  const values = {
    engine1: engineSlots[0] ? engines.get(engineSlots[0]!) ?? null : null,
    engine2: engineSlots[1] ? engines.get(engineSlots[1]!) ?? null : null,
    engine3: engineSlots[2] ? engines.get(engineSlots[2]!) ?? null : null,
    carb1: carburetorSlots[0] ? carburetors.get(carburetorSlots[0]!) ?? null : null,
    carb2: carburetorSlots[1] ? carburetors.get(carburetorSlots[1]!) ?? null : null,
    carb3: carburetorSlots[2] ? carburetors.get(carburetorSlots[2]!) ?? null : null,
  };
  const statement = editing
    ? d1.prepare(`UPDATE race_entries SET category = ?, driver_id = ?, driver_name_snapshot = ?, team_id = ?, team_name_snapshot = ?, engine_1_id = ?, engine_1_code = ?, engine_1_configuration = ?, engine_2_id = ?, engine_2_code = ?, engine_2_configuration = ?, engine_3_id = ?, engine_3_code = ?, engine_3_configuration = ?, carburetor_1_id = ?, carburetor_1_code = ?, carburetor_2_id = ?, carburetor_2_code = ?, carburetor_3_id = ?, carburetor_3_code = ?, is_confirmed = ?, notes = ?, updated_at = ? WHERE id = ? AND race_id = ?`).bind(category, driver.id, driver.name, driver.teamId, driver.teamName, values.engine1?.id ?? null, values.engine1?.code ?? "", values.engine1?.currentConfiguration ?? "", values.engine2?.id ?? null, values.engine2?.code ?? "", values.engine2?.currentConfiguration ?? "", values.engine3?.id ?? null, values.engine3?.code ?? "", values.engine3?.currentConfiguration ?? "", values.carb1?.id ?? null, values.carb1?.code ?? "", values.carb2?.id ?? null, values.carb2?.code ?? "", values.carb3?.id ?? null, values.carb3?.code ?? "", isConfirmed ? 1 : 0, notes, now, id, race.id)
    : d1.prepare(`INSERT INTO race_entries (id, race_id, category, driver_id, driver_name_snapshot, team_id, team_name_snapshot, engine_1_id, engine_1_code, engine_1_configuration, engine_2_id, engine_2_code, engine_2_configuration, engine_3_id, engine_3_code, engine_3_configuration, carburetor_1_id, carburetor_1_code, carburetor_2_id, carburetor_2_code, carburetor_3_id, carburetor_3_code, is_confirmed, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, race.id, category, driver.id, driver.name, driver.teamId, driver.teamName, values.engine1?.id ?? null, values.engine1?.code ?? "", values.engine1?.currentConfiguration ?? "", values.engine2?.id ?? null, values.engine2?.code ?? "", values.engine2?.currentConfiguration ?? "", values.engine3?.id ?? null, values.engine3?.code ?? "", values.engine3?.currentConfiguration ?? "", values.carb1?.id ?? null, values.carb1?.code ?? "", values.carb2?.id ?? null, values.carb2?.code ?? "", values.carb3?.id ?? null, values.carb3?.code ?? "", isConfirmed ? 1 : 0, notes, user.email, now, now);
  await d1.batch([
    statement,
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, 'race_entry', ?, ?, ?)").bind(crypto.randomUUID(), user.email, editing ? "update" : "create", id, JSON.stringify({ raceId: race.id, raceName: race.name, category, driverId, driverName: driver.name, engineIds, carburetorIds }), now),
  ]);
  return Response.json({ id }, { status: editing ? 200 : 201 });
}

async function updateConfirmation(payload: PlanningPayload, race: RaceRow, user: AppUser) {
  const id = clean(payload.id);
  const entry = await getD1().prepare("SELECT id, driver_name_snapshot AS driverName FROM race_entries WHERE id = ? AND race_id = ?").bind(id, race.id).first<{ id: string; driverName: string }>();
  if (!entry) return Response.json({ error: "Entry not found" }, { status: 404 });
  const isConfirmed = parseBoolean(payload.isConfirmed);
  const now = Date.now();
  const d1 = getD1();
  await d1.batch([
    d1.prepare("UPDATE race_entries SET is_confirmed = ?, updated_at = ? WHERE id = ? AND race_id = ?").bind(isConfirmed ? 1 : 0, now, id, race.id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, 'race_entry', ?, ?, ?)").bind(crypto.randomUUID(), user.email, isConfirmed ? "confirm" : "unconfirm", id, JSON.stringify({ raceId: race.id, raceName: race.name, driverName: entry.driverName, isConfirmed }), now),
  ]);
  return Response.json({ id, isConfirmed });
}

function parseBoolean(value: PlanningPayload["isConfirmed"]) {
  return value === true || value === 1 || value === "1" || value === "true";
}

async function resolveRaceVehicle(vehicleId: string, race: RaceRow) {
  if (!vehicleId) return null;
  return getD1().prepare("SELECT vehicle_id AS vehicleId FROM race_vehicles WHERE race_id = ? AND vehicle_id = ?").bind(race.id, vehicleId).first<{ vehicleId: string }>();
}

async function addMechanic(payload: PlanningPayload, race: RaceRow, user: AppUser) {
  const mechanicId = clean(payload.mechanicId);
  const mechanic = await getD1().prepare("SELECT id, name FROM mechanics WHERE id = ? AND archived_at IS NULL").bind(mechanicId).first<{ id: string; name: string }>();
  if (!mechanic) return Response.json({ error: "Mechanic not found" }, { status: 404 });
  const conflict = await findTravelConflict("mechanic", mechanic.id, race);
  if (conflict) return Response.json({ error: conflict }, { status: 409 });
  const requestedVehicleId = clean(payload.vehicleId);
  const vehicle = requestedVehicleId ? await resolveRaceVehicle(requestedVehicleId, race) : null;
  const id = crypto.randomUUID();
  const now = Date.now();
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare("INSERT INTO race_mechanics (id, race_id, mechanic_id, mechanic_name_snapshot, vehicle_id) VALUES (?, ?, ?, ?, ?)").bind(id, race.id, mechanic.id, mechanic.name, vehicle?.vehicleId ?? null),
      d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'assign', 'race_mechanic', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify({ raceId: race.id, raceName: race.name, mechanicId, mechanicName: mechanic.name, vehicleId: vehicle?.vehicleId ?? null }), now),
    ]);
  } catch {
    return Response.json({ error: "Mechanic is already assigned to this race" }, { status: 409 });
  }
  return Response.json({ id }, { status: 201 });
}

async function updateMechanicVehicle(payload: PlanningPayload, race: RaceRow, user: AppUser) {
  const id = clean(payload.id);
  const existing = await getD1().prepare("SELECT id, mechanic_name_snapshot AS mechanicName FROM race_mechanics WHERE id = ? AND race_id = ?").bind(id, race.id).first<{ id: string; mechanicName: string }>();
  if (!existing) return Response.json({ error: "Mechanic assignment not found" }, { status: 404 });
  const requestedVehicleId = clean(payload.vehicleId);
  const vehicle = requestedVehicleId ? await resolveRaceVehicle(requestedVehicleId, race) : null;
  if (requestedVehicleId && !vehicle) return Response.json({ error: "Vehicle is not assigned to this race" }, { status: 400 });
  const now = Date.now();
  const d1 = getD1();
  await d1.batch([
    d1.prepare("UPDATE race_mechanics SET vehicle_id = ? WHERE id = ? AND race_id = ?").bind(vehicle?.vehicleId ?? null, id, race.id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'update', 'race_mechanic', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify({ raceId: race.id, raceName: race.name, mechanicName: existing.mechanicName, vehicleId: vehicle?.vehicleId ?? null }), now),
  ]);
  return Response.json({ id, vehicleId: vehicle?.vehicleId ?? null });
}

async function addVehicle(payload: PlanningPayload, race: RaceRow, user: AppUser) {
  const vehicleId = clean(payload.vehicleId);
  const vehicle = await getD1().prepare("SELECT id, name, license_plate AS licensePlate FROM vehicles WHERE id = ? AND archived_at IS NULL").bind(vehicleId).first<{ id: string; name: string; licensePlate: string }>();
  if (!vehicle) return Response.json({ error: "Vehicle not found" }, { status: 404 });
  const conflict = await findTravelConflict("vehicle", vehicle.id, race);
  if (conflict) return Response.json({ error: conflict }, { status: 409 });
  const id = crypto.randomUUID();
  const now = Date.now();
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare("INSERT INTO race_vehicles (id, race_id, vehicle_id, vehicle_name_snapshot, license_plate_snapshot) VALUES (?, ?, ?, ?, ?)").bind(id, race.id, vehicle.id, vehicle.name, vehicle.licensePlate),
      d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'assign', 'race_vehicle', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify({ raceId: race.id, raceName: race.name, vehicleId, vehicleName: vehicle.name }), now),
    ]);
  } catch {
    return Response.json({ error: "Vehicle is already assigned to this race" }, { status: 409 });
  }
  return Response.json({ id }, { status: 201 });
}

async function addExtra(payload: PlanningPayload, race: RaceRow, user: AppUser) {
  const category = clean(payload.category);
  const resourceType = payload.resourceType;
  const resourceId = clean(payload.resourceId);
  if (!categories.has(category) || !resourceId || !["engine", "carburetor"].includes(resourceType ?? "")) return Response.json({ error: "Category and extra resource are required" }, { status: 400 });
  const d1 = getD1();
  const categoryExists = await d1.prepare("SELECT id FROM race_categories WHERE race_id = ? AND category = ?").bind(race.id, category).first();
  if (!categoryExists) return Response.json({ error: "Category is not enabled for this race" }, { status: 400 });
  const table = resourceType === "engine" ? "engines" : "carburetors";
  const resource = await d1.prepare(`SELECT id, code, family FROM ${table} WHERE id = ? AND archived_at IS NULL AND sold_at IS NULL`).bind(resourceId).first<{ id: string; code: string; family: string }>();
  if (!resource) return Response.json({ error: `${resourceType} not found` }, { status: 404 });
  const matches = resourceType === "engine" ? engineMatchesCategory(resource.family, category) : carburetorMatchesCategory(resource.family, category);
  if (!matches) return Response.json({ error: `${resource.code} is not compatible with ${category}` }, { status: 409 });
  const conflict = await findEquipmentConflict(resourceType!, resource.id, race, "");
  if (conflict) return Response.json({ error: conflict }, { status: 409 });
  const id = crypto.randomUUID();
  const now = Date.now();
  await d1.batch([
    d1.prepare("INSERT INTO race_extras (id, race_id, category, resource_type, resource_id, resource_code_snapshot, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, race.id, category, resourceType, resource.id, resource.code, clean(payload.notes), user.email, now),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'assign', 'race_extra', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify({ raceId: race.id, raceName: race.name, category, resourceType, resourceId, code: resource.code }), now),
  ]);
  return Response.json({ id }, { status: 201 });
}

function normalizeSlots(values: Array<string | null> | undefined) {
  return [0, 1, 2].map((index) => clean(values?.[index]));
}

function engineMatchesCategory(family: string, category: string) {
  if (["BABY", "MINI", "MINI U10", "MINI GR3"].includes(category)) return family === "MINI";
  return family === category;
}

function carburetorMatchesCategory(family: string, category: string) {
  if (["MINI", "MINI U10", "MINI GR3"].includes(category)) return family === "MINI";
  if (["OKN-J", "OKN"].includes(category)) return family === "OKN";
  return family === category;
}

async function findDriverConflict(driverId: string, target: RaceRow, excludeEntryId: string) {
  const rows = await getD1().prepare(`SELECT e.id, r.id AS raceId, r.name, r.start_date AS startDate, r.end_date AS endDate FROM race_entries e JOIN races r ON r.id = e.race_id WHERE e.driver_id = ? AND e.id != ? AND r.status != 'archived'`).bind(driverId, excludeEntryId).all<{ id: string; raceId: string; name: string; startDate: string; endDate: string }>();
  const conflict = rows.results.find((row: { raceId: string; startDate: string; endDate: string }) => row.raceId === target.id || intervalsOverlap(row.startDate, row.endDate, target.startDate, target.endDate));
  return conflict ? `Driver is already assigned to ${conflict.name}` : "";
}

async function findEquipmentConflict(type: "engine" | "carburetor", resourceId: string, target: RaceRow, excludeEntryId: string) {
  const d1 = getD1();
  const prefix = type === "engine" ? "engine" : "carburetor";
  const rows = await d1.prepare(`SELECT e.id, r.id AS raceId, r.name, r.start_date AS startDate, r.end_date AS endDate FROM race_entries e JOIN races r ON r.id = e.race_id WHERE (e.${prefix}_1_id = ? OR e.${prefix}_2_id = ? OR e.${prefix}_3_id = ?) AND e.id != ? AND r.status != 'archived'`).bind(resourceId, resourceId, resourceId, excludeEntryId).all<{ id: string; raceId: string; name: string; startDate: string; endDate: string }>();
  const extras = await d1.prepare(`SELECT x.id, r.id AS raceId, r.name, r.start_date AS startDate, r.end_date AS endDate FROM race_extras x JOIN races r ON r.id = x.race_id WHERE x.resource_type = ? AND x.resource_id = ? AND r.status != 'archived'`).bind(type, resourceId).all<{ id: string; raceId: string; name: string; startDate: string; endDate: string }>();
  const conflict = [...rows.results, ...extras.results].find((row: { raceId: string; startDate: string; endDate: string }) => row.raceId === target.id || intervalsOverlap(row.startDate, row.endDate, target.startDate, target.endDate));
  return conflict ? `${type === "engine" ? "Engine" : "Carburetor"} is already assigned to ${conflict.name}` : "";
}

async function findTravelConflict(type: "mechanic" | "vehicle", resourceId: string, target: RaceRow) {
  const table = type === "mechanic" ? "race_mechanics" : "race_vehicles";
  const column = type === "mechanic" ? "mechanic_id" : "vehicle_id";
  const rows = await getD1().prepare(`SELECT r.id AS raceId, r.name, r.departure_date AS departureDate, r.return_date AS returnDate FROM ${table} x JOIN races r ON r.id = x.race_id WHERE x.${column} = ? AND r.status != 'archived'`).bind(resourceId).all<{ raceId: string; name: string; departureDate: string; returnDate: string }>();
  const conflict = rows.results.find((row: { raceId: string; departureDate: string; returnDate: string }) => row.raceId === target.id || intervalsOverlap(row.departureDate, row.returnDate, target.departureDate, target.returnDate));
  return conflict ? `${type === "mechanic" ? "Mechanic" : "Vehicle"} is already assigned to ${conflict.name}` : "";
}

async function readPayload(request: Request): Promise<PlanningPayload | Response> {
  try {
    return (await request.json()) as PlanningPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
