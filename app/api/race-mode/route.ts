import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";
import { NO_HOUR_TRACKING_ENGINE_FAMILIES } from "../../engine-family-rules";
import { getEngine, parseTime, recalculateEngine } from "../../engine-usage";

/**
 * RACE MODE — práce přímo na place.
 *
 * Proč vlastní routa, když `/api/race-planning` umí totéž: plánování vrací organizátora,
 * adresy, mechaniky, auta, poznámky a přes vazby i obchodní kontext. Mechanik je na place
 * s ostatními, ale k tomuhle nemá co vidět. Tahle routa **skládá odpověď z nuly** — jen
 * název a termín závodu, piloti s kategorií a jejich přiřazené motory. Nic víc se sem
 * nedostane ani omylem: přidat pole do odpovědi znamená napsat ho tady ručně.
 *
 * Druhá pojistka je whitelist v `app/api-access.ts`, který odpověď mechanikovi ještě jednou
 * ořeže. Kdyby někdo v budoucnu do dotazu níž přidal sloupec navíc, whitelist ho zahodí.
 *
 * Předávky zákazníkům sem nepatří vůbec — ani pro vedení. Ty zůstávají v `/api/race-deliveries`,
 * kam mechanik nemá přístup.
 */

type Kind = "engineRun" | "usage" | "delivery";

type Payload = {
  kind?: Kind;
  raceId?: string;
  entryId?: string;
  engineId?: string;
  raced?: boolean;
  /** Stav Oppamy opsaný na place, ve tvaru HH:MM. */
  oppama?: string;
  /** Rychlá předávka: komu, co, za kolik. */
  customerName?: string;
  inventoryPartId?: string;
  description?: string;
  quantity?: number;
  amountCents?: number;
  currency?: "CZK" | "EUR";
  isPaid?: boolean;
};

type RaceRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  departureDate: string;
  returnDate: string;
  status: string;
};

type EntryRow = {
  id: string;
  category: string;
  driverName: string;
  engine1Id: string | null; engine1Code: string; engine1Family: string | null;
  engine2Id: string | null; engine2Code: string; engine2Family: string | null;
  engine3Id: string | null; engine3Code: string; engine3Family: string | null;
};

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Závody, které RACE MODE nabízí: dnešek padá do rozsahu odjezd → návrat, nebo závod skončil
 * nejvýš před dvěma dny. Filtruje se v SQL, aby se ven nedostaly ani závody, které do režimu
 * nepatří — klient tak nedostane seznam všeho, co je v kalendáři.
 */
const ELIGIBLE_RACES = `
  SELECT id, name, start_date AS startDate, end_date AS endDate,
         departure_date AS departureDate, return_date AS returnDate,
         CASE WHEN end_date < date('now') THEN 'completed'
              WHEN start_date > date('now') THEN 'planned'
              ELSE 'active' END AS status
  FROM races
  WHERE status != 'archived'
    AND (
      (COALESCE(NULLIF(departure_date, ''), start_date) <= date('now')
        AND date('now') <= COALESCE(NULLIF(return_date, ''), end_date))
      OR (end_date <= date('now') AND julianday(date('now')) - julianday(end_date) <= 2)
    )
  ORDER BY start_date DESC
`;

/** Přiřazené motory pilota vytažené ze tří slotů do jednoho seznamu. */
function engineSlots(entry: EntryRow) {
  return [
    { engineId: entry.engine1Id, engineCode: entry.engine1Code, family: entry.engine1Family },
    { engineId: entry.engine2Id, engineCode: entry.engine2Code, family: entry.engine2Family },
    { engineId: entry.engine3Id, engineCode: entry.engine3Code, family: entry.engine3Family },
  ].filter((slot): slot is { engineId: string; engineCode: string; family: string | null } => Boolean(slot.engineId));
}

