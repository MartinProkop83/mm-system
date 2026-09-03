import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { raceLogoUrl } from "../../race-logo";
import { normalizeRaceCalendarColor } from "../../race-calendar-colors";

type LogisticsType = "accommodation" | "flight" | "rental";
type TravelPassengerPayload = { id?: string; name?: string; kind?: string };
type LogisticsPayload = {
  type?: LogisticsType;
  id?: string;
  raceId?: string;
  name?: string;
  address?: string;
  checkInDate?: string;
  checkOutDate?: string;
  reservationCode?: string;
  websiteUrl?: string;
  bookingUrl?: string;
  trackDistanceKm?: string | number | null;
  trackDriveMinutes?: string | number | null;
  roomCount?: string | number;
  guestCount?: string | number;
  currency?: string;
  total?: string | number;
  paymentStatus?: string;
  status?: string;
  direction?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureAt?: string;
  arrivalAt?: string;
  airline?: string;
  flightNumber?: string;
  returnDepartureAirport?: string;
  returnArrivalAirport?: string;
  returnDepartureAt?: string;
  returnArrivalAt?: string;
  returnAirline?: string;
  returnFlightNumber?: string;
  returnReservationCode?: string;
  passengersNote?: string;
  passengers?: TravelPassengerPayload[];
  baggage?: string;
  company?: string;
  vehicleType?: string;
  pickupPlace?: string;
  returnPlace?: string;
  pickupAt?: string;
  returnAt?: string;
  licensePlate?: string;
  driverName?: string;
  notes?: string;
};

const types = new Set(["accommodation", "flight", "rental"]);
const currencies = new Set(["CZK", "EUR"]);
const statuses = new Set(["planned", "booked", "cancelled"]);
const paymentStatuses = new Set(["unpaid", "partial", "paid"]);
const directions = new Set(["outbound", "return", "roundtrip", "other"]);

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function optionalNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 10) / 10 : null;
}

function optionalNonNegativeInteger(value: unknown) {
  const number = optionalNonNegativeNumber(value);
  return number === null ? null : Math.round(number);
}

