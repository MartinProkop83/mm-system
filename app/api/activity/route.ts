import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type ActivityRow = {
  id: string;
  actorEmail: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  resolvedSubject: string;
  createdAt: number;
};

function parseDetails(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function activitySubject(row: ActivityRow, details: Record<string, unknown>) {
  const after = details.after && typeof details.after === "object" ? details.after as Record<string, unknown> : {};
  const before = details.before && typeof details.before === "object" ? details.before as Record<string, unknown> : {};
  const sources = [after, details, before];
  const subjectFields = [
    "title", "fullName", "full_name", "name", "raceName", "race_name", "code",
    "saleNumber", "sale_number", "rentalNumber", "rental_number", "customerName", "customer_name", "holder", "driverName",
    "driver_name_snapshot", "teamName", "team_name_snapshot", "mechanicName",
    "mechanic_name_snapshot", "vehicleName", "vehicle_name_snapshot", "description",
    "flightNumber", "flight_number", "company", "serviceType", "service_type", "email",
  ];
  for (const source of sources) {
    for (const field of subjectFields) {
      const value = cleanText(source[field]);
      if (value) return value;
    }
  }
  return cleanText(row.resolvedSubject);
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();

  const result = await getD1().prepare(`
    SELECT l.id, l.actor_email AS actorEmail,
           COALESCE(u.full_name, l.actor_email) AS actorName,
           l.action, l.entity_type AS entityType, l.entity_id AS entityId,
           l.details,
           COALESCE(
             w.title,
             target_user.full_name,
             entry.driver_name_snapshot,
             race.name,
             engine.code,
             carburetor.code,
             clothing_item.name,
             driver.name,
             team.name,
             mechanic.name,
             vehicle.name,
             race_type.name,
             circuit.name,
             sale.sale_number,
             equipment_rental.rental_number,
             race_mechanic.mechanic_name_snapshot,
             race_vehicle.vehicle_name_snapshot,
             race_extra.resource_code_snapshot,
             delivery.description,
             accommodation.name,
             flight.flight_number,
             rental.company,
             TRIM(carburetor_type.brand || ' ' || carburetor_type.model),
             ''
           ) AS resolvedSubject,
           l.created_at AS createdAt
    FROM audit_logs l
    LEFT JOIN app_users u ON u.email = l.actor_email
    LEFT JOIN work_items w ON l.entity_type = 'task' AND w.id = l.entity_id
    LEFT JOIN app_users target_user ON l.entity_type = 'app_user' AND target_user.id = l.entity_id
    LEFT JOIN race_entries entry ON l.entity_type = 'race_entry' AND entry.id = l.entity_id
    LEFT JOIN races race ON l.entity_type = 'race' AND race.id = l.entity_id
    LEFT JOIN engines engine ON l.entity_type = 'engine' AND engine.id = l.entity_id
    LEFT JOIN carburetors carburetor ON l.entity_type = 'carburetor' AND carburetor.id = l.entity_id
    LEFT JOIN clothing_items clothing_item ON l.entity_type = 'clothing_item' AND clothing_item.id = l.entity_id
    LEFT JOIN drivers driver ON l.entity_type = 'driver' AND driver.id = l.entity_id
    LEFT JOIN teams team ON l.entity_type = 'team' AND team.id = l.entity_id
    LEFT JOIN mechanics mechanic ON l.entity_type = 'mechanic' AND mechanic.id = l.entity_id
    LEFT JOIN vehicles vehicle ON l.entity_type = 'vehicle' AND vehicle.id = l.entity_id
    LEFT JOIN race_templates race_type ON l.entity_type = 'raceType' AND race_type.id = l.entity_id
    LEFT JOIN circuits circuit ON l.entity_type = 'circuit' AND circuit.id = l.entity_id
    LEFT JOIN sales sale ON l.entity_type = 'sale' AND sale.id = l.entity_id
    LEFT JOIN equipment_rentals equipment_rental ON l.entity_type = 'equipment_rental' AND equipment_rental.id = l.entity_id
    LEFT JOIN race_mechanics race_mechanic ON l.entity_type = 'race_mechanic' AND race_mechanic.id = l.entity_id
    LEFT JOIN race_vehicles race_vehicle ON l.entity_type = 'race_vehicle' AND race_vehicle.id = l.entity_id
    LEFT JOIN race_extras race_extra ON l.entity_type = 'race_extra' AND race_extra.id = l.entity_id
    LEFT JOIN race_deliveries delivery ON l.entity_type = 'race_delivery' AND delivery.id = l.entity_id
    LEFT JOIN race_accommodations accommodation ON l.entity_type = 'accommodation' AND accommodation.id = l.entity_id
    LEFT JOIN race_flights flight ON l.entity_type = 'flight' AND flight.id = l.entity_id
    LEFT JOIN race_car_rentals rental ON l.entity_type = 'rental' AND rental.id = l.entity_id
    LEFT JOIN carburetor_types carburetor_type ON l.entity_type = 'carburetorType' AND carburetor_type.id = l.entity_id
    ORDER BY l.created_at DESC
    LIMIT 12
  `).all<ActivityRow>();

  const activity = (result.results ?? []).map((row) => {
    const details = parseDetails(row.details);
    return {
      id: row.id,
      actorName: row.actorName,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      subject: activitySubject(row, details),
      createdAt: Number(row.createdAt),
    };
  });

  return Response.json({ activity });
}
