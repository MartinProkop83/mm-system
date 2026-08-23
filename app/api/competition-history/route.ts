import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { raceLogoUrl } from "../../race-logo";

type HistoryType = "driver" | "team";

function clean(value: unknown, max = 100) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const type = clean(search.get("type"), 10) as HistoryType;
  const id = clean(search.get("id"), 80);
  if (type !== "driver" && type !== "team") return Response.json({ error: "Invalid history type" }, { status: 400 });
  if (!id) return Response.json({ error: "Item id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const subjectStatement = type === "driver"
    ? d1.prepare(`
        SELECT d.id, d.name, d.team_id AS teamId, COALESCE(t.name, '') AS teamName,
               d.default_category AS defaultCategory, d.race_number AS raceNumber,
               d.nationality, d.is_active AS isActive, d.notes,
               d.created_at AS createdAt, d.updated_at AS updatedAt
        FROM drivers d
        LEFT JOIN teams t ON t.id = d.team_id
        WHERE d.id = ? AND d.archived_at IS NULL
      `).bind(id)
    : d1.prepare(`
        SELECT id, name, country_code AS countryCode, notes,
               created_at AS createdAt, updated_at AS updatedAt
        FROM teams
        WHERE id = ? AND archived_at IS NULL
      `).bind(id);

  const historyColumn = type === "driver" ? "e.driver_id" : "e.team_id";
  const canViewFinance = user.role === "superadmin" || user.role === "boss";
  const [subject, assignments] = await Promise.all([
    subjectStatement.first<Record<string, unknown>>(),
    d1.prepare(`
      SELECT e.id, e.driver_id AS driverId, e.driver_name_snapshot AS driverName,
             e.team_id AS teamId, e.team_name_snapshot AS teamName, e.category,
             e.engine_1_code AS engine1Code, e.engine_2_code AS engine2Code,
             e.engine_3_code AS engine3Code,
             e.engine_1_configuration AS engine1Configuration,
             e.engine_2_configuration AS engine2Configuration,
             e.engine_3_configuration AS engine3Configuration,
             e.carburetor_1_code AS carburetor1Code,
             e.carburetor_2_code AS carburetor2Code,
             e.carburetor_3_code AS carburetor3Code,
             e.notes,
             COALESCE(f.base_price_cents, 0) AS basePriceCents,
             COALESCE(f.discount_basis_points, 0) AS discountBasisPoints,
             COALESCE(f.final_price_cents, 0) AS finalPriceCents,
             COALESCE(f.currency, CASE WHEN r.country_code = 'CZE' THEN 'CZK' ELSE 'EUR' END) AS currency,
             COALESCE(f.payment_method, '') AS paymentMethod,
             COALESCE(f.is_paid, 0) AS isPaid,
             r.id AS raceId, r.name AS raceName, r.track, r.address,
             r.country_code AS countryCode, r.start_date AS startDate,
             r.end_date AS endDate, r.departure_date AS departureDate,
             r.return_date AS returnDate, r.organizer,
             r.status AS raceStatus, r.race_template_id AS raceTemplateId,
             rt.logo_key AS logoKey, rt.logo_updated_at AS logoUpdatedAt
      FROM race_entries e
      JOIN races r ON r.id = e.race_id
      LEFT JOIN race_entry_finance f ON f.race_entry_id = e.id
      LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      WHERE ${historyColumn} = ? AND r.status != 'archived'
      ORDER BY r.start_date DESC, e.category, e.driver_name_snapshot
    `).bind(id).all<Record<string, unknown>>(),
  ]);

  if (!subject) return Response.json({ error: type === "driver" ? "Driver not found" : "Team not found" }, { status: 404 });
  const normalizedSubject = type === "driver" ? { ...subject, isActive: Boolean(subject.isActive) } : subject;
  return Response.json({
    type,
    canViewFinance,
    subject: normalizedSubject,
    assignments: (assignments.results as Array<Record<string, unknown>>).map((assignment) => ({
      ...assignment,
      basePriceCents: canViewFinance ? Number(assignment.basePriceCents ?? 0) : 0,
      discountBasisPoints: canViewFinance ? Number(assignment.discountBasisPoints ?? 0) : 0,
      finalPriceCents: canViewFinance ? Number(assignment.finalPriceCents ?? 0) : 0,
      currency: canViewFinance ? assignment.currency : "",
      paymentMethod: canViewFinance ? assignment.paymentMethod : "",
      isPaid: canViewFinance ? Boolean(assignment.isPaid) : false,
      logoUrl: raceLogoUrl(assignment.raceTemplateId, assignment.logoKey, assignment.logoUpdatedAt),
    })),
  });
}
