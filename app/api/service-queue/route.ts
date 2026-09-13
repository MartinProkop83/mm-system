import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

/**
 * Fronta motorů čekajících na servis.
 *
 * Fronta se **nikam neukládá** — dopočítává se ze dvou zdrojů:
 *  - motor přiřazený k závodu, který už skončil (`races.end_date < dnes`)
 *  - motor vrácený ze zápůjčky (`engine_loans.actual_return_date` vyplněné)
 *
 * a odečítá se z ní to, co už někdo vyřídil (`engine_service_queue_resolutions`). Díky tomu se
 * fronta sama přizpůsobí, když se smaže závod, změní přiřazení motoru nebo opraví datum konce.
 *
 * Záměrně přestřeluje: `race_entries` má tři sloty na motor a systém nepozná, který reálně jel,
 * takže po velkém závodě může ve frontě skončit i šedesát motorů. Radši motor navíc než chybějící
 * — proto hromadné odbavení níže.
 */

type QueueRow = {
  engineId: string;
  engineCode: string;
  family: string;
  sourceType: "race" | "loan" | "manual";
  sourceId: string;
  sourceLabel: string;
  returnDate: string;
  returnedAt: number;
  /** Jen u ručně zařazených: proč tam motor je, kdo ho poslal a kdy. */
  note: string;
  addedBy: string;
};

type Payload = {
  /** Položky k odbavení; víc než jedna = hromadné odkliknutí „Nejel / bez servisu". */
  items?: Array<{ engineId?: string; sourceType?: string; sourceId?: string }>;
  /** Ruční zařazení motoru do fronty. */
  addEngineId?: string;
  addNote?: string;
};

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Jedna položka fronty = jeden pobyt motoru mimo dílnu, který ještě nikdo neodbavil.
 * Motor může být ve frontě víckrát (dva závody po sobě) — každý zdroj je vlastní řádek.
 */
async function loadQueue(d1: ReturnType<typeof getD1>): Promise<QueueRow[]> {
  const rows = await d1.prepare(`
    SELECT eng.id AS engineId, eng.code AS engineCode, eng.family,
           'race' AS sourceType, r.id AS sourceId, r.name AS sourceLabel,
           r.end_date AS returnDate, r.updated_at AS returnedAt, '' AS note, '' AS addedBy
    FROM race_entries re
    JOIN races r ON r.id = re.race_id
    JOIN engines eng ON eng.id IN (re.engine_1_id, re.engine_2_id, re.engine_3_id)
    WHERE r.status != 'archived'
      AND r.end_date < date('now')
      AND eng.archived_at IS NULL
      AND eng.sold_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM engine_service_queue_resolutions q
        WHERE q.engine_id = eng.id AND q.source_type = 'race' AND q.source_id = r.id
      )

    UNION

    SELECT eng.id, eng.code, eng.family,
           'loan', l.id, l.recipient_name_snapshot,
           l.actual_return_date, l.updated_at, '', ''
    FROM engine_loans l
    JOIN engines eng ON eng.id = l.engine_id
    WHERE l.actual_return_date IS NOT NULL
      AND eng.archived_at IS NULL
      AND eng.sold_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM engine_service_queue_resolutions q
        WHERE q.engine_id = eng.id AND q.source_type = 'loan' AND q.source_id = l.id
      )

    UNION

    SELECT eng.id, eng.code, eng.family,
           'manual', m.id, '',
           date(m.created_at / 1000, 'unixepoch'), m.created_at, m.note, m.created_by
    FROM engine_service_queue_manual m
    JOIN engines eng ON eng.id = m.engine_id
    WHERE eng.archived_at IS NULL
      AND eng.sold_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM engine_service_queue_resolutions q
        WHERE q.engine_id = eng.id AND q.source_type = 'manual' AND q.source_id = m.id
      )
  `).all<QueueRow>();
  return rows.results;
}

