import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

/**
 * Ceník prací pro zakázkový servis.
 *
 * Ceny jsou **bez DPH** a vedou se v obou měnách natvrdo — kurzem se nikdy nepřepočítávají,
 * protože eurová cena není přepočet korunové, ale vlastní cena pro zahraniční zákazníky.
 * V databázi jsou v haléřích a centech (`*_cents`, jako u prodejů a skladu), v UI se zadávají
 * celé koruny a eura.
 *
 * `groupName` je volný text, ne číselník — v UI se našeptává z už použitých skupin. Zakázka
 * si z položky bere **snapshot** kódu, názvu i obou cen, takže pozdější změna ceníku nikdy
 * nepřepíše, co bylo účtováno.
 *
 * Definice mění jen superadmin. Číselník se neseeduje, plní se ručně v Nastavení.
 */

const SORT_STEP = 10;

type Payload = {
  id?: string; code?: string; nameCs?: string; nameEn?: string;
  materialIncludedCs?: string; materialIncludedEn?: string;
  priceCzkCents?: number; priceEurCents?: number; groupName?: string;
  order?: string[];
};

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

/** Cena nikdy záporná a vždy celé haléře — do UI se vrací jako koruny a eura. */
function cents(value: unknown) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const result = await getD1().prepare(`
    SELECT id, code, name_cs AS nameCs, name_en AS nameEn,
           material_included_cs AS materialIncludedCs, material_included_en AS materialIncludedEn,
           price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents,
           group_name AS groupName, sort_order AS sortOrder, archived_at AS archivedAt
    FROM service_price_items
    ORDER BY sort_order
  `).all<{ groupName: string; archivedAt: number | null }>();

  const items = result.results.map((row) => ({ ...row, isActive: row.archivedAt === null }));
  return auth.json({
    items,
    // Našeptávač skupin v Nastavení — ať se „Motor“ nezapíše podruhé jako „motor“.
    groups: Array.from(new Set(items.map((item) => item.groupName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "cs")),
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
  const nameCs = clean(payload.nameCs, 160);
  const nameEn = clean(payload.nameEn, 160) || nameCs;
  if (!code) return Response.json({ error: "Code is required" }, { status: 400 });
  if (!nameCs) return Response.json({ error: "Name is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const collision = await d1.prepare("SELECT id FROM service_price_items WHERE LOWER(code) = LOWER(?) AND archived_at IS NULL").bind(code).first();
  if (collision) return Response.json({ error: "Code already exists" }, { status: 409 });

  const nextSortOrder = Number((await d1.prepare("SELECT COALESCE(MAX(sort_order), 0) + ? AS value FROM service_price_items")
    .bind(SORT_STEP).first<{ value: number }>())?.value ?? SORT_STEP);

  const id = crypto.randomUUID();
  const now = Date.now();
  const priceCzkCents = cents(payload.priceCzkCents);
  const priceEurCents = cents(payload.priceEurCents);
  await d1.batch([
    d1.prepare(`
      INSERT INTO service_price_items (id, code, name_cs, name_en, material_included_cs, material_included_en, price_czk_cents, price_eur_cents, group_name, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, code, nameCs, nameEn, clean(payload.materialIncludedCs, 400), clean(payload.materialIncludedEn, 400),
      priceCzkCents, priceEurCents, clean(payload.groupName, 80), nextSortOrder, auth.user.email, now, now),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'create', 'service_price_item', ?, ?, ?)
    `).bind(crypto.randomUUID(), auth.user.email, id, JSON.stringify({ code, nameCs, priceCzkCents, priceEurCents }), now),
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

  if (payload.order) {
    await d1.batch(payload.order.map((id, index) =>
      d1.prepare("UPDATE service_price_items SET sort_order = ?, updated_at = ? WHERE id = ?")
        .bind((index + 1) * SORT_STEP, now, id)));
    return Response.json({ reordered: payload.order.length });
  }

  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Price item id is required" }, { status: 400 });
  const existing = await d1.prepare(`
    SELECT id, code, name_cs AS nameCs, name_en AS nameEn,
           material_included_cs AS materialIncludedCs, material_included_en AS materialIncludedEn,
           price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents, group_name AS groupName
    FROM service_price_items WHERE id = ?
  `).bind(id).first<{
    code: string; nameCs: string; nameEn: string; materialIncludedCs: string; materialIncludedEn: string;
    priceCzkCents: number; priceEurCents: number; groupName: string;
  }>();
  if (!existing) return Response.json({ error: "Price item not found" }, { status: 404 });

  const code = payload.code !== undefined ? clean(payload.code, 40) || existing.code : existing.code;
  const nameCs = payload.nameCs !== undefined ? clean(payload.nameCs, 160) || existing.nameCs : existing.nameCs;
  const nameEn = payload.nameEn !== undefined ? clean(payload.nameEn, 160) || existing.nameEn : existing.nameEn;
  const materialIncludedCs = payload.materialIncludedCs !== undefined ? clean(payload.materialIncludedCs, 400) : existing.materialIncludedCs;
  const materialIncludedEn = payload.materialIncludedEn !== undefined ? clean(payload.materialIncludedEn, 400) : existing.materialIncludedEn;
  const groupName = payload.groupName !== undefined ? clean(payload.groupName, 80) : existing.groupName;
  // Nula je platná cena (práce v ceně jiné položky), takže se rozlišuje „neposláno“ od „0“.
  const priceCzkCents = payload.priceCzkCents !== undefined ? cents(payload.priceCzkCents) : existing.priceCzkCents;
  const priceEurCents = payload.priceEurCents !== undefined ? cents(payload.priceEurCents) : existing.priceEurCents;

  if (code.toLowerCase() !== existing.code.toLowerCase()) {
    const collision = await d1.prepare("SELECT id FROM service_price_items WHERE LOWER(code) = LOWER(?) AND archived_at IS NULL AND id != ?").bind(code, id).first();
    if (collision) return Response.json({ error: "Code already exists" }, { status: 409 });
  }

  await d1.prepare(`
    UPDATE service_price_items
    SET code = ?, name_cs = ?, name_en = ?, material_included_cs = ?, material_included_en = ?,
        price_czk_cents = ?, price_eur_cents = ?, group_name = ?, updated_at = ?
    WHERE id = ?
  `).bind(code, nameCs, nameEn, materialIncludedCs, materialIncludedEn, priceCzkCents, priceEurCents, groupName, now, id).run();
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
  if (!id) return Response.json({ error: "Price item id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  // Deaktivace, nikdy skutečné smazání — na starých zakázkách položka dál figuruje.
  const now = Date.now();
  await getD1().prepare("UPDATE service_price_items SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL")
    .bind(now, now, id).run();
  return Response.json({ id });
}
