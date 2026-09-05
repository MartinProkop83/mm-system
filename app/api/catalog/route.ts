import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { isCountryCode } from "../../countries";
import { raceLogoUrl } from "../../race-logo";
import { teamLogoUrl } from "../../team-logo";
import { vehiclePhotoUrl } from "../../vehicle-photo";
import { driverPhotoUrl } from "../../driver-photo";
import { normalizeRaceCalendarColor } from "../../race-calendar-colors";

const catalogTypes = new Set(["raceType", "team", "driver", "mechanic", "vehicle", "carburetor"]);
const raceCategories = new Set(["BABY", "MINI", "MINI U10", "MINI GR3", "OKJ", "OKN-J", "OKN", "OK", "KZ"]);
const carburetorFamilies = new Set(["BABY", "MINI", "OKJ", "OKN", "OK", "KZ"]);
const carburetorStatuses = new Set(["ready", "service", "storage", "retired"]);

type CatalogType = "raceType" | "team" | "driver" | "mechanic" | "vehicle" | "carburetor";

type CatalogPayload = {
  type?: CatalogType;
  id?: string;
  name?: string;
  countryCode?: string;
  notes?: string;
  seriesOptions?: unknown;
  calendarColor?: string;
  teamId?: string | null;
  defaultCategory?: string;
  raceNumber?: string;
  nationality?: string;
  isActive?: boolean | string | number;
  licensePlate?: string;
  currentKm?: string | number;
  serviceIntervalKm?: string | number;
  code?: string;
  carburetorTypeId?: string;
  category?: string;
  family?: string;
  brand?: string;
  model?: string;
  status?: string;
};

