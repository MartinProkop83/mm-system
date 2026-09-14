import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

/**
 * Číselník typů dokumentů u motoru (Faktura, Homologace, …), spravovaný v Nastavení.
 *
 * Čtou superadmin i vedení — oba nahrávají dokumenty a potřebují vybrat typ. Definice
 * (přejmenování, pořadí, příznak „předává se kupci", deaktivace) mění jen superadmin,
 * stejně jako u ostatních číselníků v projektu (servisní karta, materiál).
 *
 * `handOverToBuyer` je zatím jen příznak, který se dá přepnout — samotné předávání
 * dokumentů kupci je neimplementovaný druhý krok.
 */

const SORT_STEP = 10;

type Payload = { id?: string; nameCs?: string; nameEn?: string; handOverToBuyer?: boolean; order?: string[] };

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function codeFromName(nameCs: string) {
  return nameCs
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "type";
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const result = await getD1().prepare(`
    SELECT id, code, name_cs AS nameCs, name_en AS nameEn,
           hand_over_to_buyer AS handOverToBuyer, sort_order AS sortOrder, archived_at AS archivedAt
    FROM engine_document_types
    ORDER BY sort_order
  `).all<{ handOverToBuyer: number; archivedAt: number | null }>();

  return Response.json({
    types: result.results.map((row) => ({
      ...row,
      handOverToBuyer: Boolean(row.handOverToBuyer),
      isActive: row.archivedAt === null,
    })),
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

  const nameCs = clean(payload.nameCs, 120);
  const nameEn = clean(payload.nameEn, 120) || nameCs;
  if (!nameCs) return Response.json({ error: "Name is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const now = Date.now();

  // Kód se z názvu odvozuje jednou, při založení, a dál se nemění — i po přejmenování typu
  // zůstávají staré dokumenty adresované stejným kódem.
  let code = codeFromName(nameCs);
  const collision = await d1.prepare("SELECT id FROM engine_document_types WHERE code = ?").bind(code).first();
  if (collision) code = `${code}_${crypto.randomUUID().slice(0, 6)}`;

  const nextSortOrder = Number((await d1.prepare("SELECT COALESCE(MAX(sort_order), 0) + ? AS value FROM engine_document_types")
    .bind(SORT_STEP).first<{ value: number }>())?.value ?? SORT_STEP);

  const id = crypto.randomUUID();
  await d1.batch([
    d1.prepare(`
      INSERT INTO engine_document_types (id, code, name_cs, name_en, hand_over_to_buyer, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, code, nameCs, nameEn, payload.handOverToBuyer ? 1 : 0, nextSortOrder, auth.user.email, now, now),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'create', 'engine_document_type', ?, ?, ?)
    `).bind(crypto.randomUUID(), auth.user.email, id, JSON.stringify({ nameCs, nameEn }), now),
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
    const statements = payload.order.map((id, index) =>
      d1.prepare("UPDATE engine_document_types SET sort_order = ?, updated_at = ? WHERE id = ?")
        .bind((index + 1) * SORT_STEP, now, id));
    await d1.batch(statements);
    return Response.json({ reordered: payload.order.length });
  }

  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Type id is required" }, { status: 400 });
  const existing = await d1.prepare("SELECT id, name_cs AS nameCs, name_en AS nameEn, hand_over_to_buyer AS handOverToBuyer FROM engine_document_types WHERE id = ?")
    .bind(id).first<{ nameCs: string; nameEn: string; handOverToBuyer: number }>();
  if (!existing) return Response.json({ error: "Type not found" }, { status: 404 });

  const nameCs = payload.nameCs !== undefined ? clean(payload.nameCs, 120) || existing.nameCs : existing.nameCs;
  const nameEn = payload.nameEn !== undefined ? clean(payload.nameEn, 120) || existing.nameEn : existing.nameEn;
  const handOverToBuyer = payload.handOverToBuyer !== undefined ? payload.handOverToBuyer : Boolean(existing.handOverToBuyer);

  await d1.prepare("UPDATE engine_document_types SET name_cs = ?, name_en = ?, hand_over_to_buyer = ?, updated_at = ? WHERE id = ?")
    .bind(nameCs, nameEn, handOverToBuyer ? 1 : 0, now, id).run();
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
  // Deaktivace, nikdy skutečné smazání — starší dokumenty typ dál potřebují k zobrazení.
  const now = Date.now();
  await getD1().prepare("UPDATE engine_document_types SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL")
    .bind(now, now, id).run();
  return Response.json({ id });
}