function cleanHttpUrl(value: unknown) {
  const raw = clean(value, 1000);
  if (!raw) return "";
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function moneyToCents(value: unknown) {
  const normalized = String(value ?? "0").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function validType(value: unknown): value is LogisticsType {
  return typeof value === "string" && types.has(value);
}

async function raceExists(id: string) {
  return getD1().prepare("SELECT id FROM races WHERE id = ? AND status != 'archived'").bind(id).first<{ id: string }>();
}

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const raceId = new URL(request.url).searchParams.get("raceId")?.trim() ?? "";
  const d1 = getD1();
  const raceFilter = raceId ? "AND r.id = ?" : "";
  const bind = <T>(statement: ReturnType<typeof d1.prepare>) => raceId ? statement.bind(raceId).all<T>() : statement.all<T>();
  const [raceRows, mechanicRows, vehicleRows, accommodations, flights, rentals] = await Promise.all([
    bind<Record<string, unknown>>(d1.prepare(`
      SELECT r.id, r.name, r.track, r.country_code AS countryCode,
             r.start_date AS startDate, r.end_date AS endDate,
             r.departure_date AS departureDate, r.return_date AS returnDate, r.status,
             r.race_template_id AS raceTemplateId, rt.calendar_color AS calendarColor, rt.logo_key AS logoKey,
             rt.logo_updated_at AS logoUpdatedAt
      FROM races r LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      WHERE r.status != 'archived' ${raceFilter}
      ORDER BY r.departure_date, r.name
    `)),
    bind<{ raceId: string; id: string; name: string }>(d1.prepare(`
      SELECT rm.race_id AS raceId, rm.mechanic_id AS id, rm.mechanic_name_snapshot AS name
      FROM race_mechanics rm JOIN races r ON r.id = rm.race_id
      WHERE r.status != 'archived' ${raceFilter}
      ORDER BY rm.mechanic_name_snapshot
    `)),
    bind<{ raceId: string; id: string; name: string; licensePlate: string }>(d1.prepare(`
      SELECT rv.race_id AS raceId, rv.vehicle_id AS id, rv.vehicle_name_snapshot AS name,
             rv.license_plate_snapshot AS licensePlate
      FROM race_vehicles rv JOIN races r ON r.id = rv.race_id
      WHERE r.status != 'archived' ${raceFilter}
      ORDER BY rv.vehicle_name_snapshot
    `)),
    bind<Record<string, unknown>>(d1.prepare(`
      SELECT a.id, a.race_id AS raceId, r.name AS raceName, r.track AS raceTrack, r.country_code AS countryCode,
             a.name, a.address, a.check_in_date AS checkInDate, a.check_out_date AS checkOutDate,
             a.reservation_code AS reservationCode, a.website_url AS websiteUrl, a.booking_url AS bookingUrl,
             a.track_distance_km AS trackDistanceKm, a.track_drive_minutes AS trackDriveMinutes,
             COALESCE(NULLIF(c.address, ''), r.address) AS trackAddress,
             a.room_count AS roomCount, a.guest_count AS guestCount,
             a.currency, a.total_cents AS totalCents, a.payment_status AS paymentStatus,
             a.status, a.notes, a.created_at AS createdAt, a.updated_at AS updatedAt
      FROM race_accommodations a JOIN races r ON r.id = a.race_id
      LEFT JOIN circuits c ON c.id = r.circuit_id AND c.archived_at IS NULL
      WHERE a.archived_at IS NULL AND r.status != 'archived' ${raceFilter}
      ORDER BY a.check_in_date, r.name
    `)),
    bind<Record<string, unknown>>(d1.prepare(`
      SELECT f.id, f.race_id AS raceId, r.name AS raceName, r.track AS raceTrack, r.country_code AS countryCode,
             COALESCE(NULLIF(f.trip_kind, ''), f.direction) AS direction,
             f.departure_airport AS departureAirport, f.arrival_airport AS arrivalAirport,
             f.departure_at AS departureAt, f.arrival_at AS arrivalAt, f.airline,
             f.flight_number AS flightNumber, f.reservation_code AS reservationCode,
             f.return_reservation_code AS returnReservationCode,
             f.return_departure_airport AS returnDepartureAirport,
             f.return_arrival_airport AS returnArrivalAirport,
             f.return_departure_at AS returnDepartureAt, f.return_arrival_at AS returnArrivalAt,
             f.return_airline AS returnAirline, f.return_flight_number AS returnFlightNumber,
             f.passengers_note AS passengersNote, f.passengers_json AS passengersJson,
             f.baggage, f.currency, f.total_cents AS totalCents,
             f.status, f.notes, f.created_at AS createdAt, f.updated_at AS updatedAt
      FROM race_flights f JOIN races r ON r.id = f.race_id
      WHERE f.archived_at IS NULL AND r.status != 'archived' ${raceFilter}
      ORDER BY f.departure_at, r.name
    `)),
    bind<Record<string, unknown>>(d1.prepare(`
      SELECT c.id, c.race_id AS raceId, r.name AS raceName, r.track AS raceTrack, r.country_code AS countryCode,
             c.company, c.vehicle_type AS vehicleType, c.pickup_place AS pickupPlace,
             c.return_place AS returnPlace, c.pickup_at AS pickupAt, c.return_at AS returnAt,
             c.reservation_code AS reservationCode, c.license_plate AS licensePlate,
             c.driver_name AS driverName, c.currency, c.total_cents AS totalCents,
             c.status, c.notes, c.created_at AS createdAt, c.updated_at AS updatedAt
      FROM race_car_rentals c JOIN races r ON r.id = c.race_id
      WHERE c.archived_at IS NULL AND r.status != 'archived' ${raceFilter}
      ORDER BY c.pickup_at, r.name
    `)),
  ]);
  const mechanics = mechanicRows.results as Array<{ raceId: string; id: string; name: string }>;
  const vehicles = vehicleRows.results as Array<{ raceId: string; id: string; name: string; licensePlate: string }>;
  const [attachmentRows, travelerMechanics, travelerUsers] = await Promise.all([
    d1.prepare(`SELECT id, entity_type AS entityType, entity_id AS entityId, leg, file_name AS fileName, content_type AS contentType, size_bytes AS sizeBytes, created_at AS createdAt FROM travel_attachments ORDER BY created_at`).all<{ id: string; entityType: LogisticsType; entityId: string; leg: string; fileName: string; contentType: string; sizeBytes: number; createdAt: number }>(),
    d1.prepare("SELECT 'mechanic:' || id AS id, name, 'mechanic' AS kind FROM mechanics WHERE archived_at IS NULL ORDER BY name").all<{ id: string; name: string; kind: string }>(),
    d1.prepare("SELECT 'user:' || id AS id, full_name AS name, 'team' AS kind FROM app_users WHERE is_active = 1 ORDER BY full_name").all<{ id: string; name: string; kind: string }>(),
  ]);
  const attachments = attachmentRows.results as Array<{ id: string; entityType: LogisticsType; entityId: string; leg: string; fileName: string; contentType: string; sizeBytes: number; createdAt: number }>;
  const availableMechanics = travelerMechanics.results as Array<{ id: string; name: string; kind: string }>;
  const availableUsers = travelerUsers.results as Array<{ id: string; name: string; kind: string }>;
  const raceRecords = raceRows.results as Array<Record<string, unknown>>;
  const accommodationRecords = accommodations.results as Array<Record<string, unknown>>;
  const flightRecords = flights.results as Array<Record<string, unknown>>;
  const rentalRecords = rentals.results as Array<Record<string, unknown>>;
  const attachmentsFor = (entityType: LogisticsType, entityId: unknown) => attachments.filter((item) => item.entityType === entityType && item.entityId === entityId).map((item) => ({ ...item, url: `/api/logistics-attachments?id=${encodeURIComponent(item.id)}` }));
  const travelerMap = new Map<string, { id: string; name: string; kind: string }>();
  for (const traveler of [...availableMechanics, ...availableUsers]) {
    const key = traveler.name.trim().toLocaleLowerCase("cs");
    if (key && !travelerMap.has(key)) travelerMap.set(key, traveler);
  }
  const races = raceRecords.map((race) => ({
    ...race,
    calendarColor: normalizeRaceCalendarColor(race.calendarColor),
    logoUrl: raceLogoUrl(race.raceTemplateId, race.logoKey, race.logoUpdatedAt),
    mechanics: mechanics.filter((item) => item.raceId === race.id),
    vehicles: vehicles.filter((item) => item.raceId === race.id),
  }));
  return Response.json({
    races,
    travelers: Array.from(travelerMap.values()).sort((left, right) => left.name.localeCompare(right.name, "cs")),
    accommodations: accommodationRecords.map((item) => ({ ...item, attachments: attachmentsFor("accommodation", item.id) })),
    flights: flightRecords.map((item) => ({ ...item, passengers: parsePassengers(item.passengersJson), attachments: attachmentsFor("flight", item.id) })),
    rentals: rentalRecords.map((item) => ({ ...item, attachments: attachmentsFor("rental", item.id) })),
  });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  await ensureRuntimeSchema();
  const normalized = await normalize(payload);
  if (normalized instanceof Response) return normalized;
  const id = crypto.randomUUID();
  const now = Date.now();
  const d1 = getD1();
  const recordStatement = normalized.type === "accommodation"
    ? d1.prepare(`INSERT INTO race_accommodations (id, race_id, name, address, check_in_date, check_out_date, reservation_code, website_url, booking_url, track_distance_km, track_drive_minutes, room_count, guest_count, currency, total_cents, payment_status, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, normalized.raceId, normalized.name, normalized.address, normalized.checkInDate, normalized.checkOutDate, normalized.reservationCode, normalized.websiteUrl, normalized.bookingUrl, normalized.trackDistanceKm, normalized.trackDriveMinutes, normalized.roomCount, normalized.guestCount, normalized.currency, normalized.totalCents, normalized.paymentStatus, normalized.status, normalized.notes, user.email, now, now)
    : normalized.type === "flight"
      ? d1.prepare(`INSERT INTO race_flights (id, race_id, direction, trip_kind, departure_airport, arrival_airport, departure_at, arrival_at, airline, flight_number, return_departure_airport, return_arrival_airport, return_departure_at, return_arrival_at, return_airline, return_flight_number, reservation_code, return_reservation_code, passengers_note, passengers_json, baggage, currency, total_cents, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, normalized.raceId, normalized.storageDirection, normalized.direction, normalized.departureAirport, normalized.arrivalAirport, normalized.departureAt, normalized.arrivalAt, normalized.airline, normalized.flightNumber, normalized.returnDepartureAirport, normalized.returnArrivalAirport, normalized.returnDepartureAt, normalized.returnArrivalAt, normalized.returnAirline, normalized.returnFlightNumber, normalized.reservationCode, normalized.returnReservationCode, normalized.passengersNote, JSON.stringify(normalized.passengers), normalized.baggage, normalized.currency, normalized.totalCents, normalized.status, normalized.notes, user.email, now, now)
      : d1.prepare(`INSERT INTO race_car_rentals (id, race_id, company, vehicle_type, pickup_place, return_place, pickup_at, return_at, reservation_code, license_plate, driver_name, currency, total_cents, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, normalized.raceId, normalized.company, normalized.vehicleType, normalized.pickupPlace, normalized.returnPlace, normalized.pickupAt, normalized.returnAt, normalized.reservationCode, normalized.licensePlate, normalized.driverName, normalized.currency, normalized.totalCents, normalized.status, normalized.notes, user.email, now, now);
  await d1.batch([
    recordStatement,
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'create', ?, ?, ?, ?)").bind(crypto.randomUUID(), user.email, normalized.type, id, JSON.stringify(normalized), now),
  ]);
  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Record id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const normalized = await normalize(payload);
  if (normalized instanceof Response) return normalized;
  const d1 = getD1();
  const table = normalized.type === "accommodation" ? "race_accommodations" : normalized.type === "flight" ? "race_flights" : "race_car_rentals";
  const existing = await d1.prepare(`SELECT * FROM ${table} WHERE id = ? AND archived_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Record not found" }, { status: 404 });
  const now = Date.now();
  const recordStatement = normalized.type === "accommodation"
    ? d1.prepare(`UPDATE race_accommodations SET race_id = ?, name = ?, address = ?, check_in_date = ?, check_out_date = ?, reservation_code = ?, website_url = ?, booking_url = ?, track_distance_km = ?, track_drive_minutes = ?, room_count = ?, guest_count = ?, currency = ?, total_cents = ?, payment_status = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?`).bind(normalized.raceId, normalized.name, normalized.address, normalized.checkInDate, normalized.checkOutDate, normalized.reservationCode, normalized.websiteUrl, normalized.bookingUrl, normalized.trackDistanceKm, normalized.trackDriveMinutes, normalized.roomCount, normalized.guestCount, normalized.currency, normalized.totalCents, normalized.paymentStatus, normalized.status, normalized.notes, now, id)
    : normalized.type === "flight"
      ? d1.prepare(`UPDATE race_flights SET race_id = ?, direction = ?, trip_kind = ?, departure_airport = ?, arrival_airport = ?, departure_at = ?, arrival_at = ?, airline = ?, flight_number = ?, return_departure_airport = ?, return_arrival_airport = ?, return_departure_at = ?, return_arrival_at = ?, return_airline = ?, return_flight_number = ?, reservation_code = ?, return_reservation_code = ?, passengers_note = ?, passengers_json = ?, baggage = ?, currency = ?, total_cents = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?`).bind(normalized.raceId, normalized.storageDirection, normalized.direction, normalized.departureAirport, normalized.arrivalAirport, normalized.departureAt, normalized.arrivalAt, normalized.airline, normalized.flightNumber, normalized.returnDepartureAirport, normalized.returnArrivalAirport, normalized.returnDepartureAt, normalized.returnArrivalAt, normalized.returnAirline, normalized.returnFlightNumber, normalized.reservationCode, normalized.returnReservationCode, normalized.passengersNote, JSON.stringify(normalized.passengers), normalized.baggage, normalized.currency, normalized.totalCents, normalized.status, normalized.notes, now, id)
      : d1.prepare(`UPDATE race_car_rentals SET race_id = ?, company = ?, vehicle_type = ?, pickup_place = ?, return_place = ?, pickup_at = ?, return_at = ?, reservation_code = ?, license_plate = ?, driver_name = ?, currency = ?, total_cents = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?`).bind(normalized.raceId, normalized.company, normalized.vehicleType, normalized.pickupPlace, normalized.returnPlace, normalized.pickupAt, normalized.returnAt, normalized.reservationCode, normalized.licensePlate, normalized.driverName, normalized.currency, normalized.totalCents, normalized.status, normalized.notes, now, id);
  await d1.batch([
    recordStatement,
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'update', ?, ?, ?, ?)").bind(crypto.randomUUID(), user.email, normalized.type, id, JSON.stringify({ before: existing, after: normalized }), now),
  ]);
  return Response.json({ id });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  if (!validType(payload.type)) return Response.json({ error: "Invalid logistics type" }, { status: 400 });
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Record id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const table = payload.type === "accommodation" ? "race_accommodations" : payload.type === "flight" ? "race_flights" : "race_car_rentals";
  const now = Date.now(); const d1 = getD1();
  const attachments = await d1.prepare("SELECT object_key AS objectKey FROM travel_attachments WHERE entity_type = ? AND entity_id = ?").bind(payload.type, id).all<{ objectKey: string }>();
  const result = await d1.batch([
    d1.prepare(`UPDATE ${table} SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL`).bind(now, now, id),
    d1.prepare("DELETE FROM travel_attachments WHERE entity_type = ? AND entity_id = ?").bind(payload.type, id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'archive', ?, ?, '{}', ?)").bind(crypto.randomUUID(), user.email, payload.type, id, now),
  ]);
  if (!result[0].meta.changes) return Response.json({ error: "Record not found" }, { status: 404 });
  await Promise.all((attachments.results as Array<{ objectKey: string }>).map((item) => getAssetsBucket().delete(item.objectKey).catch(() => undefined)));
  return Response.json({ id });
}

async function normalize(payload: LogisticsPayload) {
  if (!validType(payload.type)) return Response.json({ error: "Invalid logistics type" }, { status: 400 });
  const raceId = clean(payload.raceId, 80);
  if (!raceId || !(await raceExists(raceId))) return Response.json({ error: "Race not found" }, { status: 404 });
  const currency = clean(payload.currency, 3).toUpperCase();
  const status = clean(payload.status) || "planned";
  if (!currencies.has(currency) || !statuses.has(status)) return Response.json({ error: "Invalid currency or status" }, { status: 400 });
  const common = { type: payload.type, raceId, currency, totalCents: moneyToCents(payload.total), status, notes: clean(payload.notes, 2000) };
  if (payload.type === "accommodation") {
    const name = clean(payload.name, 160);
    const address = clean(payload.address, 400);
    const checkInDate = clean(payload.checkInDate, 10);
    const checkOutDate = clean(payload.checkOutDate, 10);
    const paymentStatus = clean(payload.paymentStatus) || "unpaid";
    if (!name || !address || !/^\d{4}-\d{2}-\d{2}$/.test(checkInDate) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOutDate)) return Response.json({ error: "Accommodation, location, check-in and check-out are required" }, { status: 400 });
    if (checkInDate > checkOutDate) return Response.json({ error: "Check-out must be after check-in" }, { status: 400 });
    if (!paymentStatuses.has(paymentStatus)) return Response.json({ error: "Invalid payment status" }, { status: 400 });
    const websiteUrl = cleanHttpUrl(payload.websiteUrl);
    const bookingUrl = cleanHttpUrl(payload.bookingUrl);
    if (websiteUrl === null || bookingUrl === null) return Response.json({ error: "Accommodation links must use HTTP or HTTPS" }, { status: 400 });
    return { ...common, type: "accommodation" as const, name, address, checkInDate, checkOutDate, reservationCode: clean(payload.reservationCode, 100), websiteUrl, bookingUrl, trackDistanceKm: optionalNonNegativeNumber(payload.trackDistanceKm), trackDriveMinutes: optionalNonNegativeInteger(payload.trackDriveMinutes), roomCount: nonNegativeInteger(payload.roomCount), guestCount: nonNegativeInteger(payload.guestCount), paymentStatus };
  }
  if (payload.type === "rental") {
    const company = clean(payload.company, 160);
    const pickupPlace = clean(payload.pickupPlace, 200);
    const returnPlace = clean(payload.returnPlace, 200);
    const pickupAt = clean(payload.pickupAt, 16);
    const returnAt = clean(payload.returnAt, 16);
    if (!company || !pickupPlace || !returnPlace || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(pickupAt) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(returnAt)) return Response.json({ error: "Rental company, places and times are required" }, { status: 400 });
    if (pickupAt > returnAt) return Response.json({ error: "Rental return must be after pickup" }, { status: 400 });
    return { ...common, type: "rental" as const, company, vehicleType: clean(payload.vehicleType, 120), pickupPlace, returnPlace, pickupAt, returnAt, reservationCode: clean(payload.reservationCode, 100).toUpperCase(), licensePlate: clean(payload.licensePlate, 40).toUpperCase(), driverName: clean(payload.driverName, 120) };
  }
  const direction = clean(payload.direction) || "outbound";
  const departureAirport = clean(payload.departureAirport, 100).toUpperCase();
  const arrivalAirport = clean(payload.arrivalAirport, 100).toUpperCase();
  const departureAt = clean(payload.departureAt, 16);
  const arrivalAt = clean(payload.arrivalAt, 16);
  const returnDepartureAirport = direction === "roundtrip" ? clean(payload.returnDepartureAirport, 100).toUpperCase() : "";
  const returnArrivalAirport = direction === "roundtrip" ? clean(payload.returnArrivalAirport, 100).toUpperCase() : "";
  const returnDepartureAt = direction === "roundtrip" ? clean(payload.returnDepartureAt, 16) : "";
  const returnArrivalAt = direction === "roundtrip" ? clean(payload.returnArrivalAt, 16) : "";
  if (!directions.has(direction) || !departureAirport || !arrivalAirport || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(departureAt) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(arrivalAt)) return Response.json({ error: "Flight route and times are required" }, { status: 400 });
  if (departureAt >= arrivalAt) return Response.json({ error: "Arrival must be after departure" }, { status: 400 });
  if (direction === "roundtrip" && (!returnDepartureAirport || !returnArrivalAirport || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(returnDepartureAt) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(returnArrivalAt))) return Response.json({ error: "Return flight route and times are required" }, { status: 400 });
  if (direction === "roundtrip" && (returnDepartureAt >= returnArrivalAt || returnDepartureAt < arrivalAt)) return Response.json({ error: "Return flight must be after outbound arrival" }, { status: 400 });
  const passengers = Array.isArray(payload.passengers) ? payload.passengers.slice(0, 80).map((item) => ({ id: clean(item.id, 120), name: clean(item.name, 160), kind: ["mechanic", "team", "other"].includes(clean(item.kind, 20)) ? clean(item.kind, 20) : "other" })).filter((item) => item.name) : [];
  return { ...common, type: "flight" as const, direction, storageDirection: direction === "roundtrip" ? "outbound" : direction, departureAirport, arrivalAirport, departureAt, arrivalAt, airline: clean(payload.airline, 120), flightNumber: clean(payload.flightNumber, 40).toUpperCase(), returnDepartureAirport, returnArrivalAirport, returnDepartureAt, returnArrivalAt, returnAirline: direction === "roundtrip" ? clean(payload.returnAirline, 120) : "", returnFlightNumber: direction === "roundtrip" ? clean(payload.returnFlightNumber, 40).toUpperCase() : "", reservationCode: clean(payload.reservationCode, 100).toUpperCase(), returnReservationCode: direction === "roundtrip" ? clean(payload.returnReservationCode, 100).toUpperCase() : "", passengersNote: clean(payload.passengersNote, 500), passengers, baggage: clean(payload.baggage, 300) };
}

function parsePassengers(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is { id: string; name: string; kind: string } => Boolean(item && typeof item === "object" && typeof item.name === "string")) : [];
  } catch { return []; }
}

async function readPayload(request: Request): Promise<LogisticsPayload | Response> {
  try {
    return (await request.json()) as LogisticsPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
