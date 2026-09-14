import { getD1 } from "../../../db";
import { ensureRuntimeSchema, migrateLegacyServiceEntries, revertLegacyServiceImport, IMPORT_SOURCE_COUNTER_CARRYOVER } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";
import { SORT_STEP } from "../../service-card-shared";

/**
 * Číselníky modulu „Nastavení → Servisní karta" — typy servisu, položky karty a katalog
 * materiálu, vždy v rámci jedné kategorie motoru. Jen pro superadmina; samotný zápis servisu
 * má vlastní routu `/api/service-records` a je dostupný i mechanikovi.
 *
 * Stejný tvar jako `/api/engine-technical-structure`: jedna routa, `payload.kind` rozlišuje
 * entitu. Mazání je vždy archivace (`archived_at`), nikdy DELETE — položky a varianty použité
 * v historii musí zůstat čitelné.
 */

type Kind =
  | "category"
  | "serviceType"
  | "defaultItems"
  | "cardItem"
  | "materialCategory"
  | "materialAttribute"
  | "materialVariant"
  | "reorder"
  | "migrateCategory"
  | "migrateHistory"
  | "revertHistoryImport";

type Payload = {
  kind?: Kind;
  id?: string;
  categoryId?: string;
  serviceTypeId?: string;
  materialCategoryId?: string;
  itemIds?: string[];
  ids?: string[];
  resource?: string;
  code?: string;
  nameCs?: string;
  nameEn?: string;
  name?: string;
  descriptionCs?: string;
  descriptionEn?: string;
  attributeType?: string;
  unit?: string;
  options?: string[];
  attributeValues?: Record<string, string>;
  materialCategory?: string | null;
  intervalMinutes?: number | null;
  warnPercent?: number;
  counterUnit?: string | null;
  technicalFieldId?: string | null;
  isActive?: boolean;
};

const ATTRIBUTE_TYPES = new Set(["dropdown", "number", "text"]);
const COUNTER_UNITS = new Set(["hours", "days", "race_weekends"]);

/** Tabulky adresovatelné přes `kind` — sdílené archivací i přeskládáním pořadí. */
const TABLE_BY_KIND: Partial<Record<Kind, string>> = {
  serviceType: "service_types",
  cardItem: "service_card_items",
  materialCategory: "material_categories",
  materialAttribute: "material_attributes",
  materialVariant: "material_variants",
};

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

