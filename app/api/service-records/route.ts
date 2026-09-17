import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";
import { EDIT_WINDOW_MS, SORT_STEP, type MaterialSnapshot } from "../../service-card-shared";
import { buildTechnicalChangeLog } from "../../engine-technical-log";

/**
 * Servisní záznamy na kartě motoru — čtení, zápis, oprava a storno.
 *
 * Na rozdíl od `/api/service-card-settings` (jen superadmin) sem smí i mechanik: definice
 * číselníků je administrace, zápis servisu je běžná práce.
 *
 * Dvě věci, na kterých celá routa stojí:
 *  - **Snapshoty pořizuje server**, ne klient. Název položky i materiálu se čte z aktuálních
 *    definic v okamžiku zápisu a uloží se do záznamu. Pozdější přejmenování nebo archivace
 *    historii nepřepíše ani nerozbije.
 *  - **Stav počítadla je read-only** a bere se ze serverového `engines.total_minutes`. Klient
 *    ho neposílá. U kategorie bez počítadla zůstává NULL — takové záznamy se ve výpočtu
 *    „najeto od výměny" přeskakují, neberou se jako nula.
 */

type Payload = {
  recordId?: string;
  engineId?: string;
  serviceTypeId?: string;
  serviceDate?: string;
  /** Volitelný čas HH:MM; prázdný znamená neznámý čas. */
  serviceTime?: string;
  mechanicId?: string;
  note?: string;
  /** `itemId` + seznam variant s počtem kusů (prázdné pole, když položka materiál nemá,
   *  nebo je zaškrtnutá bez výběru). U položky bez `allowMultipleVariants` smí mít nejvýš 1 prvek. */
  items?: Array<{ itemId?: string; variants?: Array<{ variantId?: string; quantity?: number }> }>;
  cancelledReason?: string;
  /** Varianta C: srovnat technické údaje podle vybraného materiálu (výchozí ano). */
  syncTechnicalValues?: boolean;
  /** Trvalé smazání už stornovaného záznamu — jen superadmin, viz DELETE. */
  permanent?: boolean;
};

type EngineRow = { id: string; code: string; family: string; totalMinutes: number };
type CategoryRow = { id: string; code: string; counterUnit: string | null; serviceCardMigrated: number };
type CardItemRow = { id: string; nameCs: string; nameEn: string; materialCategoryId: string | null; allowMultipleVariants: number };
type RecordRow = {
  id: string;
  engineId: string;
  serviceTypeId: string | null;
  serviceTypeSnapshot: string;
  serviceTypeSnapshotCs: string;
  serviceTypeSnapshotEn: string;
  serviceDate: string;
  serviceTime: string;
  counterMinutes: number | null;
  mechanicId: string | null;
  mechanicNameSnapshot: string;
  note: string;
  cancelledReason: string;
  cancelledAt: number | null;
  cancelledBy: string;
  divergenceNote: string;
  createdBy: string;
  createdAt: number;
};
type RecordItemRow = {
  id: string;
  serviceRecordId: string;
  serviceCardItemId: string | null;
  itemNameCsSnapshot: string;
  itemNameEnSnapshot: string;
  materialVariantId: string | null;
  materialSnapshot: string | null;
  quantity: number;
  sortOrder: number;
};

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * „1.A" když se kód a název shodují, jinak „PRE · Přestavba" — zvlášť pro každý jazyk, ne
 * jeden text se slepenými oběma najednou (to se dřív ukládalo do `service_type_snapshot`
 * a nedalo se to podle přepínače jazyka rozlišit). `cs` se navíc uloží i do starého sloupce,
 * pro cokoliv, co by ho ještě čekalo jako jediný zdroj.
 */
