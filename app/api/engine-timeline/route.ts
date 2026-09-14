import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

/**
 * Časová osa motoru — všechno, co se s ním dělo, na jednom místě.
 *
 * Skládá se z devíti zdrojů, protože historie motoru nikde jako celek neexistuje: servis má dvě
 * podoby (nová karta i starý model), fronta dvě události, závody a zápůjčky vlastní tabulky
 * a technické údaje samostatný log. Události se dopočítávají při každém načtení, nic se
 * nikam nekopíruje.
 *
 * `system: true` nesou události, které nejsou o motoru, ale o práci se záznamem — založení
 * karty, přejmenování, archivace, vstupní stav počítadel. Na ose se ukazují až po přepnutí.
 */

type TimelineKind =
  | "service" | "service_legacy" | "service_cancelled"
  | "race" | "loan" | "loan_returned"
  | "queue_added" | "queue_skipped"
  | "technical" | "usage" | "system";

type TimelineEvent = {
  id: string;
  kind: TimelineKind;
  /** Kdy se to stalo: `YYYY-MM-DD`, případně s časem u událostí, které ho nesou. */
  date: string;
  time: string;
  /** Řadicí klíč v ms — události bez vlastního času padnou na začátek svého dne. */
  sortAt: number;
  title: string;
  detail: string;
  actor: string;
  system: boolean;
  /** Na co se dá z události prokliknout. */
  serviceRecordId?: string;
  raceId?: string;
};

