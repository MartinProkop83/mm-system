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
  /** Kdo motor měl: pilot ze závodu, u zápůjčky příjemce. U ručního zařazení prázdné. */
  driverName: string;
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
  /** „Beru si ho" — mechanik si motor zabere, aby na něm nedělali dva. */
  claimEngineId?: string;
  /** Kdo si ho bere. Povinné jen pro sdílený panel (superadmin/vedení), viz `needsMechanic`. */
  claimMechanicId?: string;
  /** „Vrátit do fronty" — uvolnění zabraného motoru. */
  releaseEngineId?: string;
};

/** Zabraný motor tak, jak ho vidí konkrétní uživatel. */
type ClaimRow = {
  id: string;
  engineId: string;
  claimedBy: string;
  claimedByName: string;
  claimedAt: number;
};

/** Uvolnit motor smí ten, kdo si ho vzal, plus vedení a superadmin. */
function mayRelease(role: string, claimedBy: string, email: string) {
  return claimedBy === email || role === "superadmin" || role === "boss";
}

/**
 * Musí se při zabrání vybrat mechanik?
 *
 * Obrazovka v dílně běží na jednom sdíleném účtu za celou partu, a ten účet patří vedení
 * nebo superadminovi. Zapsat zabrání na přihlášeného uživatele by u něj znamenalo zapsat
 * vždycky tutéž — nesprávnou — osobu. Mechanikův vlastní účet je naopak konkrétní člověk,
 * tam se nikdo vybírat nemusí.
 */
function claimNeedsMechanic(role: string) {
  return role !== "mechanic";
}

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
           r.end_date AS returnDate, r.updated_at AS returnedAt,
           re.driver_name_snapshot AS driverName, '' AS note, '' AS addedBy
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
           l.actual_return_date, l.updated_at, l.recipient_name_snapshot, '', ''
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
           date(m.created_at / 1000, 'unixepoch'), m.created_at, '', m.note, m.created_by
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

/** Jeden motor = jedna položka fronty, i když se sešlo víc důvodů. Mechanik ho má v ruce jednou. */
type QueueEngine = {
  engineId: string;
  engineCode: string;
  family: string;
  sources: Array<Pick<QueueRow, "sourceType" | "sourceId" | "sourceLabel" | "returnDate" | "driverName" | "note" | "addedBy">>;
  /** Nejnovější návrat ze všech zdrojů — od té doby motor reálně čeká v dílně. */
  returnDate: string;
  driverNames: string[];
  notes: string[];
};

/**
 * Sloučí řádky jednoho motoru do jedné položky.
 *
 * Motor může přijet ze závodu a ještě být veden jako vrácený ze zápůjčky; ve frontě se pak
 * objevil dvakrát a vypadal jako dva motory se stejným číslem. Odbavení projde všechny
 * zdroje naráz — proto se nesou dál v `sources`.
 */
