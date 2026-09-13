import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

/**
 * Servisní historie napříč všemi motory + denní report.
 *
 * Časová osa na kartě motoru odpovídá na „co se dělo s tímhle motorem"; tahle sekce na
 * „co se za období udělalo v dílně". Proto je to samostatná routa, ne filtr nad osou.
 *
 * Čte ze **dvou** zdrojů: `service_records` (nová servisní karta) a `engine_service_entries`
 * (kategorie, které na ni ještě nepřešly — ty do staré tabulky zapisují i dnes). Bez druhého
 * zdroje by přehled ukazoval jen MINI.
 *
 * Report počítá podle `resolved_at` v `engine_service_queue_resolutions`, tedy podle data,
 * kdy motor z fronty skutečně odešel — ne podle data servisu, které mechanik může zapsat
 * zpětně. Hranice období posílá klient v epoch ms, protože zná časové pásmo dílny; server
 * by musel hádat.
 *
 * Mechanik sem nesmí (default-deny v `app/api-access.ts` ho nepustí, kontrola níž je pojistka).
 */

type Params = {
  from: string;
  to: string;
  fromMs: number;
  toMs: number;
  family: string;
  engineId: string;
  mechanicId: string;
};

type RecordRow = {
  source: "new" | "legacy";
  id: string;
  engineId: string;
  engineCode: string;
  family: string;
  serviceDate: string;
  serviceTime: string;
  typeSnapshot: string;
  mechanicId: string | null;
  mechanicName: string;
  note: string;
  cancelledAt: number | null;
  cancelledReason: string;
  createdAt: number;
};

type CountRow = { family: string; engines: number };
type RecordedRow = { family: string; records: number; engines: number };

/** Staré typy servisu jsou enum; do přehledu jdou čitelně a v obou jazycích. */
const LEGACY_TYPE_LABELS: Record<string, { cs: string; en: string }> = {
  inspection: { cs: "Kontrola", en: "Inspection" },
  piston_service: { cs: "Servis pístu", en: "Piston service" },
  top_end: { cs: "Top end", en: "Top end" },
  full_service: { cs: "Kompletní servis", en: "Full service" },
};

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Položky fronty se všemi daty, která report potřebuje: kdy motor do fronty vstoupil a kdy
 * a čím z ní odešel. Fronta se nikam neukládá, dopočítává se ze stejných zdrojů jako
 * `/api/service-queue` — proto stejný UNION.
 *
 * U závodu se motor objeví až den po jeho konci (fronta má `end_date < date('now')`), takže
 * i tady je vstupem `end_date + 1 den`. Jinak by report za den závodu tvrdil, že motor čeká,
 * a obrazovka v dílně by ho neukazovala.
 */
const QUEUE_ENTRIES = `
  SELECT eng.id AS engineId, eng.family AS family, 'race' AS sourceType, r.id AS sourceId,
         date(r.end_date, '+1 day') AS entryDate
  FROM race_entries re
  JOIN races r ON r.id = re.race_id
  JOIN engines eng ON eng.id IN (re.engine_1_id, re.engine_2_id, re.engine_3_id)
  WHERE r.status != 'archived' AND eng.archived_at IS NULL AND eng.sold_at IS NULL
  UNION
  SELECT eng.id, eng.family, 'loan', l.id, l.actual_return_date
  FROM engine_loans l
  JOIN engines eng ON eng.id = l.engine_id
  WHERE l.actual_return_date IS NOT NULL AND eng.archived_at IS NULL AND eng.sold_at IS NULL
  UNION
  SELECT eng.id, eng.family, 'manual', m.id, date(m.created_at / 1000, 'unixepoch')
  FROM engine_service_queue_manual m
  JOIN engines eng ON eng.id = m.engine_id
  WHERE eng.archived_at IS NULL AND eng.sold_at IS NULL
`;

/**
 * Zapsané servisy za období — z obou tabulek záznamů, **bez ohledu na frontu**.
 *
 * Fronta odpovídá na „kolik motorů dílna odbavila", ale servis může vzniknout i mimo ni
 * (motor, který nikdy do fronty nepřišel). Takový zápis by se v číslech z fronty neobjevil,
 * i když v tabulce pod reportem je vidět — právě tenhle rozpor tohle číslo odstraňuje.
 *
 * Počítá se podle `service_date`, tedy stejně, jako se řadí tabulka. Stornované záznamy se
 * nezapočítávají: zrušený servis není odvedená práce.
 */