function dayStart(date: string) {
  const parsed = Date.parse(`${date}T00:00:00`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Datum a čas → ms. Bez času se událost řadí na začátek dne. */
function sortKey(date: string, time: string, fallback: number) {
  if (!date) return fallback;
  const base = dayStart(date);
  if (!base) return fallback;
  if (!/^\d{2}:\d{2}$/.test(time)) return base;
  const [hours, minutes] = time.split(":").map(Number);
  return base + hours * 3_600_000 + minutes * 60_000;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Akce z audit logu, které patří na osu jako systémové. Ostatní se zahazují. */
const SYSTEM_AUDIT_ACTIONS: Record<string, string> = {
  create: "Motor založen",
  update: "Karta motoru upravena",
  archive: "Motor archivován",
  set_engine_baseline: "Nastaven vstupní stav počítadel",
  // Nové změny jdou do engine_technical_value_changes; tohle jsou záznamy z doby předtím.
  update_technical: "Technické údaje uloženy (starý zápis)",
  engine_auto_service: "Automaticky přepnuto na Servis po závodě",
};

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const engineId = String(new URL(request.url).searchParams.get("engineId") ?? "").trim().slice(0, 80);
  if (!engineId) return Response.json({ error: "Engine id is required" }, { status: 400 });

  const engine = await d1.prepare("SELECT id, code, family FROM engines WHERE id = ?")
    .bind(engineId).first<{ id: string; code: string; family: string }>();
  if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });

  const [records, legacy, races, loans, queueManual, queueSkipped, technical, usage, audit, loanAudit] = await Promise.all([
    d1.prepare(`
      SELECT r.id, r.service_date AS serviceDate, r.service_time AS serviceTime, r.service_type_snapshot AS typeSnapshot,
             r.mechanic_name_snapshot AS mechanicName, r.note, r.counter_minutes AS counterMinutes,
             r.cancelled_at AS cancelledAt, r.cancelled_reason AS cancelledReason, r.cancelled_by AS cancelledBy,
             r.created_by AS createdBy, r.created_at AS createdAt,
             (SELECT GROUP_CONCAT(i.item_name_cs_snapshot, ', ') FROM service_record_items i WHERE i.service_record_id = r.id) AS items,
             (SELECT GROUP_CONCAT(json_extract(i.material_snapshot, '$.name'), ', ') FROM service_record_items i
              WHERE i.service_record_id = r.id AND i.material_snapshot IS NOT NULL) AS materials
      FROM service_records r WHERE r.engine_id = ?
    `).bind(engineId).all(),
    d1.prepare(`
      SELECT id, service_date AS serviceDate, service_type AS serviceType, replaced_parts_snapshot AS partsSnapshot,
             replaced_parts AS parts, piston_size AS pistonSize, notes, mechanic_name_snapshot AS mechanicName,
             created_by AS createdBy, created_at AS createdAt
      FROM engine_service_entries WHERE engine_id = ?
    `).bind(engineId).all(),
    d1.prepare(`
      SELECT r.id, r.name, r.track, r.start_date AS startDate, r.end_date AS endDate,
             e.category, e.driver_name_snapshot AS driverName
      FROM race_entries e JOIN races r ON r.id = e.race_id
      WHERE ? IN (e.engine_1_id, e.engine_2_id, e.engine_3_id) AND r.status != 'archived'
    `).bind(engineId).all(),
    d1.prepare(`
      SELECT id, recipient_name_snapshot AS recipient, start_date AS startDate,
             expected_return_date AS expectedReturn, actual_return_date AS actualReturn,
             notes, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
      FROM engine_loans WHERE engine_id = ?
    `).bind(engineId).all(),
    d1.prepare("SELECT id, note, created_by AS createdBy, created_at AS createdAt FROM engine_service_queue_manual WHERE engine_id = ?")
      .bind(engineId).all(),
    d1.prepare(`
      SELECT id, source_type AS sourceType, source_id AS sourceId, resolved_by AS resolvedBy, resolved_at AS resolvedAt
      FROM engine_service_queue_resolutions WHERE engine_id = ? AND resolution = 'skipped'
    `).bind(engineId).all(),
    d1.prepare(`
      SELECT id, field_label_cs AS fieldLabel, old_value AS oldValue, new_value AS newValue,
             source, service_record_id AS serviceRecordId, changed_by AS changedBy, changed_at AS changedAt
      FROM engine_technical_value_changes WHERE engine_id = ?
    `).bind(engineId).all(),
    d1.prepare(`
      SELECT id, entry_date AS entryDate, oppama_minutes AS oppamaMinutes, race_name AS raceName,
             notes, created_by AS createdBy, created_at AS createdAt
      FROM engine_usage_logs WHERE engine_id = ?
    `).bind(engineId).all(),
    d1.prepare(`
      SELECT id, actor_email AS actor, action, details, created_at AS createdAt
      FROM audit_logs WHERE entity_type = 'engine' AND entity_id = ? ORDER BY created_at DESC LIMIT 200
    `).bind(engineId).all(),
    // Zápůjčky se logují pod vlastní entitou, takže by se do historie motoru jinak nedostaly.
    // Bereme odsud jen `extend` — vznik a uzavření zápůjčky už je na ose z `engine_loans`
    // a s víc detaily (komu, do kdy, poznámka), takže by se jen zdvojilo.
    d1.prepare(`
      SELECT a.id, a.actor_email AS actor, a.action, a.details, a.created_at AS createdAt
      FROM audit_logs a JOIN engine_loans l ON l.id = a.entity_id
      WHERE a.entity_type = 'engine_loan' AND a.action = 'extend' AND l.engine_id = ?
      ORDER BY a.created_at DESC LIMIT 100
    `).bind(engineId).all(),
  ]);

  const events: TimelineEvent[] = [];

  for (const row of records.results as Array<Record<string, string | number | null>>) {
    const date = String(row.serviceDate ?? "");
    const time = String(row.serviceTime ?? "");
    const items = String(row.items ?? "");
    const materials = String(row.materials ?? "");
    events.push({
      id: `service-${row.id}`,
      kind: "service",
      date, time,
      sortAt: sortKey(date, time, Number(row.createdAt ?? 0)),
      title: String(row.typeSnapshot || "Servis"),
      detail: [items, materials && `materiál: ${materials}`, String(row.note ?? "")].filter(Boolean).join(" · "),
      actor: String(row.mechanicName || row.createdBy || ""),
      system: false,
      serviceRecordId: String(row.id),
    });
    if (row.cancelledAt) {
      events.push({
        id: `cancel-${row.id}`,
        kind: "service_cancelled",
        date: new Date(Number(row.cancelledAt)).toISOString().slice(0, 10),
        time: "",
        sortAt: Number(row.cancelledAt),
        title: "Servisní záznam stornován",
        detail: String(row.cancelledReason ?? ""),
        actor: String(row.cancelledBy ?? ""),
        system: false,
        serviceRecordId: String(row.id),
      });
    }
  }

  // Servisy z doby před novou kartou — historie nesmí začínat až přechodem na nový model.
  const legacyTypeLabels: Record<string, string> = {
    inspection: "Kontrola", piston_service: "Servis pístu", top_end: "Top end", full_service: "Kompletní servis",
  };
  for (const row of legacy.results as Array<Record<string, string | number | null>>) {
    const snapshot = parseJson<Array<{ labelCs: string }>>(String(row.partsSnapshot ?? "[]"), []);
    const parts = snapshot.length > 0
      ? snapshot.map((part) => part.labelCs).join(", ")
      : parseJson<string[]>(String(row.parts ?? "[]"), []).join(", ");
    const date = String(row.serviceDate ?? "");
    events.push({
      id: `legacy-${row.id}`,
      kind: "service_legacy",
      date, time: "",
      sortAt: sortKey(date, "", Number(row.createdAt ?? 0)),
      title: legacyTypeLabels[String(row.serviceType)] ?? String(row.serviceType ?? "Servis"),
      detail: [parts, row.pistonSize && `píst ${row.pistonSize}`, String(row.notes ?? "")].filter(Boolean).join(" · "),
      actor: String(row.mechanicName || row.createdBy || ""),
      system: false,
    });
  }

  for (const row of races.results as Array<Record<string, string | null>>) {
    const date = String(row.endDate ?? row.startDate ?? "");
    events.push({
      id: `race-${row.id}-${row.category}`,
      kind: "race",
      date, time: "",
      sortAt: sortKey(date, "", 0),
      title: String(row.name ?? ""),
      detail: [String(row.track ?? ""), String(row.category ?? ""), String(row.driverName ?? "")].filter(Boolean).join(" · "),
      actor: "",
      system: false,
      raceId: String(row.id),
    });
  }

  for (const row of loans.results as Array<Record<string, string | number | null>>) {
    events.push({
      id: `loan-${row.id}`,
      kind: "loan",
      date: String(row.startDate ?? ""), time: "",
      sortAt: sortKey(String(row.startDate ?? ""), "", Number(row.createdAt ?? 0)),
      title: `Zapůjčeno — ${row.recipient}`,
      detail: [`návrat očekáván ${row.expectedReturn}`, String(row.notes ?? "")].filter(Boolean).join(" · "),
      actor: String(row.createdBy ?? ""),
      system: false,
    });
    if (row.actualReturn) {
      events.push({
        id: `loan-return-${row.id}`,
        kind: "loan_returned",
        date: String(row.actualReturn), time: "",
        sortAt: sortKey(String(row.actualReturn), "", Number(row.updatedAt ?? 0)),
        title: `Vráceno ze zápůjčky — ${row.recipient}`,
        detail: "",
        actor: "",
        system: false,
      });
    }
  }

  for (const row of queueManual.results as Array<Record<string, string | number>>) {
    events.push({
      id: `queue-add-${row.id}`,
      kind: "queue_added",
      date: new Date(Number(row.createdAt)).toISOString().slice(0, 10), time: "",
      sortAt: Number(row.createdAt),
      title: "Ručně zařazeno do fronty na servis",
      detail: String(row.note ?? ""),
      actor: String(row.createdBy ?? ""),
      system: false,
    });
  }

  for (const row of queueSkipped.results as Array<Record<string, string | number>>) {
    events.push({
      id: `queue-skip-${row.id}`,
      kind: "queue_skipped",
      date: new Date(Number(row.resolvedAt)).toISOString().slice(0, 10), time: "",
      sortAt: Number(row.resolvedAt),
      title: "Odbaveno z fronty bez servisu",
      detail: "Nejel / bez servisu",
      actor: String(row.resolvedBy ?? ""),
      system: false,
    });
  }

  for (const row of technical.results as Array<Record<string, string | number | null>>) {
    events.push({
      id: `technical-${row.id}`,
      kind: "technical",
      date: new Date(Number(row.changedAt)).toISOString().slice(0, 10), time: "",
      sortAt: Number(row.changedAt),
      title: `${row.fieldLabel}: ${row.oldValue || "—"} → ${row.newValue || "—"}`,
      detail: row.source === "service" ? "Propsáno ze servisního záznamu" : "Ruční úprava technických údajů",
      actor: String(row.changedBy ?? ""),
      system: false,
      serviceRecordId: row.serviceRecordId ? String(row.serviceRecordId) : undefined,
    });
  }

  for (const row of usage.results as Array<Record<string, string | number | null>>) {
    const date = String(row.entryDate ?? "");
    const minutes = Number(row.oppamaMinutes ?? 0);
    events.push({
      id: `usage-${row.id}`,
      kind: "usage",
      date, time: "",
      sortAt: sortKey(date, "", Number(row.createdAt ?? 0)),
      title: `Motohodiny +${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
      detail: [String(row.raceName ?? ""), String(row.notes ?? "")].filter(Boolean).join(" · "),
      actor: String(row.createdBy ?? ""),
      system: false,
    });
  }

  for (const row of audit.results as Array<Record<string, string | number>>) {
    const title = SYSTEM_AUDIT_ACTIONS[String(row.action)];
    if (!title) continue;
    events.push({
      id: `audit-${row.id}`,
      kind: "system",
      date: new Date(Number(row.createdAt)).toISOString().slice(0, 10), time: "",
      sortAt: Number(row.createdAt),
      title,
      detail: "",
      actor: String(row.actor ?? ""),
      system: true,
    });
  }

  // Prodloužení zápůjčky je skutečná událost na motoru, ne systémový zásah do záznamu.
  for (const row of loanAudit.results as Array<Record<string, string | number>>) {
    const detail = parseJson<{ expectedReturnDate?: string }>(String(row.details ?? "{}"), {});
    events.push({
      id: `loan-audit-${row.id}`,
      kind: "loan",
      date: new Date(Number(row.createdAt)).toISOString().slice(0, 10), time: "",
      sortAt: Number(row.createdAt),
      title: "Zápůjčka prodloužena",
      detail: detail.expectedReturnDate ? `nový očekávaný návrat ${detail.expectedReturnDate}` : "",
      actor: String(row.actor ?? ""),
      system: false,
    });
  }

  events.sort((left, right) => right.sortAt - left.sortAt);
  return auth.json({ engine, events });
}
