import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

/**
 * Hledání napříč zákaznickým servisem: číslo zakázky, jméno zákazníka, e-mail a výrobní
 * číslo zákaznického motoru.
 *
 * Naše motory se tu **nehledají** — ty už umí hledání v dashboardu z dat, která má klient
 * stejně načtená (`engineRows`), a míchat obě evidence do jednoho SQL dotazu by rozmazalo
 * hranici, kterou celý modul drží: zákaznický motor není náš motor.
 *
 * Mimo mechanika úplně — není v `MECHANIC_READ`, takže ho default-deny zastaví.
 */

function clean(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

/** `LIKE` se zástupnými znaky — uživatelský vstup se escapuje, ať `%` v dotazu nehledá všechno. */
function likePattern(query: string) {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const query = clean(url.searchParams.get("q"), 120);
  if (query.length < 2) return Response.json({ customers: [], engines: [], orders: [] });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const pattern = likePattern(query);

  const [customers, engines, orders] = await Promise.all([
    d1.prepare(`
      SELECT id, name, email, phone
      FROM customers
      WHERE archived_at IS NULL AND (name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')
      ORDER BY name COLLATE NOCASE
      LIMIT 6
    `).bind(pattern, pattern).all(),
    d1.prepare(`
      SELECT ce.id, ce.code, ce.customer_id AS customerId, c.name AS customerName,
             t.name_cs AS typeNameCs, t.name_en AS typeNameEn
      FROM customer_engines ce
      JOIN customers c ON c.id = ce.customer_id
      JOIN service_engine_types t ON t.id = ce.service_engine_type_id
      WHERE ce.archived_at IS NULL AND ce.code LIKE ? ESCAPE '\\'
      ORDER BY ce.code COLLATE NOCASE
      LIMIT 6
    `).bind(pattern).all(),
    d1.prepare(`
      SELECT o.id, o.number, o.received_at AS receivedAt, c.name AS customerName
      FROM service_orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.deleted_at IS NULL AND (o.number LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')
      ORDER BY o.received_at DESC
      LIMIT 6
    `).bind(pattern, pattern).all(),
  ]);

  return Response.json({
    customers: customers.results,
    engines: engines.results,
    orders: orders.results,
  });
}