async function loadRecorded(d1: ReturnType<typeof getD1>, params: Params) {
  const conditions = ["h.serviceDate >= ?", "h.serviceDate <= ?", "h.cancelledAt IS NULL"];
  const binds: unknown[] = [params.from, params.to];
  if (params.family) { conditions.push("h.family = ?"); binds.push(params.family); }
  if (params.engineId) { conditions.push("h.engineId = ?"); binds.push(params.engineId); }
  if (params.mechanicId) { conditions.push("h.mechanicId = ?"); binds.push(params.mechanicId); }

  const source = `
    SELECT r.id AS id, r.engine_id AS engineId, e.family AS family, r.service_date AS serviceDate,
           r.mechanic_name_snapshot AS mechanicName, r.mechanic_id AS mechanicId, r.cancelled_at AS cancelledAt
    FROM service_records r JOIN engines e ON e.id = r.engine_id
    UNION ALL
    SELECT s.id, s.engine_id, e.family, s.service_date,
           s.mechanic_name_snapshot, s.mechanic_id, NULL
    FROM engine_service_entries s JOIN engines e ON e.id = s.engine_id
  `;

  const [byFamily, byMechanic] = await Promise.all([
    d1.prepare(`
      SELECT h.family AS family, COUNT(*) AS records, COUNT(DISTINCT h.engineId) AS engines
      FROM (${source}) h WHERE ${conditions.join(" AND ")} GROUP BY h.family
    `).bind(...binds).all<RecordedRow>(),
    d1.prepare(`
      SELECT h.mechanicName AS name, COUNT(*) AS records, COUNT(DISTINCT h.engineId) AS engines
      FROM (${source}) h WHERE ${conditions.join(" AND ")} GROUP BY h.mechanicName
      HAVING name != '' ORDER BY records DESC, name
    `).bind(...binds).all<{ name: string; records: number; engines: number }>(),
  ]);

  return { byFamily: byFamily.results, byMechanic: byMechanic.results };
}