function mergeByEngine(rows: QueueRow[]): QueueEngine[] {
  const byEngine = new Map<string, QueueEngine>();
  for (const row of rows) {
    const current = byEngine.get(row.engineId);
    const source = {
      sourceType: row.sourceType, sourceId: row.sourceId, sourceLabel: row.sourceLabel,
      returnDate: row.returnDate, driverName: row.driverName, note: row.note, addedBy: row.addedBy,
    };
    if (!current) {
      byEngine.set(row.engineId, {
        engineId: row.engineId, engineCode: row.engineCode, family: row.family,
        sources: [source], returnDate: row.returnDate,
        driverNames: row.driverName ? [row.driverName] : [],
        notes: row.note ? [row.note] : [],
      });
      continue;
    }
    current.sources.push(source);
    if (row.returnDate > current.returnDate) current.returnDate = row.returnDate;
    if (row.driverName && !current.driverNames.includes(row.driverName)) current.driverNames.push(row.driverName);
    if (row.note && !current.notes.includes(row.note)) current.notes.push(row.note);
  }
  return Array.from(byEngine.values());
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

  // Rozpracované motory. Zabrání je na motor, ne na položku fronty — motor může ve frontě
  // čekat víckrát (dva závody po sobě) a dělá se na něm jednou.
  const claims = engineIds.length === 0 ? { results: [] as ClaimRow[] } : await d1.prepare(`
    SELECT id, engine_id AS engineId, claimed_by AS claimedBy, claimed_by_name AS claimedByName, claimed_at AS claimedAt
    FROM engine_service_claims
    WHERE released_at IS NULL AND engine_id IN (${engineIds.map(() => "?").join(", ")})
  `).bind(...engineIds).all<ClaimRow>();
  const claimByEngine = new Map(claims.results.map((row) => [row.engineId, row]));

  const [categories, engines, mechanics] = await Promise.all([
    d1.prepare("SELECT code, name_cs AS nameCs, name_en AS nameEn, sort_order AS sortOrder, service_card_migrated AS serviceCardMigrated FROM engine_categories WHERE archived_at IS NULL ORDER BY sort_order").all<{ code: string; serviceCardMigrated: number }>(),
    // Nabídka pro ruční zařazení — všechny živé motory, i ty, co zrovna ve frontě nejsou.
    d1.prepare("SELECT id, code, family FROM engines WHERE archived_at IS NULL AND sold_at IS NULL ORDER BY family, code").all(),
    // Nabídka „kdo si motor bere" pro sdílený panel v dílně.
    d1.prepare("SELECT id, name FROM mechanics WHERE archived_at IS NULL ORDER BY name").all(),
  ]);

  const migratedByCode = new Map(categories.results.map((category) => [category.code, category.serviceCardMigrated]));
  // Motor, který ve frontě už čeká, se nesmí přidat podruhé — nabídka ho proto označí.
  const queuedEngineIds = new Set(queue.map((row) => row.engineId));

  return Response.json({
    categories: categories.results,
    engines: (engines.results as Array<{ id: string }>).map((engine) => ({ ...engine, inQueue: queuedEngineIds.has(engine.id) })),
    mechanics: mechanics.results,
    // O tom, jestli se má ptát na mechanika, rozhoduje server — klient role nezná.
    claimNeedsMechanic: claimNeedsMechanic(user.role),
    items: mergeByEngine(queue).map((row) => {
      const next = upcomingByEngine.get(row.engineId);
      const claim = claimByEngine.get(row.engineId);
      return {
        ...row,
        // Kategorie, která ještě jede po staré servisní kartě, otevírá jiný formulář zápisu.
        serviceCardMigrated: Boolean(migratedByCode.get(row.family)),
        nextRaceDate: next?.startDate ?? null,
        nextRaceName: next?.raceName ?? null,
        // `canRelease` počítá server, aby klient nemusel znát role — a hlavně proto, že
        // rozhodující kontrola stejně běží až při samotném uvolnění (POST níž).
        claim: claim
          ? { id: claim.id, byName: claim.claimedByName, at: claim.claimedAt, canRelease: mayRelease(user.role, claim.claimedBy, user.email) }
          : null,
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

    // Motor, který ve frontě už čeká, se nepřidává podruhé — dlaždice je jedna na motor,
    // takže by druhé zařazení jen tiše přibylo mezi důvody a nikdo by ho nečekal.
    const queued = await loadQueue(d1);
    if (queued.some((row) => row.engineId === engine.id)) {
      return Response.json({ error: "already_queued" }, { status: 409 });
    }

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

  // „Beru si ho" — zabrání motoru. Smí kdokoli přihlášený: mechanik, vedení i superadmin.
  if (payload.claimEngineId !== undefined) {
    const engineId = clean(payload.claimEngineId, 80);
    if (!engineId) return Response.json({ error: "Engine is required" }, { status: 400 });

    await ensureRuntimeSchema();
    const d1 = getD1();
    const engine = await d1.prepare("SELECT id FROM engines WHERE id = ? AND archived_at IS NULL AND sold_at IS NULL")
      .bind(engineId).first<{ id: string }>();
    if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });

    // Na dlaždici má být jméno člověka, ne sdíleného panelu. U mechanika je ten člověk dán
    // přihlášením, u ostatních rolí se vybírá — a vynucuje se to tady, ne jen v UI.
    let mechanicId: string | null = null;
    let displayName = user.fullName;
    if (claimNeedsMechanic(user.role)) {
      const picked = clean(payload.claimMechanicId, 80);
      if (!picked) return Response.json({ error: "mechanic_required" }, { status: 400 });
      const mechanic = await d1.prepare("SELECT id, name FROM mechanics WHERE id = ? AND archived_at IS NULL")
        .bind(picked).first<{ id: string; name: string }>();
      if (!mechanic) return Response.json({ error: "mechanic_required" }, { status: 400 });
      mechanicId = mechanic.id;
      displayName = mechanic.name;
    }

    const now = Date.now();
    // `WHERE NOT EXISTS` odmítne zabrání motoru, který už někdo drží; částečný unikátní index
    // pak pokrývá i dvě kliknutí ve stejný okamžik, kdy oba dotazy uvidí motor ještě volný.
    //
    // `claimed_by` zůstává účet, který klikl — i u sdíleného panelu, aby zůstalo dohledatelné,
    // odkud zápis přišel. Na dlaždici se ukazuje `claimed_by_name`.
    try {
      const result = await d1.prepare(`
        INSERT INTO engine_service_claims (id, engine_id, claimed_by, claimed_by_name, claimed_mechanic_id, claimed_at, release_reason)
        SELECT ?, ?, ?, ?, ?, ?, ''
        WHERE NOT EXISTS (SELECT 1 FROM engine_service_claims WHERE engine_id = ? AND released_at IS NULL)
      `).bind(crypto.randomUUID(), engine.id, user.email, displayName, mechanicId, now, engine.id).run();
      if (!result.meta.changes) return Response.json({ error: "already_claimed" }, { status: 409 });
    } catch {
      return Response.json({ error: "already_claimed" }, { status: 409 });
    }

    await d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'service_queue_claim', 'engine', ?, ?, ?)
    `).bind(crypto.randomUUID(), user.email, engine.id, JSON.stringify({ mechanicId, name: displayName }), now).run();
    return Response.json({ claimed: engine.id }, { status: 201 });
  }

  // „Vrátit do fronty" — uvolní ten, kdo si motor vzal, plus vedení a superadmin.
  if (payload.releaseEngineId !== undefined) {
    const engineId = clean(payload.releaseEngineId, 80);
    if (!engineId) return Response.json({ error: "Engine is required" }, { status: 400 });

    await ensureRuntimeSchema();
    const d1 = getD1();
    const claim = await d1.prepare("SELECT id, claimed_by AS claimedBy FROM engine_service_claims WHERE engine_id = ? AND released_at IS NULL")
      .bind(engineId).first<{ id: string; claimedBy: string }>();
    if (!claim) return Response.json({ error: "not_claimed" }, { status: 404 });
    if (!mayRelease(user.role, claim.claimedBy, user.email)) {
      return Response.json({ error: "Na motoru dělá někdo jiný." }, { status: 403 });
    }

    const now = Date.now();
    await d1.batch([
      d1.prepare("UPDATE engine_service_claims SET released_at = ?, released_by = ?, release_reason = 'manual' WHERE id = ?")
        .bind(now, user.email, claim.id),
      d1.prepare(`
        INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, 'service_queue_release', 'engine', ?, '{}', ?)
      `).bind(crypto.randomUUID(), user.email, engineId, now),
    ]);
    return Response.json({ released: engineId });
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
