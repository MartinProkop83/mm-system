import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { raceLogoUrl } from "../../race-logo";
import { clothingImageUrl } from "../../clothing-image-url";

function clean(value: unknown, max = 100) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = clean(new URL(request.url).searchParams.get("id"), 80);
  if (!id) return Response.json({ error: "Mechanic id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const [mechanic, assignments, clothing, accommodations, flights, rentals] = await Promise.all([
    d1.prepare(`
      SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
      FROM mechanics
      WHERE id = ? AND archived_at IS NULL
    `).bind(id).first<Record<string, unknown>>(),
    d1.prepare(`
      SELECT rm.id, r.id AS raceId, r.name AS raceName, r.track, r.address,
             r.country_code AS countryCode, r.start_date AS startDate,
             r.end_date AS endDate, r.departure_date AS departureDate,
             r.return_date AS returnDate, r.organizer, r.status AS raceStatus,
             r.race_template_id AS raceTemplateId, rt.logo_key AS logoKey,
             rt.logo_updated_at AS logoUpdatedAt,
             COALESCE(GROUP_CONCAT(DISTINCT rv.vehicle_name_snapshot), '') AS vehicles
      FROM race_mechanics rm
      JOIN races r ON r.id = rm.race_id
      LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      LEFT JOIN race_vehicles rv ON rv.race_id = r.id
      WHERE rm.mechanic_id = ? AND r.status != 'archived'
      GROUP BY rm.id, r.id
      ORDER BY r.start_date DESC, r.name
    `).bind(id).all<Record<string, unknown>>(),
    d1.prepare(`
      SELECT a.id, a.clothing_item_id AS clothingItemId, i.name AS itemName,
             a.size, a.quantity, a.assigned_at AS assignedAt, a.notes, a.updated_at AS updatedAt,
             i.image_key AS imageKey, i.image_updated_at AS imageUpdatedAt
      FROM mechanic_clothing_assignments a
      JOIN clothing_items i ON i.id = a.clothing_item_id AND i.archived_at IS NULL
      WHERE a.mechanic_id = ?
      ORDER BY i.name
    `).bind(id).all<Record<string, unknown>>(),
    d1.prepare(`
      SELECT a.id, a.race_id AS raceId, a.name, a.address,
             a.check_in_date AS checkInDate, a.check_out_date AS checkOutDate,
             a.reservation_code AS reservationCode, a.website_url AS websiteUrl,
             a.booking_url AS bookingUrl, a.track_distance_km AS trackDistanceKm,
             a.track_drive_minutes AS trackDriveMinutes, a.status,
             (SELECT COUNT(*) FROM travel_attachments t WHERE t.entity_type = 'accommodation' AND t.entity_id = a.id) AS attachmentCount
      FROM race_accommodations a
      JOIN race_mechanics rm ON rm.race_id = a.race_id
      WHERE rm.mechanic_id = ? AND a.archived_at IS NULL
      ORDER BY a.check_in_date
    `).bind(id).all<Record<string, unknown>>(),
    d1.prepare(`
      SELECT f.id, f.race_id AS raceId, COALESCE(NULLIF(f.trip_kind, ''), f.direction) AS direction,
             f.departure_airport AS departureAirport, f.arrival_airport AS arrivalAirport,
             f.departure_at AS departureAt, f.arrival_at AS arrivalAt,
             f.airline, f.flight_number AS flightNumber, f.passengers_note AS passengersNote,
             f.return_departure_airport AS returnDepartureAirport,
             f.return_arrival_airport AS returnArrivalAirport,
             f.return_departure_at AS returnDepartureAt,
             f.return_arrival_at AS returnArrivalAt,
             f.return_airline AS returnAirline,
             f.return_flight_number AS returnFlightNumber,
             f.passengers_json AS passengersJson, f.status,
             (SELECT COUNT(*) FROM travel_attachments t WHERE t.entity_type = 'flight' AND t.entity_id = f.id) AS attachmentCount
      FROM race_flights f
      JOIN race_mechanics rm ON rm.race_id = f.race_id
      WHERE rm.mechanic_id = ? AND f.archived_at IS NULL
      ORDER BY f.departure_at
    `).bind(id).all<Record<string, unknown>>(),
    d1.prepare(`
      SELECT c.id, c.race_id AS raceId, c.company, c.vehicle_type AS vehicleType,
             c.pickup_place AS pickupPlace, c.return_place AS returnPlace,
             c.pickup_at AS pickupAt, c.return_at AS returnAt,
             c.reservation_code AS reservationCode, c.license_plate AS licensePlate,
             c.driver_name AS driverName, c.status,
             (SELECT COUNT(*) FROM travel_attachments t WHERE t.entity_type = 'rental' AND t.entity_id = c.id) AS attachmentCount
      FROM race_car_rentals c
      JOIN race_mechanics rm ON rm.race_id = c.race_id
      WHERE rm.mechanic_id = ? AND c.archived_at IS NULL
      ORDER BY c.pickup_at
    `).bind(id).all<Record<string, unknown>>(),
  ]);

  if (!mechanic) return Response.json({ error: "Mechanic not found" }, { status: 404 });
  const mechanicPassengerId = `mechanic:${id}`;
  const accommodationRows = accommodations.results as Array<Record<string, unknown>>;
  const flightRows: Array<Record<string, unknown> & { passengers: ReturnType<typeof parsePassengers> }> = (flights.results as Array<Record<string, unknown>>).map((flight) => ({ ...flight, passengers: parsePassengers(flight.passengersJson) })).filter((flight) => flight.passengers.length === 0 || flight.passengers.some((passenger) => passenger.id === mechanicPassengerId));
  const rentalRows = rentals.results as Array<Record<string, unknown>>;
  return Response.json({
    mechanic,
    assignments: (assignments.results as Array<Record<string, unknown>>).map((assignment) => ({
      ...assignment,
      logoUrl: raceLogoUrl(assignment.raceTemplateId, assignment.logoKey, assignment.logoUpdatedAt),
      travel: {
        accommodations: accommodationRows.filter((item) => item.raceId === assignment.raceId),
        flights: flightRows.filter((item) => item.raceId === assignment.raceId),
        rentals: rentalRows.filter((item) => item.raceId === assignment.raceId),
      },
    })),
    clothing: clothing.results.map((item: Record<string, unknown>) => ({
      ...item,
      imageUrl: clothingImageUrl(item.clothingItemId, item.imageKey, item.imageUpdatedAt),
    })),
  });
}

function parsePassengers(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const passenger = item as { id?: unknown; name?: unknown; kind?: unknown };
      const id = clean(passenger.id, 160);
      const name = clean(passenger.name, 160);
      const kind = clean(passenger.kind, 20);
      return id && name ? [{ id, name, kind }] : [];
    });
  } catch {
    return [];
  }
}