async function loadRecords(d1: ReturnType<typeof getD1>, params: Params) {
  const conditions: string[] = ["h.serviceDate >= ?", "h.serviceDate <= ?"];
  const binds: unknown[] = [params.from, params.to];
  if (params.family) { conditions.push("h.family = ?"); binds.push(params.family); }
  if (params.engineId) { conditions.push("h.engineId = ?"); binds.push(params.engineId); }
  if (params.mechanicId) { conditions.push("h.mechanicId = ?"); binds.push(params.mechanicId); }

  const rows = await d1.prepare(`
    SELECT * FROM (
      SELECT 'new' AS source, r.id AS id, r.engine_id AS engineId, e.code AS engineCode, e.family AS family,
             r.service_date AS serviceDate, r.service_time AS serviceTime,
             r.service_type_snapshot AS typeSnapshot, r.mechanic_id AS mechanicId,
             r.mechanic_name_snapshot AS mechanicName, r.note AS note,
             r.cancelled_at AS cancelledAt, r.cancelled_reason AS cancelledReason, r.created_at AS createdAt
      FROM service_records r
      JOIN engines e ON e.id = r.engine_id
      UNION ALL
      SELECT 'legacy', s.id, s.engine_id, e.code, e.family,
             s.service_date, '', s.service_type, s.mechanic_id,
             s.mechanic_name_snapshot, s.notes, NULL, '', s.created_at
      FROM engine_service_entries s
      JOIN engines e ON e.id = s.engine_id
    ) h
    WHERE ${conditions.join(" AND ")}
    ORDER BY h.serviceDate DESC, h.serviceTime DESC, h.createdAt DESC
    LIMIT 500
  `).bind(...binds).all<RecordRow>();

  const newIds = rows.results.filter((row) => row.source === "new").map((row) => row.id);
  const legacyIds = rows.results.filter((row) => row.source === "legacy").map((row) => row.id);

  // Položky obou zdrojů. Nová karta je drží v tabulce, stará v JSON snapshotu — v obou
  // případech jako text pořízený v době zápisu, takže pozdější přejmenování historii nepřepíše.
  const [newItems, legacyItems] = await Promise.all([
    newIds.length === 0 ? { results: [] } : d1.prepare(`
      SELECT service_record_id AS recordId, item_name_cs_snapshot AS nameCs, item_name_en_snapshot AS nameEn,
             material_snapshot AS materialSnapshot
      FROM service_record_items WHERE service_record_id IN (${newIds.map(() => "?").join(", ")})
      ORDER BY sort_order
    `).bind(...newIds).all<{ recordId: string; nameCs: string; nameEn: string; materialSnapshot: string | null }>(),
    legacyIds.length === 0 ? { results: [] } : d1.prepare(`
      SELECT id AS recordId, replaced_parts_snapshot AS snapshot, piston_size AS pistonSize
      FROM engine_service_entries WHERE id IN (${legacyIds.map(() => "?").join(", ")})
    `).bind(...legacyIds).all<{ recordId: string; snapshot: string; pistonSize: string }>(),
  ]);

  const itemsByRecord = new Map<string, Array<{ nameCs: string; nameEn: string; material: string }>>();
  for (const item of newItems.results) {
    const material = parseJson<{ name?: string } | null>(item.materialSnapshot, null)?.name ?? "";
    itemsByRecord.set(item.recordId, [...(itemsByRecord.get(item.recordId) ?? []), { nameCs: item.nameCs, nameEn: item.nameEn, material }]);
  }
  for (const item of legacyItems.results) {
    const parts = parseJson<Array<{ labelCs: string; labelEn: string; partKey: string }>>(item.snapshot, []);
    itemsByRecord.set(item.recordId, parts.map((part) => ({
      nameCs: part.labelCs || part.partKey,
      nameEn: part.labelEn || part.partKey,
      // Rozměr pístu byl u staré karty vlastní sloupec, ne položka katalogu.
      material: part.partKey === "piston" ? item.pistonSize : "",
    })));
  }

  return rows.results.map((row) => ({
    ...row,
    cancelled: Boolean(row.cancelledAt),
    typeCs: row.source === "legacy" ? LEGACY_TYPE_LABELS[row.typeSnapshot]?.cs ?? row.typeSnapshot : row.typeSnapshot,
    typeEn: row.source === "legacy" ? LEGACY_TYPE_LABELS[row.typeSnapshot]?.en ?? row.typeSnapshot : row.typeSnapshot,
    items: itemsByRecord.get(row.id) ?? [],
  }));
}

/**
 * Report za období. Počítá se z fronty, ne ze servisních záznamů: „odbaveno" znamená, že motor
 * z fronty odešel, ať už servisem, nebo odkliknutím „Nejel / bez servisu".
 *
 * Čísla se dopočítávají z živých dat, takže pozdější zásah do zdroje (smazaný závod, opravené
 * datum konce, archivovaný motor) minulý report změní. Pro provozní přehled to stačí; číslo,
 * které už nikdo nepřepíše, by znamenalo ukládat noční snímek.
 */