function text(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function wholeNumberOrNull(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function parseSeriesOptions(value: unknown) {
  let source = value;
  if (typeof value === "string") {
    try { source = JSON.parse(value); }
    catch { source = value.split(","); }
  }
  if (!Array.isArray(source)) return [];
  return [...new Set(source.map((item) => text(item, 40)).filter(Boolean))].slice(0, 20);
}

function validType(value: unknown): value is CatalogType {
  return typeof value === "string" && catalogTypes.has(value);
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const [raceTypes, teams, drivers, mechanics, vehicles, carburetors, carburetorAssignments, mechanicAssignments, vehicleAssignments] = await Promise.all([
    d1.prepare(`SELECT id, name, notes, series_options AS seriesOptions, calendar_color AS calendarColor, logo_key AS logoKey, logo_updated_at AS logoUpdatedAt, created_at AS createdAt, updated_at AS updatedAt FROM race_templates WHERE archived_at IS NULL ORDER BY name`).all(),
    d1.prepare(`SELECT id, name, country_code AS countryCode, notes, logo_key AS logoKey, logo_updated_at AS logoUpdatedAt, created_at AS createdAt, updated_at AS updatedAt FROM teams WHERE archived_at IS NULL ORDER BY name`).all(),
    d1.prepare(`
      SELECT d.id, d.name, d.team_id AS teamId, COALESCE(t.name, '') AS teamName,
             d.default_category AS defaultCategory, d.race_number AS raceNumber,
             d.nationality, d.is_active AS isActive, d.notes,
             d.photo_key AS photoKey, d.photo_updated_at AS photoUpdatedAt,
             d.created_at AS createdAt, d.updated_at AS updatedAt
      FROM drivers d LEFT JOIN teams t ON t.id = d.team_id
      WHERE d.archived_at IS NULL ORDER BY d.name
    `).all(),
    d1.prepare(`SELECT id, name, created_at AS createdAt, updated_at AS updatedAt FROM mechanics WHERE archived_at IS NULL ORDER BY name`).all(),
    d1.prepare(`SELECT id, name, license_plate AS licensePlate, notes, photo_key AS photoKey, photo_updated_at AS photoUpdatedAt, current_km AS currentKm, service_interval_km AS serviceIntervalKm, last_service_km AS lastServiceKm, last_service_note AS lastServiceNote, last_service_date AS lastServiceDate, created_at AS createdAt, updated_at AS updatedAt FROM vehicles WHERE archived_at IS NULL ORDER BY name`).all(),
    d1.prepare(`SELECT id, code, carburetor_type_id AS carburetorTypeId, category, family, brand, model, status, notes, sold_at AS soldAt, created_at AS createdAt, updated_at AS updatedAt FROM carburetors WHERE archived_at IS NULL ORDER BY code`).all(),
    d1.prepare(`
      SELECT e.driver_name_snapshot AS driverName, r.name AS raceName, r.status AS raceStatus,
             r.start_date AS startDate, r.end_date AS endDate, r.country_code AS countryCode,
             r.race_template_id AS raceTemplateId, rt.logo_key AS logoKey, rt.logo_updated_at AS logoUpdatedAt,
             e.carburetor_1_id AS carburetor1Id, e.carburetor_2_id AS carburetor2Id, e.carburetor_3_id AS carburetor3Id
      FROM race_entries e JOIN races r ON r.id = e.race_id
      LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      WHERE r.status != 'archived'
    `).all<{ driverName: string; raceName: string; raceStatus: string; startDate: string; endDate: string; countryCode: string; raceTemplateId: string | null; logoKey: string | null; logoUpdatedAt: number | null; carburetor1Id: string | null; carburetor2Id: string | null; carburetor3Id: string | null }>(),
    d1.prepare(`
      SELECT rm.mechanic_id AS mechanicId, r.name AS raceName, r.track,
             r.country_code AS countryCode, r.start_date AS startDate, r.end_date AS endDate,
             r.departure_date AS departureDate, r.return_date AS returnDate, r.status AS raceStatus
      FROM race_mechanics rm JOIN races r ON r.id = rm.race_id
      WHERE r.status != 'archived'
    `).all<{ mechanicId: string; raceName: string; track: string; countryCode: string; startDate: string; endDate: string; departureDate: string; returnDate: string; raceStatus: string }>(),
    d1.prepare(`
      SELECT rv.vehicle_id AS vehicleId, r.name AS raceName, r.status AS raceStatus,
             r.start_date AS startDate, r.end_date AS endDate, r.country_code AS countryCode,
             r.race_template_id AS raceTemplateId, rt.logo_key AS logoKey, rt.logo_updated_at AS logoUpdatedAt
      FROM race_vehicles rv JOIN races r ON r.id = rv.race_id
      LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      WHERE r.status != 'archived'
    `).all<{ vehicleId: string; raceName: string; raceStatus: string; startDate: string; endDate: string; countryCode: string; raceTemplateId: string | null; logoKey: string | null; logoUpdatedAt: number | null }>(),
  ]);
  const assignments = carburetorAssignments.results;
  const today = localIsoDate(new Date());
  const enrichedCarburetors = carburetors.results.map((carburetor: Record<string, unknown>) => {
    const matches = assignments.filter((assignment) => [assignment.carburetor1Id, assignment.carburetor2Id, assignment.carburetor3Id].includes(String(carburetor.id)));
    const current = matches.filter((assignment) => assignment.raceStatus !== "completed" && assignment.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    const latest = current ?? matches.sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    return {
      ...carburetor,
      lastDriver: latest?.driverName ?? "",
      lastRace: latest?.raceName ?? "",
      lastRaceLogoUrl: latest ? raceLogoUrl(latest.raceTemplateId, latest.logoKey, latest.logoUpdatedAt) : "",
      lastRaceCountryCode: latest?.countryCode ?? "",
      lastRaceStartDate: latest?.startDate ?? "",
      lastRaceEndDate: latest?.endDate ?? "",
      assignmentStatus: current ? "assigned" : latest ? "history" : "none",
    };
  });
  const mechanicRaceRows = mechanicAssignments.results;
  const enrichedMechanics = mechanics.results.map((mechanic: Record<string, unknown>) => {
    const matches = mechanicRaceRows.filter((assignment) => assignment.mechanicId === String(mechanic.id));
    const current = matches
      .filter((assignment) => assignment.raceStatus !== "completed" && assignment.returnDate >= today)
      .sort((left, right) => left.departureDate.localeCompare(right.departureDate))[0];
    const latest = current ?? matches.sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
    return {
      ...mechanic,
      nextRace: latest?.raceName ?? "",
      nextTrack: latest?.track ?? "",
      nextCountryCode: latest?.countryCode ?? "",
      nextStartDate: latest?.startDate ?? "",
      nextEndDate: latest?.endDate ?? "",
      assignmentStatus: current ? "assigned" : latest ? "history" : "none",
      raceCount: matches.length,
    };
  });
  const vehicleRaceRows: Array<{ vehicleId: string; raceName: string; raceStatus: string; startDate: string; endDate: string; countryCode: string; raceTemplateId: string | null; logoKey: string | null; logoUpdatedAt: number | null }> = vehicleAssignments.results;
  const enrichedVehicles = (vehicles.results as Array<Record<string, unknown>>).map((vehicle) => {
    const matches = vehicleRaceRows.filter((assignment) => assignment.vehicleId === String(vehicle.id));
    const current = matches.filter((assignment) => assignment.raceStatus !== "completed" && assignment.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    const latest = current ?? matches.sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    return {
      ...vehicle,
      photoUrl: vehiclePhotoUrl(vehicle.id, vehicle.photoKey, vehicle.photoUpdatedAt),
      lastRace: latest?.raceName ?? "",
      lastRaceLogoUrl: latest ? raceLogoUrl(latest.raceTemplateId, latest.logoKey, latest.logoUpdatedAt) : "",
      lastRaceCountryCode: latest?.countryCode ?? "",
      lastRaceStartDate: latest?.startDate ?? "",
      lastRaceEndDate: latest?.endDate ?? "",
      assignmentStatus: current ? "assigned" : latest ? "history" : "none",
    };
  });
  const normalizedDrivers = drivers.results.map((driver: Record<string, unknown>) => ({ ...driver, isActive: Boolean(driver.isActive), photoUrl: driverPhotoUrl(driver.id, driver.photoKey, driver.photoUpdatedAt) }));
  const normalizedTeams = (teams.results as Array<Record<string, unknown>>).map((team) => ({
    ...team,
    logoUrl: teamLogoUrl(team.id, team.logoKey, team.logoUpdatedAt),
  }));
  const normalizedRaceTypes = (raceTypes.results as Array<Record<string, unknown>>).map((template) => ({
    id: template.id,
    name: template.name,
    notes: template.notes,
    seriesOptions: parseSeriesOptions(template.seriesOptions),
    calendarColor: normalizeRaceCalendarColor(template.calendarColor),
    logoUrl: raceLogoUrl(template.id, template.logoKey, template.logoUpdatedAt),
    logoUpdatedAt: template.logoUpdatedAt,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  }));
  return Response.json({ raceTypes: normalizedRaceTypes, teams: normalizedTeams, drivers: normalizedDrivers, mechanics: enrichedMechanics, vehicles: enrichedVehicles, carburetors: enrichedCarburetors });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  await ensureRuntimeSchema();
  const validation = await validatePayload(payload);
  if (validation) return validation;
  const d1 = getD1();
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await d1.batch([
      createStatement(payload.type!, id, payload, user.email, now),
      d1.prepare(`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'create', ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), user.email, payload.type, id, JSON.stringify(payload), now,
      ),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    if (message.toLowerCase().includes("unique")) return Response.json({ error: payload.type === "raceType" ? "Name already exists" : "Code already exists" }, { status: 409 });
    return Response.json({ error: "Could not save item" }, { status: 500 });
  }
  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  if (!payload.id) return Response.json({ error: "Item id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const validation = await validatePayload(payload);
  if (validation) return validation;
  const d1 = getD1();
  const existing = await findItem(payload.type!, payload.id);
  if (!existing) return Response.json({ error: "Item not found" }, { status: 404 });
  const now = Date.now();
  try {
    await d1.batch([
      updateStatement(payload.type!, payload.id, payload, now),
      d1.prepare(`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'update', ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), user.email, payload.type, payload.id, JSON.stringify({ before: existing, after: payload }), now,
      ),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    if (message.toLowerCase().includes("unique")) return Response.json({ error: payload.type === "raceType" ? "Name already exists" : "Code already exists" }, { status: 409 });
    return Response.json({ error: "Could not update item" }, { status: 500 });
  }
  return Response.json({ id: payload.id });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  if (!payload.id) return Response.json({ error: "Item id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const existing = await findItem(payload.type!, payload.id);
  if (!existing) return Response.json({ error: "Item not found" }, { status: 404 });
  const d1 = getD1();
  const now = Date.now();
  const table = tableFor(payload.type!);
  const logoKey = payload.type === "raceType" || payload.type === "team" ? text(existing.logo_key, 500) : "";
  await d1.batch([
    d1.prepare(`UPDATE ${table} SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL`).bind(now, now, payload.id),
    d1.prepare(`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'archive', ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), user.email, payload.type, payload.id, JSON.stringify(existing), now,
    ),
  ]);
  if (logoKey) await getAssetsBucket().delete(logoKey).catch(() => undefined);
  return Response.json({ id: payload.id });
}

async function readPayload(request: Request): Promise<CatalogPayload | Response> {
  try {
    const payload = (await request.json()) as CatalogPayload;
    if (!validType(payload.type)) return Response.json({ error: "Invalid catalog type" }, { status: 400 });
    return payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

async function validatePayload(payload: CatalogPayload) {
  if (payload.type === "raceType" || payload.type === "team") {
    if (!text(payload.name, 120)) return Response.json({ error: "Name is required" }, { status: 400 });
    if (payload.type === "team" && payload.countryCode && !isCountryCode(text(payload.countryCode, 3))) return Response.json({ error: "Invalid country" }, { status: 400 });
  } else if (payload.type === "driver") {
    if (!text(payload.name, 120)) return Response.json({ error: "Name is required" }, { status: 400 });
    if (payload.defaultCategory && !raceCategories.has(text(payload.defaultCategory))) return Response.json({ error: "Invalid category" }, { status: 400 });
    if (payload.teamId && !(await getD1().prepare("SELECT id FROM teams WHERE id = ? AND archived_at IS NULL").bind(payload.teamId).first())) return Response.json({ error: "Team not found" }, { status: 400 });
    if (payload.nationality && !isCountryCode(text(payload.nationality, 3))) return Response.json({ error: "Invalid country" }, { status: 400 });
  } else if (payload.type === "mechanic" || payload.type === "vehicle") {
    if (!text(payload.name, 120)) return Response.json({ error: "Name is required" }, { status: 400 });
  } else if (payload.type === "carburetor") {
    if (!/^[A-Z0-9-]{2,20}$/.test(text(payload.code, 20).toUpperCase())) return Response.json({ error: "Invalid carburetor code" }, { status: 400 });
    const typeId = text(payload.carburetorTypeId, 80);
    const selectedCategory = text(payload.category, 20).toUpperCase();
    const carburetorType = typeId ? await getD1().prepare("SELECT brand, model, categories FROM carburetor_types WHERE id = ? AND archived_at IS NULL").bind(typeId).first<{ brand: string; model: string; categories: string }>() : null;
    if (!carburetorType) return Response.json({ error: "Carburetor type not found" }, { status: 400 });
    let compatible: string[] = [];
    try { compatible = JSON.parse(carburetorType.categories) as string[]; } catch { compatible = []; }
    if (!compatible.includes(selectedCategory)) return Response.json({ error: "Category is not compatible with carburetor type" }, { status: 400 });
    payload.family = carburetorFamily(selectedCategory);
    payload.category = selectedCategory;
    payload.brand = carburetorType.brand;
    payload.model = carburetorType.model;
    if (!carburetorFamilies.has(payload.family)) return Response.json({ error: "Invalid carburetor family" }, { status: 400 });
    if (!carburetorStatuses.has(text(payload.status) || "ready")) return Response.json({ error: "Invalid status" }, { status: 400 });
  }
  return null;
}

function createStatement(type: CatalogType, id: string, payload: CatalogPayload, actor: string, now: number) {
  const d1 = getD1();
  if (type === "raceType") return d1.prepare("INSERT INTO race_templates (id, name, notes, series_options, calendar_color, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, text(payload.name, 120), text(payload.notes, 1000), JSON.stringify(parseSeriesOptions(payload.seriesOptions)), normalizeRaceCalendarColor(payload.calendarColor), actor, now, now);
  if (type === "team") return d1.prepare("INSERT INTO teams (id, name, country_code, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, text(payload.name, 120), text(payload.countryCode, 3).toUpperCase(), text(payload.notes, 1000), actor, now, now);
  if (type === "driver") return d1.prepare("INSERT INTO drivers (id, name, team_id, default_category, race_number, nationality, is_active, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, text(payload.name, 120), payload.teamId || null, text(payload.defaultCategory), text(payload.raceNumber, 10), text(payload.nationality, 3).toUpperCase(), activeValue(payload.isActive), text(payload.notes, 1000), actor, now, now);
  if (type === "mechanic") return d1.prepare("INSERT INTO mechanics (id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(id, text(payload.name, 120), actor, now, now);
  if (type === "vehicle") return d1.prepare("INSERT INTO vehicles (id, name, license_plate, notes, current_km, service_interval_km, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, text(payload.name, 120), text(payload.licensePlate, 20).toUpperCase(), text(payload.notes, 1000), wholeNumberOrNull(payload.currentKm), wholeNumberOrNull(payload.serviceIntervalKm), actor, now, now);
  return d1.prepare("INSERT INTO carburetors (id, code, carburetor_type_id, category, family, brand, model, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, text(payload.code, 20).toUpperCase(), text(payload.carburetorTypeId, 80), text(payload.category, 20), text(payload.family).toUpperCase(), text(payload.brand, 80), text(payload.model, 80), text(payload.status) || "ready", text(payload.notes, 1000), actor, now, now);
}

function updateStatement(type: CatalogType, id: string, payload: CatalogPayload, now: number) {
  const d1 = getD1();
  if (type === "raceType") return d1.prepare("UPDATE race_templates SET name = ?, notes = ?, series_options = ?, calendar_color = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(text(payload.name, 120), text(payload.notes, 1000), JSON.stringify(parseSeriesOptions(payload.seriesOptions)), normalizeRaceCalendarColor(payload.calendarColor), now, id);
  if (type === "team") return d1.prepare("UPDATE teams SET name = ?, country_code = ?, notes = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(text(payload.name, 120), text(payload.countryCode, 3).toUpperCase(), text(payload.notes, 1000), now, id);
  if (type === "driver") return d1.prepare("UPDATE drivers SET name = ?, team_id = ?, default_category = ?, race_number = ?, nationality = ?, is_active = ?, notes = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(text(payload.name, 120), payload.teamId || null, text(payload.defaultCategory), text(payload.raceNumber, 10), text(payload.nationality, 3).toUpperCase(), activeValue(payload.isActive), text(payload.notes, 1000), now, id);
  if (type === "mechanic") return d1.prepare("UPDATE mechanics SET name = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(text(payload.name, 120), now, id);
  if (type === "vehicle") return d1.prepare("UPDATE vehicles SET name = ?, license_plate = ?, notes = ?, current_km = ?, service_interval_km = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(text(payload.name, 120), text(payload.licensePlate, 20).toUpperCase(), text(payload.notes, 1000), wholeNumberOrNull(payload.currentKm), wholeNumberOrNull(payload.serviceIntervalKm), now, id);
  return d1.prepare("UPDATE carburetors SET code = ?, carburetor_type_id = ?, category = ?, family = ?, brand = ?, model = ?, status = ?, notes = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(text(payload.code, 20).toUpperCase(), text(payload.carburetorTypeId, 80), text(payload.category, 20), text(payload.family).toUpperCase(), text(payload.brand, 80), text(payload.model, 80), text(payload.status) || "ready", text(payload.notes, 1000), now, id);
}

function tableFor(type: CatalogType) {
  return ({ raceType: "race_templates", team: "teams", driver: "drivers", mechanic: "mechanics", vehicle: "vehicles", carburetor: "carburetors" } as const)[type];
}

async function findItem(type: CatalogType, id: string) {
  return getD1().prepare(`SELECT * FROM ${tableFor(type)} WHERE id = ? AND archived_at IS NULL`).bind(id).first<Record<string, unknown>>();
}

function carburetorFamily(category: string) {
  if (["MINI", "MINI U10", "MINI GR3"].includes(category)) return "MINI";
  if (["OKN-J", "OKN"].includes(category)) return "OKN";
  return category;
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function activeValue(value: unknown) {
  return String(value ?? "1") === "0" ? 0 : 1;
}
