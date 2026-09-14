import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

/**
 * Číselník typů motorů pro zakázkový servis (zákaznické motory).
 *
 * Schválně **nezávislý na `engine_categories`** — v našich kategoriích je MINI, OKJ, OK, KZ,
 * ale k zákazníkům jezdí i motokros a další věci, které tam nemají co dělat. Míchat obojí
 * do jednoho číselníku by znamenalo cizí typy v desce fronty a v servisní kartě našich motorů.
 *
 * Definice mění jen superadmin, stejně jako u ostatních číselníků. Číselník se neseeduje —
 * plní se ručně v Nastavení.
 */

const SORT_STEP = 10;

type Payload = { id?: string; code?: string; nameCs?: string; nameEn?: string; order?: string[] };

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const result = await getD1().prepare(`
    SELECT id, code, name_cs AS nameCs, name_en AS nameEn, sort_order AS sortOrder, archived_at AS archivedAt
    FROM service_engine_types
    ORDER BY sort_order
  `).all<{ archivedAt: number | null }>();

  return auth.json({
    types: result.results.map((row) => ({ ...row, isActive: row.archivedAt === null })),
  });
}

export async function POST(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = clean(payload.code, 40);
  const nameCs = clean(payload.nameCs, 120);
  const nameEn = clean(payload.nameEn, 120) || nameCs;
  if (!code) return Response.json({ error: "Code is required" }, { status: 400 });
  if (!nameCs) return Response.json({ error: "Name is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const collision = await d1.prepare("SELECT id FROM service_engine_types WHERE LOWER(code) = LOWER(?) AND archived_at IS NULL").bind(code).first();
  if (collision) return Response.json({ error: "Code already exists" }, { status: 409 });

  const nextSortOrder = Number((await d1.prepare("SELECT COALESCE(MAX(sort_order), 0) + ? AS value FROM service_engine_types")
    .bind(SORT_STEP).first<{ value: number }>())?.value ?? SORT_STEP);

  const id = crypto.randomUUID();
  const now = Date.now();
  await d1.batch([
    d1.prepare(`
      INSERT INTO service_engine_types (id, code, name_cs, name_en, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, code, nameCs, nameEn, nextSortOrder, auth.user.email, now, now),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'create', 'service_engine_type', ?, ?, ?)
    `).bind(crypto.randomUUID(), auth.user.email, id, JSON.stringify({ code, nameCs, nameEn }), now),
  ]);
  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await ensureRuntimeSchema();
  const d1 = getD1();
  const now = Date.now();

  // Přetažením v Nastavení se pořadí přepočítá s krokem 10, stejně jako u ostatních číselníků.
  if (payload.order) {
    await d1.batch(payload.order.map((id, index) =>
      d1.prepare("UPDATE service_engine_types SET sort_order = ?, updated_at = ? WHERE id = ?")
        .bind((index + 1) * SORT_STEP, now, id)));
    return Response.json({ reordered: payload.order.length });
  }

  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Type id is required" }, { status: 400 });
  const existing = await d1.prepare("SELECT id, code, name_cs AS nameCs, name_en AS nameEn FROM service_engine_types WHERE id = ?")
    .bind(id).first<{ code: string; nameCs: string; nameEn: string }>();
  if (!existing) return Response.json({ error: "Type not found" }, { status: 404 });

  const code = payload.code !== undefined ? clean(payload.code, 40) || existing.code : existing.code;
  const nameCs = payload.nameCs !== undefined ? clean(payload.nameCs, 120) || existing.nameCs : existing.nameCs;
  const nameEn = payload.nameEn !== undefined ? clean(payload.nameEn, 120) || existing.nameEn : existing.nameEn;

  if (code.toLowerCase() !== existing.code.toLowerCase()) {
    const collision = await d1.prepare("SELECT id FROM service_engine_types WHERE LOWER(code) = LOWER(?) AND archived_at IS NULL AND id != ?").bind(code, id).first();
    if (collision) return Response.json({ error: "Code already exists" }, { status: 409 });
  }

  await d1.prepare("UPDATE service_engine_types SET code = ?, name_cs = ?, name_en = ?, updated_at = ? WHERE id = ?")
    .bind(code, nameCs, nameEn, now, id).run();
  return Response.json({ id });
}

export async function DELETE(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Type id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();

  // Deaktivace, nikdy skutečné smazání — zákaznické motory typ dál potřebují k zobrazení.
  // Typ, na kterém visí motor, ale zmizí z nabídky při zakládání nového.
  const now = Date.now();
  await d1.prepare("UPDATE service_engine_types SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL")
    .bind(now, now, id).run();
  return Response.json({ id });
}
