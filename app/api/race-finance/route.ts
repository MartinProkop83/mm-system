import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type Currency = "CZK" | "EUR";
type PaymentMethod = "" | "cash" | "card" | "bank_transfer";

type FinancePayload = {
  raceId?: unknown;
  raceEntryId?: unknown;
  basePriceCents?: unknown;
  currency?: unknown;
  discountBasisPoints?: unknown;
  paymentMethod?: unknown;
  isPaid?: unknown;
  notes?: unknown;
};

function clean(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function integer(value: unknown, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

function canAccessFinance(role: string) {
  return role === "superadmin" || role === "boss";
}

async function readPayload(request: Request) {
  try {
    return await request.json() as FinancePayload;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessFinance(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const raceId = clean(new URL(request.url).searchParams.get("raceId"), 100);
  if (!raceId) return Response.json({ error: "Race id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const race = await d1.prepare("SELECT id, name, start_date AS startDate, end_date AS endDate, track, country_code AS countryCode, status FROM races WHERE id = ? AND status != 'archived'").bind(raceId).first();
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });

  const [result, salesTotals, raceSales, raceSaleItems] = await Promise.all([d1.prepare(`
    SELECT e.id AS raceEntryId, e.race_id AS raceId, e.category,
           e.driver_id AS driverId, e.driver_name_snapshot AS driverName,
           e.team_name_snapshot AS teamName,
           COALESCE(f.base_price_cents, 0) AS basePriceCents,
           COALESCE(f.currency, CASE WHEN r.country_code = 'CZE' THEN 'CZK' ELSE 'EUR' END) AS currency,
           COALESCE(f.discount_basis_points, 0) AS discountBasisPoints,
           COALESCE(f.final_price_cents, 0) AS finalPriceCents,
           COALESCE(f.payment_method, '') AS paymentMethod,
           COALESCE(f.is_paid, 0) AS isPaid,
           COALESCE(f.notes, '') AS notes,
           COALESCE(f.updated_by, '') AS updatedBy,
           f.updated_at AS updatedAt
    FROM race_entries e
    JOIN races r ON r.id = e.race_id
    LEFT JOIN race_entry_finance f ON f.race_entry_id = e.id
    WHERE e.race_id = ?
    ORDER BY CASE e.category
      WHEN 'BABY' THEN 1 WHEN 'MINI' THEN 2 WHEN 'MINI U10' THEN 3 WHEN 'MINI GR3' THEN 4
      WHEN 'OKJ' THEN 5 WHEN 'OKN-J' THEN 6 WHEN 'OKN' THEN 7 WHEN 'OK' THEN 8 WHEN 'KZ' THEN 9 ELSE 99 END,
      e.driver_name_snapshot
  `).bind(raceId).all(), d1.prepare(`
    SELECT currency,
           COUNT(*) AS saleCount,
           COALESCE(SUM(total_cents), 0) AS totalCents,
           COALESCE(SUM(CASE WHEN is_paid = 1 THEN total_cents ELSE 0 END), 0) AS paidCents
    FROM sales
    WHERE race_id = ? AND voided_at IS NULL
    GROUP BY currency
  `).bind(raceId).all(), d1.prepare(`
    SELECT id, sale_number AS saleNumber, sale_date AS saleDate,
           customer_name AS customerName, document_number AS documentNumber,
           currency, total_cents AS totalCents, payment_method AS paymentMethod,
           is_paid AS isPaid, is_delivered AS isDelivered, notes,
           created_at AS createdAt
    FROM sales
    WHERE race_id = ? AND voided_at IS NULL
    ORDER BY sale_date ASC, created_at ASC
  `).bind(raceId).all(), d1.prepare(`
    SELECT i.id, i.sale_id AS saleId,
           CASE WHEN i.line_kind = 'service' THEN 'service' ELSE i.item_type END AS itemType,
           i.code_snapshot AS code, i.description, i.description_en_snapshot AS descriptionEn, i.quantity,
           i.unit_price_cents AS unitPriceCents, i.line_total_cents AS lineTotalCents
    FROM sale_items i
    JOIN sales s ON s.id = i.sale_id
    WHERE s.race_id = ? AND s.voided_at IS NULL
    ORDER BY s.sale_date ASC, s.created_at ASC, i.rowid ASC
  `).bind(raceId).all()]);

  const saleItemRows = raceSaleItems.results as Array<Record<string, unknown> & { saleId: string }>;

  return Response.json({
    race,
    entries: result.results.map((entry) => ({ ...entry, isPaid: Boolean(entry.isPaid) })),
    salesTotals: salesTotals.results,
    sales: (raceSales.results as Array<Record<string, unknown> & { id: string }>).map((sale) => ({
      ...sale,
      isPaid: Boolean(sale.isPaid),
      isDelivered: Boolean(sale.isDelivered),
      items: saleItemRows.filter((item) => item.saleId === sale.id),
    })),
  });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessFinance(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const raceId = clean(payload.raceId, 100);
  const raceEntryId = clean(payload.raceEntryId, 100);
  const basePriceCents = integer(payload.basePriceCents, 0, 1_000_000_000);
  const discountBasisPoints = integer(payload.discountBasisPoints, 0, 10_000);
  const currency = clean(payload.currency, 3) as Currency;
  const paymentMethod = clean(payload.paymentMethod, 30) as PaymentMethod;
  const notes = clean(payload.notes, 1000);
  const isPaid = payload.isPaid === true || payload.isPaid === 1 || payload.isPaid === "1" || payload.isPaid === "true";
  if (!raceId || !raceEntryId) return Response.json({ error: "Race and entry are required" }, { status: 400 });
  if (basePriceCents === null) return Response.json({ error: "Invalid base price" }, { status: 400 });
  if (discountBasisPoints === null) return Response.json({ error: "Invalid discount" }, { status: 400 });
  if (!(["CZK", "EUR"] as string[]).includes(currency)) return Response.json({ error: "Invalid currency" }, { status: 400 });
  if (!(["", "cash", "card", "bank_transfer"] as string[]).includes(paymentMethod)) return Response.json({ error: "Invalid payment method" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const entry = await d1.prepare(`
    SELECT e.id, e.driver_name_snapshot AS driverName, e.category, r.name AS raceName, r.status
    FROM race_entries e JOIN races r ON r.id = e.race_id
    WHERE e.id = ? AND e.race_id = ? AND r.status != 'archived'
  `).bind(raceEntryId, raceId).first<{ id: string; driverName: string; category: string; raceName: string; status: string }>();
  if (!entry) return Response.json({ error: "Race entry not found" }, { status: 404 });

  const finalPriceCents = Math.round(basePriceCents * (10_000 - discountBasisPoints) / 10_000);
  const before = await d1.prepare("SELECT * FROM race_entry_finance WHERE race_entry_id = ?").bind(raceEntryId).first<Record<string, unknown>>();
  const now = Date.now();
  const details = {
    before: before ?? null,
    after: { raceId, raceName: entry.raceName, driverName: entry.driverName, category: entry.category, basePriceCents, currency, discountBasisPoints, finalPriceCents, paymentMethod, isPaid, notes },
  };

  await d1.batch([
    d1.prepare(`
      INSERT INTO race_entry_finance
        (race_entry_id, race_id, base_price_cents, currency, discount_basis_points, final_price_cents, payment_method, is_paid, notes, created_by, created_at, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(race_entry_id) DO UPDATE SET
        race_id = excluded.race_id,
        base_price_cents = excluded.base_price_cents,
        currency = excluded.currency,
        discount_basis_points = excluded.discount_basis_points,
        final_price_cents = excluded.final_price_cents,
        payment_method = excluded.payment_method,
        is_paid = excluded.is_paid,
        notes = excluded.notes,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).bind(raceEntryId, raceId, basePriceCents, currency, discountBasisPoints, finalPriceCents, paymentMethod, isPaid ? 1 : 0, notes, user.email, now, user.email, now),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, 'race_finance', ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, before ? "update" : "create", raceEntryId, JSON.stringify(details), now),
  ]);

  return Response.json({ raceEntryId, basePriceCents, currency, discountBasisPoints, finalPriceCents, paymentMethod, isPaid, notes, updatedBy: user.fullName, updatedAt: now });
}