async function loadRace(raceId: string) {
  return getD1().prepare(`${ELIGIBLE_RACES.replace("WHERE status != 'archived'", "WHERE status != 'archived' AND id = ?")}`)
    .bind(raceId).first<RaceRow>();
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const raceId = clean(new URL(request.url).searchParams.get("raceId"), 80);

  // Bez `raceId` jen výběr závodu — nabídka je stejná pro všechny role.
  if (!raceId) {
    const races = await d1.prepare(ELIGIBLE_RACES).all<RaceRow>();
    return auth.json({ races: races.results });
  }

  const race = await loadRace(raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });

  const [entries, runs] = await Promise.all([
    d1.prepare(`
      SELECT re.id, re.category, re.driver_name_snapshot AS driverName,
             re.engine_1_id AS engine1Id, re.engine_1_code AS engine1Code, e1.family AS engine1Family,
             re.engine_2_id AS engine2Id, re.engine_2_code AS engine2Code, e2.family AS engine2Family,
             re.engine_3_id AS engine3Id, re.engine_3_code AS engine3Code, e3.family AS engine3Family
      FROM race_entries re
      LEFT JOIN engines e1 ON e1.id = re.engine_1_id
      LEFT JOIN engines e2 ON e2.id = re.engine_2_id
      LEFT JOIN engines e3 ON e3.id = re.engine_3_id
      WHERE re.race_id = ?
      ORDER BY re.sort_order, re.driver_name_snapshot
    `).bind(raceId).all<EntryRow>(),
    d1.prepare("SELECT engine_id AS engineId, raced FROM race_engine_runs WHERE race_id = ?")
      .bind(raceId).all<{ engineId: string; raced: number }>(),
  ]);

  // Podklady pro rychlé předávky vidí jen vedení a superadmin. Mechanik je nedostane dvakrát:
  // jednak se pro něj vůbec nenačtou, jednak je whitelist v `api-access.ts` nezná.
  const canSeeDeliveries = auth.user.role !== "mechanic";
  const [customers, inventory, deliveries] = canSeeDeliveries
    ? await Promise.all([
      d1.prepare("SELECT id, name FROM customers WHERE archived_at IS NULL ORDER BY name").all<{ id: string; name: string }>(),
      d1.prepare("SELECT id, code, name, quantity, price_czk_cents AS priceCzkCents, price_eur_cents AS priceEurCents FROM inventory_parts WHERE archived_at IS NULL AND quantity > 0 ORDER BY name").all(),
      d1.prepare("SELECT id, customer_name AS customerName, description, quantity, currency, amount_cents AS amountCents, is_paid AS isPaid FROM race_deliveries WHERE race_id = ? ORDER BY created_at DESC").bind(raceId).all<{ isPaid: number }>(),
    ])
    : [null, null, null];

  // Odpověď se skládá ručně, pole po poli — ne rozprostřením řádku z databáze. Whitelist
  // v `api-access.ts` je druhá vrstva a aplikuje ho `auth.json()` sám.
  return auth.json({
    race: { id: race.id, name: race.name, startDate: race.startDate, endDate: race.endDate },
    entries: entries.results.map((entry) => ({
      id: entry.id,
      category: entry.category,
      driverName: entry.driverName,
      engines: engineSlots(entry).map((slot) => ({
        engineId: slot.engineId,
        engineCode: slot.engineCode,
        // Klient z rodiny pozná jen to, jestli má nabídnout pole na motohodiny.
        tracksHours: slot.family !== null && !NO_HOUR_TRACKING_ENGINE_FAMILIES.includes(slot.family),
      })),
    })),
    engineRuns: runs.results.map((run) => ({ engineId: run.engineId, raced: Boolean(run.raced) })),
    ...(canSeeDeliveries ? {
      customers: customers?.results ?? [],
      inventory: inventory?.results ?? [],
      deliveries: (deliveries?.results ?? []).map((row) => ({ ...row, isPaid: Boolean(row.isPaid) })),
    } : {}),
  });
}

/**
 * Ověří, že motor je skutečně přiřazený k téhle přihlášce na tomhle závodě. Bez toho by šlo
 * zapsat „jel" nebo motohodiny libovolnému motoru v systému.
 */