async function requireSuperadmin(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return { error: auth.error } as const;
  const user = auth.user;
  if (user.role !== "superadmin") return { error: Response.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { user } as const;
}

async function readPayload(request: Request) {
  try {
    return { payload: (await request.json()) as Payload } as const;
  } catch {
    return { error: Response.json({ error: "Invalid JSON" }, { status: 400 }) } as const;
  }
}

/** Další sort_order v řadě — po desítkách, aby vložení doprostřed přepsalo jeden řádek. */
async function nextSortOrder(d1: ReturnType<typeof getD1>, table: string, column: string, parentId: string) {
  const row = await d1.prepare(`SELECT MAX(sort_order) AS maxSort FROM ${table} WHERE ${column} = ?`).bind(parentId).first<{ maxSort: number | null }>();
  return (row?.maxSort ?? 0) + SORT_STEP;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  // Čtení smí i mechanik — bez položek karty a katalogu materiálu nemá jak zapsat servis.
  // Zápisy níž si dál hlídá requireSuperadmin.
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const url = new URL(request.url);

  // Náhled přenosu staré historie — nic nezapisuje, jen spočítá a vrátí vzorek ke kontrole.
  // Ostrý běh je samostatná akce `migrateHistory` níže.
  if (url.searchParams.get("preview") === "migration") {
    return Response.json({ preview: await migrateLegacyServiceEntries(d1, { dryRun: true }) });
  }

  const requested = clean(url.searchParams.get("categoryId"), 80);

  const categories = await d1.prepare(`
    SELECT id, code, name_cs AS nameCs, name_en AS nameEn, sort_order AS sortOrder,
           counter_unit AS counterUnit, service_card_migrated AS serviceCardMigrated,
           archived_at AS archivedAt
    FROM engine_categories
    ORDER BY sort_order
  `).all<{ id: string; code: string; serviceCardMigrated: number }>();

  const categoryId = categories.results.some((category) => category.id === requested)
    ? requested
    : categories.results[0]?.id ?? "";
  if (!categoryId) return auth.json({ categories: [], categoryId: "", serviceTypes: [], defaultItems: [], cardItems: [], materialCategories: [], materialAttributes: [], materialVariants: [] });

  const [serviceTypes, cardItems, materialCategories] = await Promise.all([
    d1.prepare(`
      SELECT id, engine_category_id AS engineCategoryId, code, name_cs AS nameCs, name_en AS nameEn,
             description_cs AS descriptionCs, description_en AS descriptionEn,
             sort_order AS sortOrder, archived_at AS archivedAt
      FROM service_types WHERE engine_category_id = ? ORDER BY sort_order
    `).bind(categoryId).all(),
    d1.prepare(`
      SELECT id, engine_category_id AS engineCategoryId, name_cs AS nameCs, name_en AS nameEn,
             material_category_id AS materialCategoryId, interval_minutes AS intervalMinutes,
             warn_percent AS warnPercent, legacy_part_key AS legacyPartKey,
             sort_order AS sortOrder, archived_at AS archivedAt
      FROM service_card_items WHERE engine_category_id = ? ORDER BY sort_order
    `).bind(categoryId).all(),
    d1.prepare(`
      SELECT id, engine_category_id AS engineCategoryId, name_cs AS nameCs, name_en AS nameEn,
             sort_order AS sortOrder, archived_at AS archivedAt
      FROM material_categories WHERE engine_category_id = ? ORDER BY sort_order
    `).bind(categoryId).all(),
  ]);

  const materialIds = (materialCategories.results as Array<{ id: string }>).map((category) => category.id);
  const placeholders = materialIds.map(() => "?").join(", ");
  const [attributes, variants, defaults] = await Promise.all([
    materialIds.length === 0 ? Promise.resolve({ results: [] }) : d1.prepare(`
      SELECT id, material_category_id AS materialCategoryId, name_cs AS nameCs, name_en AS nameEn,
             attribute_type AS attributeType, unit, options, technical_field_id AS technicalFieldId,
             sort_order AS sortOrder, archived_at AS archivedAt
      FROM material_attributes WHERE material_category_id IN (${placeholders}) ORDER BY sort_order
    `).bind(...materialIds).all<{ options: string }>(),
    materialIds.length === 0 ? Promise.resolve({ results: [] }) : d1.prepare(`
      SELECT id, material_category_id AS materialCategoryId, name, attribute_values AS attributeValues, archived_at AS archivedAt
      FROM material_variants WHERE material_category_id IN (${placeholders}) ORDER BY name
    `).bind(...materialIds).all<{ attributeValues: string }>(),
    d1.prepare(`
      SELECT d.service_type_id AS serviceTypeId, d.service_card_item_id AS serviceCardItemId
      FROM service_type_default_items d
      JOIN service_types t ON t.id = d.service_type_id
      WHERE t.engine_category_id = ?
    `).bind(categoryId).all(),
  ]);

  // Pole technických údajů téže rodiny — nabídka pro vazbu atributu (varianta C: obě místa
  // zůstávají, ale formulář servisu pozná, že se rozcházejí).
  const categoryCode = categories.results.find((category) => category.id === categoryId)?.code ?? "";
  const technicalFields = await d1.prepare(`
    SELECT f.id, f.label_cs AS labelCs, f.label_en AS labelEn, s.label_cs AS sectionCs
    FROM engine_technical_fields f
    JOIN engine_technical_sections s ON s.id = f.section_id
    WHERE s.family = ? AND f.archived_at IS NULL AND s.archived_at IS NULL AND f.field_type = 'select'
    ORDER BY s.sort_order, f.sort_order
  `).bind(categoryCode).all();

  return auth.json({
    technicalFields: technicalFields.results,
    categories: categories.results.map((category) => ({ ...category, serviceCardMigrated: Boolean(category.serviceCardMigrated) })),
    categoryId,
    serviceTypes: serviceTypes.results,
    defaultItems: defaults.results,
    cardItems: cardItems.results,
    materialCategories: materialCategories.results,
    materialAttributes: (attributes.results as Array<{ options: string }>).map((attribute) => ({ ...attribute, options: parseJson<string[]>(attribute.options, []) })),
    materialVariants: (variants.results as Array<{ attributeValues: string }>).map((variant) => ({ ...variant, attributeValues: parseJson<Record<string, string>>(variant.attributeValues, {}) })),
  });
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin(request);
  if (auth.error) return auth.error;
  const body = await readPayload(request);
  if (body.error) return body.error;
  const { payload } = body;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const now = Date.now();
  const id = crypto.randomUUID();
  const actor = auth.user.email;

  if (payload.kind === "serviceType") {
    const categoryId = clean(payload.categoryId, 80);
    const code = clean(payload.code, 40);
    const nameCs = clean(payload.nameCs);
    const nameEn = clean(payload.nameEn) || nameCs;
    if (!categoryId || !code || !nameCs) return Response.json({ error: "Category, code and name are required" }, { status: 400 });

    const duplicate = await d1.prepare("SELECT id FROM service_types WHERE engine_category_id = ? AND code = ? AND archived_at IS NULL").bind(categoryId, code).first();
    if (duplicate) return Response.json({ error: "A service type with this code already exists" }, { status: 409 });

    await d1.prepare(`
      INSERT INTO service_types (id, engine_category_id, code, name_cs, name_en, description_cs, description_en, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, categoryId, code, nameCs, nameEn, clean(payload.descriptionCs, 600), clean(payload.descriptionEn, 600), await nextSortOrder(d1, "service_types", "engine_category_id", categoryId), actor, now, now).run();
    return Response.json({ id }, { status: 201 });
  }

  if (payload.kind === "cardItem") {
    const categoryId = clean(payload.categoryId, 80);
    const nameCs = clean(payload.nameCs);
    const nameEn = clean(payload.nameEn) || nameCs;
    if (!categoryId || !nameCs) return Response.json({ error: "Category and name are required" }, { status: 400 });

    await d1.prepare(`
      INSERT INTO service_card_items (id, engine_category_id, name_cs, name_en, material_category_id, interval_minutes, warn_percent, legacy_part_key, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
    `).bind(id, categoryId, nameCs, nameEn, clean(payload.materialCategory, 80) || null, normalizeInterval(payload.intervalMinutes), normalizeWarnPercent(payload.warnPercent), await nextSortOrder(d1, "service_card_items", "engine_category_id", categoryId), actor, now, now).run();
    return Response.json({ id }, { status: 201 });
  }

  if (payload.kind === "materialCategory") {
    const categoryId = clean(payload.categoryId, 80);
    const nameCs = clean(payload.nameCs);
    if (!categoryId || !nameCs) return Response.json({ error: "Category and name are required" }, { status: 400 });

    await d1.prepare(`
      INSERT INTO material_categories (id, engine_category_id, name_cs, name_en, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, categoryId, nameCs, clean(payload.nameEn) || nameCs, await nextSortOrder(d1, "material_categories", "engine_category_id", categoryId), actor, now, now).run();
    return Response.json({ id }, { status: 201 });
  }

  if (payload.kind === "materialAttribute") {
    const materialCategoryId = clean(payload.materialCategoryId, 80);
    const nameCs = clean(payload.nameCs);
    const attributeType = clean(payload.attributeType, 20) || "text";
    if (!materialCategoryId || !nameCs) return Response.json({ error: "Material category and name are required" }, { status: 400 });
    if (!ATTRIBUTE_TYPES.has(attributeType)) return Response.json({ error: "Invalid attribute type" }, { status: 400 });

    await d1.prepare(`
      INSERT INTO material_attributes (id, material_category_id, name_cs, name_en, attribute_type, unit, options, technical_field_id, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, materialCategoryId, nameCs, clean(payload.nameEn) || nameCs, attributeType, clean(payload.unit, 20), JSON.stringify(normalizeOptions(payload.options, attributeType)), clean(payload.technicalFieldId, 80) || null, await nextSortOrder(d1, "material_attributes", "material_category_id", materialCategoryId), actor, now, now).run();
    return Response.json({ id }, { status: 201 });
  }

  if (payload.kind === "materialVariant") {
    const materialCategoryId = clean(payload.materialCategoryId, 80);
    const name = clean(payload.name, 200);
    if (!materialCategoryId || !name) return Response.json({ error: "Material category and name are required" }, { status: 400 });

    await d1.prepare(`
      INSERT INTO material_variants (id, material_category_id, name, attribute_values, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, materialCategoryId, name, JSON.stringify(payload.attributeValues ?? {}), actor, now, now).run();
    return Response.json({ id }, { status: 201 });
  }

  if (payload.kind === "migrateCategory") return migrateCategory(d1, clean(payload.categoryId, 80), actor, now);

  // Ostrý přenos staré historie, spouštěný ručně z UI po kontrole náhledu.
  if (payload.kind === "migrateHistory") {
    return Response.json({ migrated: await migrateLegacyServiceEntries(d1, { dryRun: false }) });
  }

  // Záchranná brzda: smaže jen to, co přenos založil. Ruční zápisy zůstávají.
  if (payload.kind === "revertHistoryImport") {
    return Response.json({ reverted: await revertLegacyServiceImport(d1) });
  }

  return Response.json({ error: "Invalid kind" }, { status: 400 });
}

export async function PUT(request: Request) {
  const auth = await requireSuperadmin(request);
  if (auth.error) return auth.error;
  const body = await readPayload(request);
  if (body.error) return body.error;
  const { payload } = body;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const now = Date.now();
  const id = clean(payload.id, 80);

  // Přeskládání pořadí: celý seznam se přepíše na 10, 20, 30… jedním batchem.
  if (payload.kind === "reorder") {
    const table = TABLE_BY_KIND[payload.resource as Kind];
    const ids = (payload.ids ?? []).map((value) => clean(value, 80)).filter(Boolean);
    if (!table || ids.length === 0) return Response.json({ error: "Invalid reorder request" }, { status: 400 });
    await d1.batch(ids.map((itemId, index) =>
      d1.prepare(`UPDATE ${table} SET sort_order = ?, updated_at = ? WHERE id = ?`).bind((index + 1) * SORT_STEP, now, itemId)
    ));
    return Response.json({ ok: true });
  }

  // Výchozí položky typu servisu. Nahrazují se celé — mezi typy není žádná dědičnost ani
  // trvalá vazba, takže „Převzít z…" v UI jen pošle zkopírovaný seznam sem.
  if (payload.kind === "defaultItems") {
    const serviceTypeId = clean(payload.serviceTypeId, 80);
    if (!serviceTypeId) return Response.json({ error: "Service type is required" }, { status: 400 });
    const itemIds = Array.from(new Set((payload.itemIds ?? []).map((value) => clean(value, 80)).filter(Boolean)));
    await d1.batch([
      d1.prepare("DELETE FROM service_type_default_items WHERE service_type_id = ?").bind(serviceTypeId),
      ...itemIds.map((itemId) => d1.prepare(`
        INSERT INTO service_type_default_items (id, service_type_id, service_card_item_id, created_at) VALUES (?, ?, ?, ?)
      `).bind(crypto.randomUUID(), serviceTypeId, itemId, now)),
    ]);
    return Response.json({ ok: true });
  }

  if (!id) return Response.json({ error: "Id is required" }, { status: 400 });

  if (payload.kind === "category") {
    const counterUnit = payload.counterUnit === null || payload.counterUnit === "" ? null : clean(payload.counterUnit, 20);
    if (counterUnit !== null && !COUNTER_UNITS.has(counterUnit)) return Response.json({ error: "Invalid counter unit" }, { status: 400 });
    await d1.prepare("UPDATE engine_categories SET counter_unit = ?, updated_at = ? WHERE id = ?").bind(counterUnit, now, id).run();
    return Response.json({ ok: true });
  }

  if (payload.kind === "serviceType") {
    const existing = await d1.prepare(`
      SELECT engine_category_id AS categoryId, code, name_cs AS nameCs, name_en AS nameEn,
             description_cs AS descriptionCs, description_en AS descriptionEn, archived_at AS archivedAt
      FROM service_types WHERE id = ?
    `).bind(id).first<{ categoryId: string; code: string; nameCs: string; nameEn: string; descriptionCs: string; descriptionEn: string; archivedAt: number | null }>();
    if (!existing) return Response.json({ error: "Service type not found" }, { status: 404 });

    const code = payload.code !== undefined ? clean(payload.code, 40) : existing.code;
    const nameCs = payload.nameCs !== undefined ? clean(payload.nameCs) : existing.nameCs;
    if (!code || !nameCs) return Response.json({ error: "Code and name are required" }, { status: 400 });

    const duplicate = await d1.prepare("SELECT id FROM service_types WHERE engine_category_id = ? AND code = ? AND id != ? AND archived_at IS NULL").bind(existing.categoryId, code, id).first();
    if (duplicate) return Response.json({ error: "A service type with this code already exists" }, { status: 409 });

    await d1.prepare(`
      UPDATE service_types SET code = ?, name_cs = ?, name_en = ?, description_cs = ?, description_en = ?, archived_at = ?, updated_at = ? WHERE id = ?
    `).bind(code, nameCs,
      payload.nameEn !== undefined ? clean(payload.nameEn) || nameCs : existing.nameEn,
      payload.descriptionCs !== undefined ? clean(payload.descriptionCs, 600) : existing.descriptionCs,
      payload.descriptionEn !== undefined ? clean(payload.descriptionEn, 600) : existing.descriptionEn,
      activeFlagToArchivedAt(payload.isActive, now, existing.archivedAt), now, id).run();
    return Response.json({ ok: true });
  }

  if (payload.kind === "cardItem") {
    // Pole, která klient neposlal, se nepřepisují — jinak by částečný payload (jen přejmenování)
    // potichu zahodil vazbu na materiál nebo interval.
    const existing = await d1.prepare(`
      SELECT name_cs AS nameCs, name_en AS nameEn, material_category_id AS materialCategoryId,
             interval_minutes AS intervalMinutes, warn_percent AS warnPercent, archived_at AS archivedAt
      FROM service_card_items WHERE id = ?
    `).bind(id).first<{ nameCs: string; nameEn: string; materialCategoryId: string | null; intervalMinutes: number | null; warnPercent: number; archivedAt: number | null }>();
    if (!existing) return Response.json({ error: "Card item not found" }, { status: 404 });

    const nameCs = payload.nameCs !== undefined ? clean(payload.nameCs) : existing.nameCs;
    if (!nameCs) return Response.json({ error: "Name is required" }, { status: 400 });
    const nameEn = payload.nameEn !== undefined ? clean(payload.nameEn) || nameCs : existing.nameEn;
    const materialCategoryId = payload.materialCategory !== undefined ? clean(payload.materialCategory, 80) || null : existing.materialCategoryId;
    const intervalMinutes = payload.intervalMinutes !== undefined ? normalizeInterval(payload.intervalMinutes) : existing.intervalMinutes;
    const warnPercent = payload.warnPercent !== undefined ? normalizeWarnPercent(payload.warnPercent) : existing.warnPercent;

    await d1.prepare(`
      UPDATE service_card_items SET name_cs = ?, name_en = ?, material_category_id = ?, interval_minutes = ?, warn_percent = ?, archived_at = ?, updated_at = ? WHERE id = ?
    `).bind(nameCs, nameEn, materialCategoryId, intervalMinutes, warnPercent, activeFlagToArchivedAt(payload.isActive, now, existing.archivedAt), now, id).run();
    return Response.json({ ok: true });
  }

  if (payload.kind === "materialCategory") {
    const existing = await d1.prepare("SELECT name_cs AS nameCs, name_en AS nameEn, archived_at AS archivedAt FROM material_categories WHERE id = ?")
      .bind(id).first<{ nameCs: string; nameEn: string; archivedAt: number | null }>();
    if (!existing) return Response.json({ error: "Material category not found" }, { status: 404 });
    const nameCs = payload.nameCs !== undefined ? clean(payload.nameCs) : existing.nameCs;
    if (!nameCs) return Response.json({ error: "Name is required" }, { status: 400 });
    await d1.prepare("UPDATE material_categories SET name_cs = ?, name_en = ?, archived_at = ?, updated_at = ? WHERE id = ?")
      .bind(nameCs, payload.nameEn !== undefined ? clean(payload.nameEn) || nameCs : existing.nameEn,
        activeFlagToArchivedAt(payload.isActive, now, existing.archivedAt), now, id).run();
    return Response.json({ ok: true });
  }

  if (payload.kind === "materialAttribute") {
    const existing = await d1.prepare(`
      SELECT name_cs AS nameCs, name_en AS nameEn, attribute_type AS attributeType, unit, options,
             technical_field_id AS technicalFieldId, archived_at AS archivedAt
      FROM material_attributes WHERE id = ?
    `).bind(id).first<{ nameCs: string; nameEn: string; attributeType: string; unit: string; options: string; technicalFieldId: string | null; archivedAt: number | null }>();
    if (!existing) return Response.json({ error: "Attribute not found" }, { status: 404 });

    const nameCs = payload.nameCs !== undefined ? clean(payload.nameCs) : existing.nameCs;
    const attributeType = payload.attributeType !== undefined ? clean(payload.attributeType, 20) || "text" : existing.attributeType;
    if (!nameCs) return Response.json({ error: "Name is required" }, { status: 400 });
    if (!ATTRIBUTE_TYPES.has(attributeType)) return Response.json({ error: "Invalid attribute type" }, { status: 400 });

    // Options se přepočítají i při pouhé změně typu — přepnutím z dropdownu ztrácejí smysl.
    const options = payload.options !== undefined || payload.attributeType !== undefined
      ? JSON.stringify(normalizeOptions(payload.options ?? parseJson<string[]>(existing.options, []), attributeType))
      : existing.options;

    await d1.prepare(`
      UPDATE material_attributes SET name_cs = ?, name_en = ?, attribute_type = ?, unit = ?, options = ?, technical_field_id = ?, archived_at = ?, updated_at = ? WHERE id = ?
    `).bind(nameCs, payload.nameEn !== undefined ? clean(payload.nameEn) || nameCs : existing.nameEn, attributeType,
      payload.unit !== undefined ? clean(payload.unit, 20) : existing.unit, options,
      payload.technicalFieldId !== undefined ? clean(payload.technicalFieldId, 80) || null : existing.technicalFieldId,
      activeFlagToArchivedAt(payload.isActive, now, existing.archivedAt), now, id).run();
    return Response.json({ ok: true });
  }

  if (payload.kind === "materialVariant") {
    const existing = await d1.prepare("SELECT name, attribute_values AS attributeValues, archived_at AS archivedAt FROM material_variants WHERE id = ?")
      .bind(id).first<{ name: string; attributeValues: string; archivedAt: number | null }>();
    if (!existing) return Response.json({ error: "Variant not found" }, { status: 404 });
    const name = payload.name !== undefined ? clean(payload.name, 200) : existing.name;
    if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
    await d1.prepare("UPDATE material_variants SET name = ?, attribute_values = ?, archived_at = ?, updated_at = ? WHERE id = ?")
      .bind(name, payload.attributeValues !== undefined ? JSON.stringify(payload.attributeValues) : existing.attributeValues,
        activeFlagToArchivedAt(payload.isActive, now, existing.archivedAt), now, id).run();
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Invalid kind" }, { status: 400 });
}

/** Mazání je vždy archivace — položky a varianty použité v historii musí zůstat čitelné. */
export async function DELETE(request: Request) {
  const auth = await requireSuperadmin(request);
  if (auth.error) return auth.error;
  const body = await readPayload(request);
  if (body.error) return body.error;

  const table = TABLE_BY_KIND[body.payload.kind as Kind];
  const id = clean(body.payload.id, 80);
  if (!table || !id) return Response.json({ error: "Invalid delete request" }, { status: 400 });

  await ensureRuntimeSchema();
  const now = Date.now();
  const result = await getD1().prepare(`UPDATE ${table} SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL`).bind(now, now, id).run();
  return result.meta.changes ? Response.json({ id }) : Response.json({ error: "Not found" }, { status: 404 });
}

/** `isActive` z UI → `archived_at`. Když pole v payloadu není, zůstane dosavadní stav —
 *  částečný payload nesmí položku nechtěně oživit. */
function activeFlagToArchivedAt(isActive: boolean | undefined, now: number, current: number | null = null) {
  if (isActive === undefined) return current;
  return isActive ? null : now;
}

function normalizeInterval(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function normalizeWarnPercent(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 80;
  return Math.min(100, Math.max(1, Math.round(value)));
}

/** `options` dávají smysl jen u dropdownu; u ostatních typů se zahodí, ať v datech neleží. */
function normalizeOptions(options: string[] | undefined, attributeType: string) {
  if (attributeType !== "dropdown") return [];
  return Array.from(new Set((options ?? []).map((option) => clean(option, 120)).filter(Boolean))).slice(0, 200);
}

type MigrationEngineRow = { id: string; totalMinutes: number; pistonMinutes: number; rodMinutes: number };

/**
 * Přepne kategorii ze staré servisní karty na novou.
 *
 * Zaniká automatický reset `piston_minutes`/`rod_minutes` při zaškrtnutí dílu; nahrazuje ho
 * stav dlaždic počítaný z `interval_minutes`. Aby dlaždice nezačaly od nuly ani nehlásily
 * „bez měření", přenese se historie z `engine_service_entries` a navíc se u každého motoru
 * založí jeden výchozí záznam se stavem počítadla dopočítaným z dnešních hodnot
 * (`total_minutes − piston_minutes`, resp. `− rod_minutes`).
 *
 * Staré sloupce se nemažou, jen se přestanou aktualizovat.
 */
async function migrateCategory(d1: ReturnType<typeof getD1>, categoryId: string, actor: string, now: number) {
  if (!categoryId) return Response.json({ error: "Category is required" }, { status: 400 });

  const category = await d1.prepare("SELECT id, code, counter_unit AS counterUnit, service_card_migrated AS migrated FROM engine_categories WHERE id = ?")
    .bind(categoryId).first<{ id: string; code: string; counterUnit: string | null; migrated: number }>();
  if (!category) return Response.json({ error: "Category not found" }, { status: 404 });
  if (category.migrated) return Response.json({ error: "Category is already on the new service card" }, { status: 409 });

  const items = await d1.prepare(`
    SELECT id, name_cs AS nameCs, name_en AS nameEn, interval_minutes AS intervalMinutes, legacy_part_key AS legacyPartKey
    FROM service_card_items WHERE engine_category_id = ? AND archived_at IS NULL ORDER BY sort_order
  `).bind(categoryId).all<{ id: string; nameCs: string; nameEn: string; intervalMinutes: number | null; legacyPartKey: string | null }>();
  if (items.results.length === 0) return Response.json({ error: "missing_items" }, { status: 400 });

  // U kategorie s počítadlem musí mít píst i ojnice interval, jinak by dlaždice, které dnes
  // reset počítadel řídí, po přepnutí zůstaly bez významu.
  const counterItems = category.counterUnit
    ? (["piston", "connecting_rod"] as const).map((key) => ({ key, item: items.results.find((item) => item.legacyPartKey === key) }))
    : [];
  const missing = counterItems.filter((entry) => !entry.item || entry.item.intervalMinutes === null);
  if (missing.length > 0) return Response.json({ error: "missing_intervals", missing: missing.map((entry) => entry.key) }, { status: 400 });

  await d1.prepare("UPDATE engine_categories SET service_card_migrated = 1, updated_at = ? WHERE id = ?").bind(now, categoryId).run();
  await migrateLegacyServiceEntries(d1);

  let seeded = 0;
  if (category.counterUnit) {
    const engines = await d1.prepare(`
      SELECT id, total_minutes AS totalMinutes, piston_minutes AS pistonMinutes, rod_minutes AS rodMinutes
      FROM engines WHERE family = ? AND archived_at IS NULL
    `).bind(category.code).all<MigrationEngineRow>();

    const today = new Date(now).toISOString().slice(0, 10);
    const statements: ReturnType<typeof d1.prepare>[] = [];
    for (const engine of engines.results) {
      // Píst a ojnice se mohly měnit v různý okamžik — stejný stav počítadla znamená jednu
      // výměnu a tedy jeden záznam, jinak vzniknou dva.
      const groups = new Map<number, typeof counterItems>();
      for (const entry of counterItems) {
        const counterMinutes = Math.max(0, engine.totalMinutes - (entry.key === "piston" ? engine.pistonMinutes : engine.rodMinutes));
        groups.set(counterMinutes, [...(groups.get(counterMinutes) ?? []), entry]);
      }
      for (const [counterMinutes, entries] of groups) {
        const recordId = crypto.randomUUID();
        statements.push(d1.prepare(`
          INSERT INTO service_records (id, engine_id, service_type_id, service_type_snapshot, service_date, counter_minutes, mechanic_id, mechanic_name_snapshot, note, import_source, created_by, created_at, updated_at)
          VALUES (?, ?, NULL, ?, ?, ?, NULL, '', ?, ?, ?, ?, ?)
        `).bind(recordId, engine.id, "Převzato z motohodin / Carried over from running hours", today, counterMinutes,
          "Výchozí stav dopočítaný při přechodu na novou servisní kartu.", IMPORT_SOURCE_COUNTER_CARRYOVER, actor, now, now));
        entries.forEach((entry, index) => {
          statements.push(d1.prepare(`
            INSERT INTO service_record_items (id, service_record_id, service_card_item_id, item_name_cs_snapshot, item_name_en_snapshot, material_variant_id, material_snapshot, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
          `).bind(crypto.randomUUID(), recordId, entry.item!.id, entry.item!.nameCs, entry.item!.nameEn, (index + 1) * SORT_STEP, now));
        });
        seeded += 1;
      }
    }
    for (let offset = 0; offset < statements.length; offset += 50) {
      await d1.batch(statements.slice(offset, offset + 50));
    }
  }

  return Response.json({ ok: true, seededRecords: seeded });
}