export async function GET(request: Request) {
  // Frontu vidí i mechanik — je to jeho hlavní pracovní obrazovka, ne administrace.
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const queue = await loadQueue(d1);

  // Nejbližší naplánovaný závod pro každý motor ve frontě — kvůli zvýraznění a řazení nahoru.
  const engineIds = Array.from(new Set(queue.map((row) => row.engineId)));
  const upcoming = engineIds.length === 0 ? { results: [] } : await d1.prepare(`
    SELECT eng.id AS engineId, MIN(r.start_date) AS startDate,
           (SELECT r2.name FROM races r2
            JOIN race_entries re2 ON re2.race_id = r2.id
            WHERE r2.status != 'archived' AND r2.start_date >= date('now')
              AND eng.id IN (re2.engine_1_id, re2.engine_2_id, re2.engine_3_id)
            ORDER BY r2.start_date LIMIT 1) AS raceName
    FROM race_entries re
    JOIN races r ON r.id = re.race_id
    JOIN engines eng ON eng.id IN (re.engine_1_id, re.engine_2_id, re.engine_3_id)
    WHERE r.status != 'archived' AND r.start_date >= date('now')
      AND eng.id IN (${engineIds.map(() => "?").join(", ")})
    GROUP BY eng.id
  `).bind(...engineIds).all<{ engineId: string; startDate: string; raceName: string }>();

  const upcomingByEngine = new Map(upcoming.results.map((row) => [row.engineId, row]));

  const [categories, engines] = await Promise.all([
    d1.prepare("SELECT code, name_cs AS nameCs, name_en AS nameEn, sort_order AS sortOrder FROM engine_categories WHERE archived_at IS NULL ORDER BY sort_order").all(),
    // Nabídka pro ruční zařazení — všechny živé motory, i ty, co zrovna ve frontě nejsou.
    d1.prepare("SELECT id, code, family FROM engines WHERE archived_at IS NULL AND sold_at IS NULL ORDER BY family, code").all(),
  ]);

  return Response.json({
    categories: categories.results,
    engines: engines.results,
    items: queue.map((row) => {
      const next = upcomingByEngine.get(row.engineId);
      return {
        ...row,
        nextRaceDate: next?.startDate ?? null,
        nextRaceName: next?.raceName ?? null,
      };
    }),
  });
}

/**
 * Odbavení „Nejel / bez servisu" — pro jednu položku i pro celý výběr naráz.
 *
 * Vyřízení servisním záznamem sem nechodí; to zapisuje `/api/service-records` při uložení,
 * aby se fronta a historie nemohly rozejít.
 */
export async function POST(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Ruční zařazení — smí kdokoli přihlášený, protože problém na motoru nejčastěji odhalí mechanik.
  if (payload.addEngineId !== undefined) {
    const engineId = clean(payload.addEngineId, 80);
    const note = clean(payload.addNote, 500);
    if (!engineId) return Response.json({ error: "Engine is required" }, { status: 400 });
    if (!note) return Response.json({ error: "note_required" }, { status: 400 });

    await ensureRuntimeSchema();
    const d1 = getD1();
    const engine = await d1.prepare("SELECT id, code FROM engines WHERE id = ? AND archived_at IS NULL AND sold_at IS NULL")
      .bind(engineId).first<{ id: string; code: string }>();
    if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });

    const id = crypto.randomUUID();
    const addedAt = Date.now();
    await d1.batch([
      d1.prepare("INSERT INTO engine_service_queue_manual (id, engine_id, note, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(id, engine.id, note, user.email, addedAt),
      d1.prepare(`
        INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, 'service_queue_add', 'engine', ?, ?, ?)
      `).bind(crypto.randomUUID(), user.email, engine.id, JSON.stringify({ note }), addedAt),
    ]);
    return Response.json({ id }, { status: 201 });
  }

  const items = (payload.items ?? [])
    .map((item) => ({
      engineId: clean(item.engineId, 80),
      sourceType: clean(item.sourceType, 10),
      sourceId: clean(item.sourceId, 80),
    }))
    .filter((item) => item.engineId && item.sourceId && ["race", "loan", "manual"].includes(item.sourceType));
  if (items.length === 0) return Response.json({ error: "Nothing to resolve" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const now = Date.now();

  const statements = items.map((item) => d1.prepare(`
    INSERT INTO engine_service_queue_resolutions (id, engine_id, source_type, source_id, resolution, service_record_id, resolved_by, resolved_at)
    VALUES (?, ?, ?, ?, 'skipped', NULL, ?, ?)
    ON CONFLICT (engine_id, source_type, source_id) DO NOTHING
  `).bind(crypto.randomUUID(), item.engineId, item.sourceType, item.sourceId, user.email, now));

  // Audit drží stopu i po hromadném odbavení — jinak by po odkliknutí šedesáti motorů
  // nezůstalo nic, z čeho poznat, kdo to byl.
  statements.push(d1.prepare(`
    INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, 'service_queue_skip', 'engine', ?, ?, ?)
  `).bind(crypto.randomUUID(), user.email, items.length === 1 ? items[0].engineId : "",
    JSON.stringify({ count: items.length, items }), now));

  for (let offset = 0; offset < statements.length; offset += 50) {
    await d1.batch(statements.slice(offset, offset + 50));
  }

  return Response.json({ resolved: items.length });
}