async function assertEngineOnEntry(raceId: string, entryId: string, engineId: string) {
  return getD1().prepare(`
    SELECT id FROM race_entries
    WHERE id = ? AND race_id = ? AND ? IN (engine_1_id, engine_2_id, engine_3_id)
  `).bind(entryId, raceId, engineId).first<{ id: string }>();
}

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

  const raceId = clean(payload.raceId, 80);
  if (!raceId) return Response.json({ error: "Race id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  // Zapisovat jde jen do závodu, který je v režimu otevřený — ne zpětně do libovolného.
  const race = await loadRace(raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });

  const d1 = getD1();
  const now = Date.now();

  if (payload.kind === "delivery") return saveDelivery(payload, race, auth.user, d1, now);

  // Potvrzování a motohodiny se vážou na konkrétní motor konkrétního pilota.
  const entryId = clean(payload.entryId, 80);
  const engineId = clean(payload.engineId, 80);
  if (!entryId || !engineId) return Response.json({ error: "Entry and engine are required" }, { status: 400 });
  if (!await assertEngineOnEntry(raceId, entryId, engineId)) {
    return Response.json({ error: "Engine is not assigned to this entry" }, { status: 404 });
  }

  if (payload.kind === "engineRun") {
    if (typeof payload.raced !== "boolean") return Response.json({ error: "raced must be a boolean" }, { status: 400 });
    await d1.prepare(`
      INSERT INTO race_engine_runs (id, race_id, race_entry_id, engine_id, raced, recorded_by, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (race_id, engine_id) DO UPDATE SET
        raced = excluded.raced, recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at
    `).bind(crypto.randomUUID(), raceId, entryId, engineId, payload.raced ? 1 : 0, user.email, now).run();
    return Response.json({ engineId, raced: payload.raced });
  }

  if (payload.kind === "usage") {
    const engine = await getEngine(engineId);
    if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });
    if (NO_HOUR_TRACKING_ENGINE_FAMILIES.includes(engine.family)) {
      return Response.json({ error: "This engine family does not use Oppama tracking" }, { status: 400 });
    }
    const oppamaMinutes = parseTime(clean(payload.oppama, 10));
    if (oppamaMinutes === null) return Response.json({ error: "Oppama must use HH:MM and be greater than 00:00" }, { status: 400 });

    // Motohodiny se zapisují k datu konce závodu, ne k dnešku — potvrzování bývá o den dva
    // pozdější a počítadla se řadí podle data, ne podle toho, kdy to kdo naklikal.
    const entryDate = race.endDate;
    const id = crypto.randomUUID();
    await d1.batch([
      d1.prepare(`
        INSERT INTO engine_usage_logs (id, engine_id, entry_date, oppama_minutes, race_name, driver_name, notes, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, '', 'RACE MODE', ?, ?)
      `).bind(id, engineId, entryDate, oppamaMinutes, race.name, user.email, now),
      d1.prepare(`
        INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, 'log_usage', 'engine', ?, ?, ?)
      `).bind(crypto.randomUUID(), user.email, engineId, JSON.stringify({ recordId: id, date: entryDate, oppamaMinutes, raceName: race.name, source: "race-mode" }), now),
    ]);
    await recalculateEngine(engineId, now);
    return Response.json({ engineId, oppamaMinutes });
  }

  return Response.json({ error: "Invalid race mode action" }, { status: 400 });
}

/**
 * Rychlá předávka z place: komu, co, za kolik, zaplaceno.
 *
 * Mechanik sem nesmí — předávka nese zákazníka a cenu. Když se vybere díl ze skladu, rovnou
 * se odečte a uloží se vazba na něj, aby ho pozdější smazání předávky vrátilo zpátky.
 * Volný popis zůstává pro to, co ve skladu není.
 */
async function saveDelivery(
  payload: Payload,
  race: RaceRow,
  user: { role: string; email: string },
  d1: ReturnType<typeof getD1>,
  now: number,
) {
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });

  const customerName = clean(payload.customerName, 160);
  const quantity = Number(payload.quantity ?? 1);
  const amountCents = Number(payload.amountCents ?? 0);
  const currency = payload.currency === "EUR" ? "EUR" : "CZK";
  if (!customerName) return Response.json({ error: "Customer is required" }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return Response.json({ error: "Quantity must be a whole positive number" }, { status: 400 });
  if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > 1_000_000_000) return Response.json({ error: "Invalid amount" }, { status: 400 });

  const partId = clean(payload.inventoryPartId, 80);
  let description = clean(payload.description, 500);
  const statements: ReturnType<typeof d1.prepare>[] = [];

  if (partId) {
    const part = await d1.prepare("SELECT id, code, name, quantity FROM inventory_parts WHERE id = ? AND archived_at IS NULL")
      .bind(partId).first<{ id: string; code: string; name: string; quantity: number }>();
    if (!part) return Response.json({ error: "Stock part not found" }, { status: 404 });
    if (quantity > part.quantity) {
      return Response.json({ error: `Na skladě je jen ${part.quantity} ks dílu ${part.code}` }, { status: 409 });
    }
    description = part.name;
    statements.push(d1.prepare("UPDATE inventory_parts SET quantity = quantity - ?, updated_at = ? WHERE id = ?")
      .bind(quantity, now, part.id));
  }
  if (!description) return Response.json({ error: "Item is required" }, { status: 400 });

  const id = crypto.randomUUID();
  const isPaid = payload.isPaid ? 1 : 0;
  statements.unshift(d1.prepare(`
    INSERT INTO race_deliveries (id, race_id, customer_name, description, quantity, currency, amount_cents,
      payment_method, is_delivered, is_paid, notes, inventory_part_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'cash', 1, ?, 'RACE MODE', ?, ?, ?, ?)
  `).bind(id, race.id, customerName, description, quantity, currency, amountCents, isPaid, partId || null, user.email, now, now));
  statements.push(d1.prepare(`
    INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, 'create', 'race_delivery', ?, ?, ?)
  `).bind(crypto.randomUUID(), user.email, id, JSON.stringify({ raceId: race.id, customerName, description, quantity, currency, amountCents, isPaid: Boolean(isPaid), source: "race-mode" }), now));

  await d1.batch(statements);
  return Response.json({ id }, { status: 201 });
}