async function loadSummary(d1: ReturnType<typeof getD1>, params: Params, recorded: Awaited<ReturnType<typeof loadRecorded>>) {
  const familyFilter = params.family ? "AND e.family = ?" : "";
  const engineFilter = params.engineId ? "AND e.engineId = ?" : "";
  const extra: unknown[] = [];
  if (params.family) extra.push(params.family);
  if (params.engineId) extra.push(params.engineId);

  const base = `
    WITH entries AS (${QUEUE_ENTRIES})
    SELECT e.family AS family, COUNT(DISTINCT e.engineId) AS engines
    FROM entries e
    LEFT JOIN engine_service_queue_resolutions q
      ON q.engine_id = e.engineId AND q.source_type = e.sourceType AND q.source_id = e.sourceId
  `;

  const [waiting, serviced, skipped, remaining] = await Promise.all([
    // Čekalo: vstoupilo do fronty nejpozději na konci období a na jeho začátku ještě čekalo.
    // `min(?, date('now'))` drží horní hranici na dnešku — motor, který do fronty teprve
    // vstoupí (závod ještě neskončil), se do „čekalo" počítat nemá.
    d1.prepare(`${base} WHERE e.entryDate <= min(?, date('now')) AND (q.resolved_at IS NULL OR q.resolved_at >= ?) ${familyFilter} ${engineFilter} GROUP BY e.family`)
      .bind(params.to, params.fromMs, ...extra).all<CountRow>(),
    d1.prepare(`${base} WHERE q.resolution = 'serviced' AND q.resolved_at BETWEEN ? AND ? ${familyFilter} ${engineFilter} GROUP BY e.family`)
      .bind(params.fromMs, params.toMs, ...extra).all<CountRow>(),
    d1.prepare(`${base} WHERE q.resolution = 'skipped' AND q.resolved_at BETWEEN ? AND ? ${familyFilter} ${engineFilter} GROUP BY e.family`)
      .bind(params.fromMs, params.toMs, ...extra).all<CountRow>(),
    // Zbývá: stav teď, tedy co z období ještě nikdo neodbavil.
    d1.prepare(`${base} WHERE e.entryDate <= min(?, date('now')) AND q.resolved_at IS NULL ${familyFilter} ${engineFilter} GROUP BY e.family`)
      .bind(params.to, ...extra).all<CountRow>(),
  ]);

  const families = Array.from(new Set([
    ...waiting.results.map((row) => row.family),
    ...serviced.results.map((row) => row.family),
    ...skipped.results.map((row) => row.family),
    ...remaining.results.map((row) => row.family),
    ...recorded.byFamily.map((row) => row.family),
  ]));
  const pick = (rows: CountRow[], family: string) => rows.find((row) => row.family === family)?.engines ?? 0;
  const total = (rows: CountRow[]) => rows.reduce((sum, row) => sum + row.engines, 0);

  return {
    waiting: total(waiting.results),
    serviced: total(serviced.results),
    skipped: total(skipped.results),
    remaining: total(remaining.results),
    // Zapsané servisy stojí vedle čísel z fronty, ne místo nich: motor mohl projít servisem,
    // aniž by kdy byl ve frontě, a naopak odbavení „Nejel" žádný záznam nevytvoří.
    recorded: recorded.byFamily.reduce((sum, row) => sum + row.records, 0),
    byCategory: families.map((family) => ({
      family,
      waiting: pick(waiting.results, family),
      serviced: pick(serviced.results, family),
      skipped: pick(skipped.results, family),
      remaining: pick(remaining.results, family),
      recorded: recorded.byFamily.find((row) => row.family === family)?.records ?? 0,
    })),
    // Kdo kolik udělal — ze zapsaných servisů, ne z fronty. „Nejel / bez servisu" je
    // administrativní úkon, ne odvedená práce, a na sdílené obrazovce ho odklikne kdokoli.
    byMechanic: recorded.byMechanic,
  };
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const from = clean(url.searchParams.get("from"), 10);
  const to = clean(url.searchParams.get("to"), 10);
  if (!isDate(from) || !isDate(to)) return Response.json({ error: "A valid period is required" }, { status: 400 });

  const params: Params = {
    from, to,
    fromMs: Number(url.searchParams.get("fromMs")) || Date.parse(`${from}T00:00:00Z`),
    toMs: Number(url.searchParams.get("toMs")) || Date.parse(`${to}T23:59:59Z`),
    family: clean(url.searchParams.get("family"), 20),
    engineId: clean(url.searchParams.get("engineId"), 80),
    mechanicId: clean(url.searchParams.get("mechanicId"), 80),
  };

  await ensureRuntimeSchema();
  const d1 = getD1();

  const recorded = await loadRecorded(d1, params);
  const [records, summary, engines, mechanics, categories] = await Promise.all([
    loadRecords(d1, params),
    loadSummary(d1, params, recorded),
    d1.prepare("SELECT id, code, family FROM engines WHERE archived_at IS NULL AND sold_at IS NULL ORDER BY family, code").all(),
    d1.prepare("SELECT id, name FROM mechanics WHERE archived_at IS NULL ORDER BY name").all(),
    d1.prepare("SELECT code, sort_order AS sortOrder FROM engine_categories WHERE archived_at IS NULL ORDER BY sort_order").all(),
  ]);

  return Response.json({
    records,
    summary,
    engines: engines.results,
    mechanics: mechanics.results,
    categories: categories.results,
  });
}