function serviceTypeSnapshots(type: { code: string; nameCs: string; nameEn: string } | null) {
  if (!type) return { cs: "", en: "" };
  const cs = type.nameCs === type.code ? type.code : `${type.code} · ${type.nameCs}`;
  const en = type.nameEn === type.code ? type.code : `${type.code} · ${type.nameEn}`;
  return { cs, en };
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** Čas je nepovinný — prázdný projde, cokoli jiného musí být HH:MM. */
function normalizeServiceTime(value: unknown) {
  const time = clean(value, 5);
  if (!time) return { time: "" } as const;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? { time } as const : { error: true } as const;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function readPayload(request: Request) {
  try {
    return { payload: (await request.json()) as Payload } as const;
  } catch {
    return { error: Response.json({ error: "Invalid JSON" }, { status: 400 }) } as const;
  }
}

async function loadEngineContext(d1: ReturnType<typeof getD1>, engineId: string) {
  const engine = await d1.prepare("SELECT id, code, family, total_minutes AS totalMinutes FROM engines WHERE id = ? AND archived_at IS NULL")
    .bind(engineId).first<EngineRow>();
  if (!engine) return { error: Response.json({ error: "Engine not found" }, { status: 404 }) } as const;

  const category = await d1.prepare(`
    SELECT id, code, counter_unit AS counterUnit, service_card_migrated AS serviceCardMigrated
    FROM engine_categories WHERE code = ?
  `).bind(engine.family).first<CategoryRow>();
  if (!category) return { error: Response.json({ error: "Engine category not found" }, { status: 404 }) } as const;

  return { engine, category } as const;
}

/** Záznamy i s položkami, řazené podle data servisu (ne podle id — servis jde zapsat zpětně). */
async function loadRecords(d1: ReturnType<typeof getD1>, engineId: string) {
  const records = await d1.prepare(`
    SELECT id, engine_id AS engineId, service_type_id AS serviceTypeId, service_type_snapshot AS serviceTypeSnapshot,
           service_type_snapshot_cs AS serviceTypeSnapshotCs, service_type_snapshot_en AS serviceTypeSnapshotEn,
           service_date AS serviceDate, service_time AS serviceTime, counter_minutes AS counterMinutes, mechanic_id AS mechanicId,
           mechanic_name_snapshot AS mechanicNameSnapshot, note, cancelled_reason AS cancelledReason,
           cancelled_at AS cancelledAt, cancelled_by AS cancelledBy, divergence_note AS divergenceNote,
           created_by AS createdBy, created_at AS createdAt
    FROM service_records WHERE engine_id = ? ORDER BY service_date DESC, service_time DESC, created_at DESC
  `).bind(engineId).all<RecordRow>();
  if (records.results.length === 0) return [];

  const items = await d1.prepare(`
    SELECT i.id, i.service_record_id AS serviceRecordId, i.service_card_item_id AS serviceCardItemId,
           i.item_name_cs_snapshot AS itemNameCsSnapshot, i.item_name_en_snapshot AS itemNameEnSnapshot,
           i.material_variant_id AS materialVariantId, i.material_snapshot AS materialSnapshot,
           i.quantity AS quantity, i.sort_order AS sortOrder
    FROM service_record_items i
    JOIN service_records r ON r.id = i.service_record_id
    WHERE r.engine_id = ? ORDER BY i.sort_order
  `).bind(engineId).all<RecordItemRow>();

  return records.results.map((record) => ({
    ...record,
    items: items.results
      .filter((item) => item.serviceRecordId === record.id)
      .map((item) => ({ ...item, materialSnapshot: parseJson<MaterialSnapshot | null>(item.materialSnapshot, null) })),
  }));
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const engineId = clean(new URL(request.url).searchParams.get("engineId"), 80);
  if (!engineId) return Response.json({ error: "Engine id is required" }, { status: 400 });

  const context = await loadEngineContext(d1, engineId);
  if (context.error) return context.error;
  const { engine, category } = context;

  const [serviceTypes, cardItems, materialCategories, defaults, mechanics] = await Promise.all([
    d1.prepare(`
      SELECT id, code, name_cs AS nameCs, name_en AS nameEn, description_cs AS descriptionCs,
             description_en AS descriptionEn, sort_order AS sortOrder
      FROM service_types WHERE engine_category_id = ? AND archived_at IS NULL ORDER BY sort_order
    `).bind(category.id).all(),
    d1.prepare(`
      SELECT id, name_cs AS nameCs, name_en AS nameEn, material_category_id AS materialCategoryId,
             interval_minutes AS intervalMinutes, warn_percent AS warnPercent,
             allow_multiple_variants AS allowMultipleVariants, sort_order AS sortOrder
      FROM service_card_items WHERE engine_category_id = ? AND archived_at IS NULL ORDER BY sort_order
    `).bind(category.id).all(),
    d1.prepare("SELECT id, name_cs AS nameCs, name_en AS nameEn FROM material_categories WHERE engine_category_id = ? AND archived_at IS NULL ORDER BY sort_order")
      .bind(category.id).all<{ id: string }>(),
    d1.prepare(`
      SELECT d.service_type_id AS serviceTypeId, d.service_card_item_id AS serviceCardItemId
      FROM service_type_default_items d JOIN service_types t ON t.id = d.service_type_id
      WHERE t.engine_category_id = ?
    `).bind(category.id).all(),
    d1.prepare("SELECT id, name FROM mechanics WHERE archived_at IS NULL ORDER BY name").all(),
  ]);

  // Neaktivní varianty se při novém zápisu nenabízejí; v historii zůstávají čitelné ze snapshotu.
  const materialIds = materialCategories.results.map((item) => item.id);
  const variants = materialIds.length === 0 ? { results: [] } : await d1.prepare(`
    SELECT id, material_category_id AS materialCategoryId, name, attribute_values AS attributeValues
    FROM material_variants WHERE material_category_id IN (${materialIds.map(() => "?").join(", ")}) AND archived_at IS NULL ORDER BY name
  `).bind(...materialIds).all<{ attributeValues: string }>();

  // Varianta C: dvě místa (technické údaje a katalog materiálu) zůstávají oddělená, ale klient
  // potřebuje obojí, aby poznal, že se rozcházejí, a nabídl srovnání.
  const technicalLinks = await d1.prepare(`
    SELECT a.id AS attributeId, a.technical_field_id AS technicalFieldId, a.material_category_id AS materialCategoryId,
           f.label_cs AS fieldLabelCs, f.label_en AS fieldLabelEn
    FROM material_attributes a
    JOIN engine_technical_fields f ON f.id = a.technical_field_id
    JOIN material_categories m ON m.id = a.material_category_id
    WHERE m.engine_category_id = ? AND a.archived_at IS NULL AND f.archived_at IS NULL
  `).bind(category.id).all<{ technicalFieldId: string }>();

  const linkedFieldIds = technicalLinks.results.map((link) => link.technicalFieldId);
  const technicalValues = linkedFieldIds.length === 0 ? { results: [] } : await d1.prepare(`
    SELECT v.field_id AS fieldId, COALESCE(o.value_cs, v.value) AS value
    FROM engine_technical_values v
    LEFT JOIN engine_technical_field_options o ON o.id = v.value
    WHERE v.engine_id = ? AND v.field_id IN (${linkedFieldIds.map(() => "?").join(", ")})
  `).bind(engineId, ...linkedFieldIds).all();

  // Kdo si motor zabral ve frontě — formulář z toho předvyplní mechanika. U zabrání ze
  // sdíleného panelu je mechanik uložený přímo, u mechanikova účtu se dohledá podle jména.
  const claim = await d1.prepare(`
    SELECT COALESCE(c.claimed_mechanic_id, m.id) AS mechanicId, c.claimed_by_name AS name
    FROM engine_service_claims c
    LEFT JOIN mechanics m ON m.archived_at IS NULL AND lower(m.name) = lower(c.claimed_by_name)
    WHERE c.engine_id = ? AND c.released_at IS NULL
  `).bind(engineId).first<{ mechanicId: string | null; name: string }>();

  return auth.json({
    claim: claim ? { mechanicId: claim.mechanicId, name: claim.name } : null,
    technicalLinks: technicalLinks.results,
    technicalValues: technicalValues.results,
    engine: { id: engine.id, code: engine.code, family: engine.family, totalMinutes: engine.totalMinutes },
    category: { ...category, serviceCardMigrated: Boolean(category.serviceCardMigrated) },
    serviceTypes: serviceTypes.results,
    cardItems: (cardItems.results as Array<{ allowMultipleVariants: number }>).map((item) => ({ ...item, allowMultipleVariants: Boolean(item.allowMultipleVariants) })),
    materialCategories: materialCategories.results,
    materialVariants: (variants.results as Array<{ attributeValues: string }>).map((variant) => ({ ...variant, attributeValues: parseJson<Record<string, string>>(variant.attributeValues, {}) })),
    defaultItems: defaults.results,
    mechanics: mechanics.results,
    records: await loadRecords(d1, engineId),
  });
}

/**
 * Sestaví položky záznamu i se snapshoty. Zaškrtnutí od klienta se ověří proti aktivním
 * definicím — neaktivní položka ani varianta se do nového zápisu nedostane.
 */
type PreparedItem = { itemId: string; nameCs: string; nameEn: string; materialCategoryId: string | null; variantId: string | null; snapshot: MaterialSnapshot | null; quantity: number };

/**
 * Sestaví řádky `service_record_items` k zápisu. Jedna položka karty (`itemId`) může nést víc
 * variant zároveň (`variants`) — každá dostane vlastní řádek se svým počtem kusů, všechny
 * se stejným `service_card_item_id`. Duplicitní `variantId` u jedné položky se sloučí do
 * jednoho řádku (počty se sečtou) — server to hlídá i pro případ, že by klient poslal dvě
 * varianty se stejným id, ne jen kvůli UI.
 */
async function buildRecordItems(d1: ReturnType<typeof getD1>, categoryId: string, requested: Payload["items"]) {
  const selected = (requested ?? [])
    .map((item) => ({ itemId: clean(item.itemId, 80), variants: Array.isArray(item.variants) ? item.variants : [] }))
    .filter((item) => item.itemId);
  if (selected.length === 0) return { error: Response.json({ error: "At least one card item must be selected" }, { status: 400 }) } as const;

  const cardItems = await d1.prepare(`
    SELECT id, name_cs AS nameCs, name_en AS nameEn, material_category_id AS materialCategoryId, allow_multiple_variants AS allowMultipleVariants
    FROM service_card_items WHERE engine_category_id = ? AND archived_at IS NULL ORDER BY sort_order
  `).bind(categoryId).all<CardItemRow>();
  const cardItemById = new Map(cardItems.results.map((item) => [item.id, item]));

  // Vyčistí, ověří celá čísla ≥ 1 a sloučí duplicitní variantId v rámci jedné položky —
  // dřív, než se cokoli dotáže do katalogu materiálu.
  type CleanedEntry = { cardItem: CardItemRow; variants: Array<{ variantId: string; quantity: number }> };
  const cleanedEntries: CleanedEntry[] = [];
  for (const entry of selected) {
    const cardItem = cardItemById.get(entry.itemId);
    if (!cardItem) return { error: Response.json({ error: "Unknown or inactive card item" }, { status: 400 }) } as const;

    const variants: Array<{ variantId: string; quantity: number }> = [];
    for (const raw of entry.variants) {
      const variantId = clean(raw?.variantId, 80);
      if (!variantId) continue;
      // Číslo, ne zaokrouhlené na číslo — 1.5 musí spadnout na chybu, ne se ztichlo zaokrouhlit na 2.
      const quantity = Number(raw?.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return { error: Response.json({ error: "Quantity must be a whole number of at least 1" }, { status: 400 }) } as const;
      }
      const existing = variants.find((item) => item.variantId === variantId);
      if (existing) existing.quantity += quantity;
      else variants.push({ variantId, quantity });
    }
    // `allowMultipleVariants` se nevynucuje tady — jen řídí, co formulář nabídne k NOVÉMU
    // výběru (jeden select vs. opakovatelný seznam). Vynucovat to i tady by po vypnutí
    // přepínače zablokovalo i pouhé znovu-uložení staršího záznamu, který má víc variant.
    cleanedEntries.push({ cardItem, variants });
  }

  const variantIds = Array.from(new Set(cleanedEntries.flatMap((entry) => entry.variants.map((item) => item.variantId))));
  const variants = variantIds.length === 0 ? { results: [] } : await d1.prepare(`
    SELECT id, material_category_id AS materialCategoryId, name, attribute_values AS attributeValues
    FROM material_variants WHERE id IN (${variantIds.map(() => "?").join(", ")}) AND archived_at IS NULL
  `).bind(...variantIds).all<{ id: string; materialCategoryId: string; name: string; attributeValues: string }>();
  const variantById = new Map(variants.results.map((variant) => [variant.id, variant]));

  const attributes = await d1.prepare(`
    SELECT a.id, a.material_category_id AS materialCategoryId, a.name_cs AS nameCs, a.name_en AS nameEn, a.unit, a.sort_order AS sortOrder
    FROM material_attributes a
    JOIN material_categories c ON c.id = a.material_category_id
    WHERE c.engine_category_id = ? AND a.archived_at IS NULL ORDER BY a.sort_order
  `).bind(categoryId).all<{ id: string; materialCategoryId: string; nameCs: string; nameEn: string; unit: string }>();

  const prepared: PreparedItem[] = [];
  for (const entry of cleanedEntries) {
    const { cardItem } = entry;
    if (entry.variants.length === 0) {
      prepared.push({ itemId: cardItem.id, nameCs: cardItem.nameCs, nameEn: cardItem.nameEn, materialCategoryId: cardItem.materialCategoryId, variantId: null, snapshot: null, quantity: 1 });
      continue;
    }
    for (const picked of entry.variants) {
      const variant = variantById.get(picked.variantId);
      if (!variant) return { error: Response.json({ error: "Unknown or inactive material variant" }, { status: 400 }) } as const;
      if (variant.materialCategoryId !== cardItem.materialCategoryId) {
        return { error: Response.json({ error: "Material variant does not belong to this item's category" }, { status: 400 }) } as const;
      }
      const values = parseJson<Record<string, string>>(variant.attributeValues, {});
      const snapshot: MaterialSnapshot = {
        name: variant.name,
        values: attributes.results
          .filter((attribute) => attribute.materialCategoryId === variant.materialCategoryId && values[attribute.id])
          .map((attribute) => ({ nameCs: attribute.nameCs, nameEn: attribute.nameEn, value: values[attribute.id], unit: attribute.unit })),
      };
      prepared.push({ itemId: cardItem.id, nameCs: cardItem.nameCs, nameEn: cardItem.nameEn, materialCategoryId: cardItem.materialCategoryId, variantId: variant.id, snapshot, quantity: picked.quantity });
    }
  }
  return { items: prepared } as const;
}

/**
 * Které varianty jít srovnat s technickými údaji (varianta C) — jen tam, kde je v zápisu na
 * danou kategorii materiálu jasno, tedy přesně jedna odlišná vybraná varianta. Když je jich
 * u jedné kategorie víc (víc kusů různých rozměrů u položky s povolenými víc variantami),
 * nedá se hádat, která je „ta" pro technický údaj — kategorie se pak beze slova přeskočí.
 */
function reconcilableVariantIds(items: PreparedItem[]) {
  const byCategory = new Map<string, Set<string>>();
  for (const item of items) {
    if (!item.variantId || !item.materialCategoryId) continue;
    const set = byCategory.get(item.materialCategoryId) ?? new Set<string>();
    set.add(item.variantId);
    byCategory.set(item.materialCategoryId, set);
  }
  return Array.from(byCategory.values()).filter((set) => set.size === 1).map((set) => Array.from(set)[0]);
}

/**
 * Srovná technické údaje motoru podle materiálu vybraného v servisu (varianta C).
 *
 * Servis je jediné místo, kde se rozměr mění — technické údaje se z něj aktualizují, ne naopak.
 * Když `sync` není zapnutý, hodnoty se nechají být a vrátí se popis rozchodu, který se uloží
 * k záznamu, aby bylo zpětně dohledatelné, že k němu došlo vědomě.
 */
async function reconcileTechnicalValues(
  d1: ReturnType<typeof getD1>,
  engineId: string,
  categoryId: string,
  variantIds: string[],
  sync: boolean,
  actor: string,
  now: number,
  /** Id vznikajícího záznamu — osa z něj udělá proklik na servis, který změnu způsobil. */
  serviceRecordId: string,
): Promise<string> {
  if (variantIds.length === 0) return "";

  const links = await d1.prepare(`
    SELECT a.id AS attributeId, a.technical_field_id AS technicalFieldId, a.material_category_id AS materialCategoryId,
           a.name_cs AS attributeCs, f.label_cs AS fieldCs
    FROM material_attributes a
    JOIN engine_technical_fields f ON f.id = a.technical_field_id
    JOIN material_categories m ON m.id = a.material_category_id
    WHERE m.engine_category_id = ? AND a.archived_at IS NULL AND f.archived_at IS NULL
  `).bind(categoryId).all<{ attributeId: string; technicalFieldId: string; materialCategoryId: string; attributeCs: string; fieldCs: string }>();
  if (links.results.length === 0) return "";

  const variants = await d1.prepare(`
    SELECT id, material_category_id AS materialCategoryId, attribute_values AS attributeValues
    FROM material_variants WHERE id IN (${variantIds.map(() => "?").join(", ")})
  `).bind(...variantIds).all<{ id: string; materialCategoryId: string; attributeValues: string }>();

  const divergences: string[] = [];
  const statements: ReturnType<typeof d1.prepare>[] = [];

  for (const link of links.results) {
    const variant = variants.results.find((item) => item.materialCategoryId === link.materialCategoryId);
    if (!variant) continue;
    const wanted = parseJson<Record<string, string>>(variant.attributeValues, {})[link.attributeId];
    if (!wanted) continue;

    // Hodnota pole typu „výběr" se ukládá jako id možnosti, ne jako text — porovnáváme text.
    const current = await d1.prepare(`
      SELECT v.id, COALESCE(o.value_cs, v.value) AS value
      FROM engine_technical_values v
      LEFT JOIN engine_technical_field_options o ON o.id = v.value
      WHERE v.engine_id = ? AND v.field_id = ?
    `).bind(engineId, link.technicalFieldId).first<{ id: string; value: string }>();
    if (current?.value === wanted) continue;

    divergences.push(`${link.fieldCs}: ${current?.value || "—"} → ${wanted}`);
    if (!sync) continue;

    // Srovnání míří na možnost se stejným textem; když taková není, uloží se holá hodnota.
    const option = await d1.prepare(`
      SELECT id FROM engine_technical_field_options WHERE field_id = ? AND value_cs = ? AND archived_at IS NULL
    `).bind(link.technicalFieldId, wanted).first<{ id: string }>();
    const stored = option?.id ?? wanted;

    // Historie změny se zapisuje ve stejném batchi jako hodnota sama — `source: "service"`
    // odliší propsání ze servisu od ruční editace karty motoru.
    statements.push(...await buildTechnicalChangeLog(
      d1, engineId, [{ fieldId: link.technicalFieldId, value: stored }], actor, "service", now, serviceRecordId,
    ));

    statements.push(current
      ? d1.prepare("UPDATE engine_technical_values SET value = ?, updated_by = ?, updated_at = ? WHERE id = ?")
        .bind(stored, actor, now, current.id)
      : d1.prepare(`
          INSERT INTO engine_technical_values (id, engine_id, field_id, value, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(crypto.randomUUID(), engineId, link.technicalFieldId, stored, actor, now));
  }

  if (statements.length > 0) await d1.batch(statements);
  if (divergences.length === 0 || sync) return "";
  return `Rozměry ponechány rozdílné (vědomě): ${divergences.join("; ")}`;
}

/**
 * Uložený servis odbaví všechny otevřené položky fronty daného motoru.
 *
 * Nerozlišuje se, kterou položku mechanik „myslel" — když motor přijel ze dvou závodů po sobě
 * a dostal jeden servis, je odservisovaný z obou. Zápis do fronty patří sem, a ne do
 * `/api/service-queue`, aby se historie a fronta nemohly rozejít.
 */
async function resolveQueueForEngine(d1: ReturnType<typeof getD1>, engineId: string, serviceRecordId: string, actor: string, now: number) {
  const open = await d1.prepare(`
    SELECT 'race' AS sourceType, r.id AS sourceId
    FROM race_entries re
    JOIN races r ON r.id = re.race_id
    WHERE r.status != 'archived' AND r.end_date < date('now')
      AND ? IN (re.engine_1_id, re.engine_2_id, re.engine_3_id)
      -- Závod, na kterém motor „nejel", ve frontě nikdy nebyl, takže se ani neodbavuje.
      AND NOT EXISTS (SELECT 1 FROM race_engine_runs rr
                      WHERE rr.race_id = r.id AND rr.engine_id = ? AND rr.raced = 0)
      AND NOT EXISTS (SELECT 1 FROM engine_service_queue_resolutions q
                      WHERE q.engine_id = ? AND q.source_type = 'race' AND q.source_id = r.id)
    UNION
    SELECT 'loan', l.id
    FROM engine_loans l
    WHERE l.engine_id = ? AND l.actual_return_date IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM engine_service_queue_resolutions q
                      WHERE q.engine_id = ? AND q.source_type = 'loan' AND q.source_id = l.id)
    UNION
    SELECT 'manual', m.id
    FROM engine_service_queue_manual m
    WHERE m.engine_id = ?
      AND NOT EXISTS (SELECT 1 FROM engine_service_queue_resolutions q
                      WHERE q.engine_id = ? AND q.source_type = 'manual' AND q.source_id = m.id)
  `).bind(engineId, engineId, engineId, engineId, engineId, engineId, engineId).all<{ sourceType: string; sourceId: string }>();
  if (open.results.length === 0) return;

  const statements = open.results.map((row) => d1.prepare(`
    INSERT INTO engine_service_queue_resolutions (id, engine_id, source_type, source_id, resolution, service_record_id, resolved_by, resolved_at)
    VALUES (?, ?, ?, ?, 'serviced', ?, ?, ?)
    ON CONFLICT (engine_id, source_type, source_id) DO NOTHING
  `).bind(crypto.randomUUID(), engineId, row.sourceType, row.sourceId, serviceRecordId, actor, now));

  for (let offset = 0; offset < statements.length; offset += 50) {
    await d1.batch(statements.slice(offset, offset + 50));
  }
}

async function resolveMechanic(d1: ReturnType<typeof getD1>, mechanicId: string) {
  return d1.prepare("SELECT id, name FROM mechanics WHERE id = ? AND archived_at IS NULL").bind(mechanicId).first<{ id: string; name: string }>();
}

export async function POST(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  const body = await readPayload(request);
  if (body.error) return body.error;
  const { payload } = body;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const context = await loadEngineContext(d1, clean(payload.engineId, 80));
  if (context.error) return context.error;
  const { engine, category } = context;
  if (!category.serviceCardMigrated) return Response.json({ error: "This category still uses the legacy service card" }, { status: 400 });

  const serviceDate = clean(payload.serviceDate, 10);
  if (!isDate(serviceDate)) return Response.json({ error: "A valid service date is required" }, { status: 400 });
  const serviceTime = normalizeServiceTime(payload.serviceTime);
  if ("error" in serviceTime) return Response.json({ error: "Service time must be HH:MM" }, { status: 400 });

  const mechanic = await resolveMechanic(d1, clean(payload.mechanicId, 80));
  if (!mechanic) return Response.json({ error: "Mechanic is required" }, { status: 400 });

  const serviceTypeId = clean(payload.serviceTypeId, 80);
  const serviceType = serviceTypeId
    ? await d1.prepare("SELECT id, code, name_cs AS nameCs, name_en AS nameEn FROM service_types WHERE id = ? AND engine_category_id = ? AND archived_at IS NULL")
      .bind(serviceTypeId, category.id).first<{ id: string; code: string; nameCs: string; nameEn: string }>()
    : null;
  if (serviceTypeId && !serviceType) return Response.json({ error: "Unknown or inactive service type" }, { status: 400 });

  const built = await buildRecordItems(d1, category.id, payload.items);
  if (built.error) return built.error;

  const id = crypto.randomUUID();
  const now = Date.now();
  // Stav počítadla se bere ze serveru, ne z klienta; bez counter_unit zůstává NULL.
  const counterMinutes = category.counterUnit ? engine.totalMinutes : null;
  const typeSnapshots = serviceTypeSnapshots(serviceType);

  // Technické údaje se srovnají podle vybraného materiálu, ledaže to mechanik odškrtl —
  // pak se k záznamu uloží, že rozchod je vědomý.
  const divergenceNote = await reconcileTechnicalValues(
    d1, engine.id, category.id, reconcilableVariantIds(built.items),
    payload.syncTechnicalValues !== false, user.email, now, id,
  );

  await d1.batch([
    d1.prepare(`
      INSERT INTO service_records (id, engine_id, service_type_id, service_type_snapshot, service_type_snapshot_cs, service_type_snapshot_en, service_date, service_time, counter_minutes, mechanic_id, mechanic_name_snapshot, note, divergence_note, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, engine.id, serviceType?.id ?? null, typeSnapshots.cs, typeSnapshots.cs, typeSnapshots.en,
      serviceDate, serviceTime.time, counterMinutes, mechanic.id, mechanic.name, clean(payload.note, 2000), divergenceNote, user.email, now, now),
    ...built.items.map((item, index) => d1.prepare(`
      INSERT INTO service_record_items (id, service_record_id, service_card_item_id, item_name_cs_snapshot, item_name_en_snapshot, material_variant_id, material_snapshot, quantity, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), id, item.itemId, item.nameCs, item.nameEn, item.variantId, item.snapshot ? JSON.stringify(item.snapshot) : null, item.quantity, (index + 1) * SORT_STEP, now)),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'log_service_record', 'engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), user.email, engine.id, JSON.stringify({ recordId: id, serviceDate, items: built.items.length }), now),
  ]);

  await resolveQueueForEngine(d1, engine.id, id, user.email, now);

  // Servis je zapsaný, takže motor už nikdo „nedrží" — označení rozpracovaného padá samo.
  // Kdyby zůstalo, viselo by na dlaždici do druhého dne a hlásilo práci, která je hotová.
  await d1.prepare("UPDATE engine_service_claims SET released_at = ?, released_by = ?, release_reason = 'service' WHERE engine_id = ? AND released_at IS NULL")
    .bind(now, user.email, engine.id).run();

  return Response.json({ records: await loadRecords(d1, engine.id) }, { status: 201 });
}

/** Oprava záznamu — jen do 24 hodin od zápisu a jen pro autora nebo superadmina. */
export async function PATCH(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  const body = await readPayload(request);
  if (body.error) return body.error;
  const { payload } = body;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const recordId = clean(payload.recordId, 80);
  const existing = await d1.prepare("SELECT id, engine_id AS engineId, counter_minutes AS counterMinutes, created_by AS createdBy, created_at AS createdAt, cancelled_at AS cancelledAt FROM service_records WHERE id = ?")
    .bind(recordId).first<{ id: string; engineId: string; counterMinutes: number | null; createdBy: string; createdAt: number; cancelledAt: number | null }>();
  if (!existing) return Response.json({ error: "Record not found" }, { status: 404 });
  if (existing.cancelledAt) return Response.json({ error: "cancelled" }, { status: 409 });
  if (user.role !== "superadmin" && existing.createdBy !== user.email) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (Date.now() - existing.createdAt > EDIT_WINDOW_MS) return Response.json({ error: "edit_window_closed" }, { status: 409 });

  const context = await loadEngineContext(d1, existing.engineId);
  if (context.error) return context.error;
  const { category } = context;

  const serviceDate = clean(payload.serviceDate, 10);
  if (!isDate(serviceDate)) return Response.json({ error: "A valid service date is required" }, { status: 400 });
  const serviceTime = normalizeServiceTime(payload.serviceTime);
  if ("error" in serviceTime) return Response.json({ error: "Service time must be HH:MM" }, { status: 400 });

  const mechanic = await resolveMechanic(d1, clean(payload.mechanicId, 80));
  if (!mechanic) return Response.json({ error: "Mechanic is required" }, { status: 400 });

  const serviceTypeId = clean(payload.serviceTypeId, 80);
  const serviceType = serviceTypeId
    ? await d1.prepare("SELECT id, code, name_cs AS nameCs, name_en AS nameEn FROM service_types WHERE id = ? AND engine_category_id = ? AND archived_at IS NULL")
      .bind(serviceTypeId, category.id).first<{ id: string; code: string; nameCs: string; nameEn: string }>()
    : null;
  if (serviceTypeId && !serviceType) return Response.json({ error: "Unknown or inactive service type" }, { status: 400 });

  const built = await buildRecordItems(d1, category.id, payload.items);
  if (built.error) return built.error;

  const now = Date.now();
  const typeSnapshots = serviceTypeSnapshots(serviceType);
  await d1.batch([
    d1.prepare(`
      UPDATE service_records SET service_type_id = ?, service_type_snapshot = ?, service_type_snapshot_cs = ?, service_type_snapshot_en = ?, service_date = ?, service_time = ?, mechanic_id = ?, mechanic_name_snapshot = ?, note = ?, updated_at = ? WHERE id = ?
    `).bind(serviceType?.id ?? null, typeSnapshots.cs, typeSnapshots.cs, typeSnapshots.en,
      serviceDate, serviceTime.time, mechanic.id, mechanic.name, clean(payload.note, 2000), now, recordId),
    d1.prepare("DELETE FROM service_record_items WHERE service_record_id = ?").bind(recordId),
    ...built.items.map((item, index) => d1.prepare(`
      INSERT INTO service_record_items (id, service_record_id, service_card_item_id, item_name_cs_snapshot, item_name_en_snapshot, material_variant_id, material_snapshot, quantity, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), recordId, item.itemId, item.nameCs, item.nameEn, item.variantId, item.snapshot ? JSON.stringify(item.snapshot) : null, item.quantity, (index + 1) * SORT_STEP, now)),
  ]);

  return Response.json({ records: await loadRecords(d1, existing.engineId) });
}

/** Storno s povinným důvodem. Záznam se nikdy nemaže — v historii zůstává přeškrtnutý. */
/**
 * Trvalé smazání stornovaného záznamu. Jen superadmin, jen záznam, který je už stornovaný
 * (`cancelled_at IS NOT NULL` přímo v DELETE, ne jen v aplikační kontrole) — storno samo
 * zůstává jediná cesta pro živý záznam. Než položky i záznam zmizí, uloží se jejich snapshot
 * do audit_logs, protože jinak by po smazání nezůstala žádná stopa, co přesně to bylo.
 */
async function purgeCancelledRecord(d1: ReturnType<typeof getD1>, recordId: string, actorEmail: string) {
  const existing = await d1.prepare(`
    SELECT id, engine_id AS engineId, service_type_id AS serviceTypeId, service_type_snapshot_cs AS serviceTypeSnapshotCs,
           service_type_snapshot_en AS serviceTypeSnapshotEn, service_date AS serviceDate, service_time AS serviceTime,
           counter_minutes AS counterMinutes, mechanic_id AS mechanicId, mechanic_name_snapshot AS mechanicNameSnapshot,
           note, cancelled_reason AS cancelledReason, cancelled_at AS cancelledAt, cancelled_by AS cancelledBy,
           created_by AS createdBy, created_at AS createdAt
    FROM service_records WHERE id = ?
  `).bind(recordId).first<Record<string, unknown> & { engineId: string; cancelledAt: number | null }>();
  if (!existing) return { error: Response.json({ error: "Record not found" }, { status: 404 }) } as const;
  if (!existing.cancelledAt) return { error: Response.json({ error: "not_cancelled" }, { status: 409 }) } as const;

  const items = await d1.prepare(`
    SELECT item_name_cs_snapshot AS itemNameCsSnapshot, item_name_en_snapshot AS itemNameEnSnapshot,
           material_variant_id AS materialVariantId, material_snapshot AS materialSnapshot, quantity
    FROM service_record_items WHERE service_record_id = ?
  `).bind(recordId).all<Record<string, unknown>>();

  const now = Date.now();
  await d1.batch([
    d1.prepare("DELETE FROM service_record_items WHERE service_record_id = ?").bind(recordId),
    d1.prepare("DELETE FROM service_records WHERE id = ? AND cancelled_at IS NOT NULL").bind(recordId),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'purge_service_record', 'engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), actorEmail, existing.engineId, JSON.stringify({ recordId, record: existing, items: items.results }), now),
  ]);

  return { engineId: existing.engineId } as const;
}

export async function DELETE(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  const body = await readPayload(request);
  if (body.error) return body.error;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const recordId = clean(body.payload.recordId, 80);

  if (body.payload.permanent) {
    if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const purged = await purgeCancelledRecord(d1, recordId, user.email);
    if (purged.error) return purged.error;
    return Response.json({ records: await loadRecords(d1, purged.engineId) });
  }

  const reason = clean(body.payload.cancelledReason, 500);
  if (!reason) return Response.json({ error: "reason_required" }, { status: 400 });

  const existing = await d1.prepare("SELECT id, engine_id AS engineId, created_by AS createdBy, cancelled_at AS cancelledAt FROM service_records WHERE id = ?")
    .bind(recordId).first<{ id: string; engineId: string; createdBy: string; cancelledAt: number | null }>();
  if (!existing) return Response.json({ error: "Record not found" }, { status: 404 });
  if (existing.cancelledAt) return Response.json({ error: "cancelled" }, { status: 409 });
  if (user.role !== "superadmin" && existing.createdBy !== user.email) return Response.json({ error: "Forbidden" }, { status: 403 });

  const now = Date.now();
  await d1.batch([
    d1.prepare("UPDATE service_records SET cancelled_reason = ?, cancelled_at = ?, cancelled_by = ?, updated_at = ? WHERE id = ?")
      .bind(reason, now, user.email, now, recordId),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'cancel_service_record', 'engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), user.email, existing.engineId, JSON.stringify({ recordId, reason }), now),
  ]);

  return Response.json({ records: await loadRecords(d1, existing.engineId) });
}
