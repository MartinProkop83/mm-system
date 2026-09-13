"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { formatCount, type PluralForms } from "./pluralize";

type Locale = "cs" | "en";

type HistoryRecord = {
  source: "new" | "legacy";
  id: string;
  engineId: string;
  engineCode: string;
  family: string;
  serviceDate: string;
  serviceTime: string;
  typeCs: string;
  typeEn: string;
  mechanicName: string;
  note: string;
  cancelled: boolean;
  cancelledReason: string;
  items: Array<{ nameCs: string; nameEn: string; material: string }>;
};

type Summary = {
  waiting: number;
  serviced: number;
  skipped: number;
  remaining: number;
  /** Zapsané servisy — z obou tabulek záznamů, nezávisle na frontě. */
  recorded: number;
  byCategory: Array<{ family: string; waiting: number; serviced: number; skipped: number; remaining: number; recorded: number }>;
  byMechanic: Array<{ name: string; records: number; engines: number }>;
};

type Payload = {
  records: HistoryRecord[];
  summary: Summary;
  engines: Array<{ id: string; code: string; family: string }>;
  mechanics: Array<{ id: string; name: string }>;
  categories: Array<{ code: string }>;
};

type Period = "today" | "week" | "month" | "custom";

/** „1 záznam / 2 záznamy / 5 záznamů" — čeština potřebuje tři tvary. */
const RECORD_FORMS: PluralForms = { cs: ["záznam", "záznamy", "záznamů"], en: ["record", "records"] };

const content = {
  cs: {
    eyebrow: "SERVIS",
    title: "Servisní historie",
    intro: "Co se v dílně udělalo — napříč všemi motory, od nejnovějšího.",
    loading: "Načítám servisní historii…",
    loadError: "Servisní historii se nepodařilo načíst.",
    retry: "Zkusit znovu",
    empty: "V tomhle období není žádný servis",
    emptyHelp: "Zkus jiné období nebo zruš filtry.",
    period: "Období",
    today: "Dnes",
    week: "Tento týden",
    month: "Tento měsíc",
    custom: "Vlastní rozsah",
    from: "Od",
    to: "Do",
    category: "Kategorie",
    engine: "Motor",
    mechanic: "Mechanik",
    all: "Vše",
    allEngines: "Všechny motory",
    allMechanics: "Všichni mechanici",
    reportTitle: "Souhrn za období",
    waiting: "Čekalo na servis",
    serviced: "Odbaveno servisem",
    skipped: "Nejel / bez servisu",
    remaining: "Zbývá ve frontě",
    recorded: "Zapsaných servisů",
    byCategory: "Podle kategorie",
    byMechanic: "Kdo kolik udělal",
    noMechanics: "V tomhle období nikdo nezapsal servis.",
    reportNote: "První čtyři čísla jsou o frontě a počítají se podle data, kdy z ní motor odešel. „Zapsaných servisů“ je nezávislé: bere všechny záznamy podle data servisu, i u motoru, který frontou vůbec neprošel. Proto se obě čísla lišit můžou. Rozpad po mechanicích jde ze zapsaných servisů; stornované se nepočítají.",
    colDate: "Datum",
    colCategory: "Kategorie",
    colEngine: "Motor",
    colType: "Typ servisu",
    colMechanic: "Mechanik",
    colItems: "Co se dělalo",
    colNote: "Poznámka",
    legacy: "Stará karta",
    cancelled: "Storno",
    records: (count: number) => formatCount(count, "cs", RECORD_FORMS),
  },
  en: {
    eyebrow: "SERVICE",
    title: "Service history",
    intro: "What the workshop did — across all engines, newest first.",
    loading: "Loading service history…",
    loadError: "The service history could not be loaded.",
    retry: "Try again",
    empty: "No service in this period",
    emptyHelp: "Try another period or clear the filters.",
    period: "Period",
    today: "Today",
    week: "This week",
    month: "This month",
    custom: "Custom range",
    from: "From",
    to: "To",
    category: "Category",
    engine: "Engine",
    mechanic: "Mechanic",
    all: "All",
    allEngines: "All engines",
    allMechanics: "All mechanics",
    reportTitle: "Period summary",
    waiting: "Waited for service",
    serviced: "Cleared by service",
    skipped: "Didn't run / no service",
    remaining: "Still in the queue",
    recorded: "Services recorded",
    byCategory: "By category",
    byMechanic: "Who did how much",
    noMechanics: "Nobody recorded a service in this period.",
    reportNote: "The first four numbers are about the queue and count by the date the engine left it. “Services recorded” is independent: every record by its service date, including engines that never went through the queue. The two can differ. The mechanic breakdown comes from recorded services; cancelled ones are not counted.",
    colDate: "Date",
    colCategory: "Category",
    colEngine: "Engine",
    colType: "Service type",
    colMechanic: "Mechanic",
    colItems: "What was done",
    colNote: "Note",
    legacy: "Legacy card",
    cancelled: "Cancelled",
    records: (count: number) => formatCount(count, "en", RECORD_FORMS),
  },
} as const;

function isoDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Hranice období. Pondělí jako první den týdne — dílna jede na české pracovní týdny. */
function periodRange(period: Period, customFrom: string, customTo: string) {
  const now = new Date();
  if (period === "today") return { from: isoDate(now), to: isoDate(now) };
  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: isoDate(start), to: isoDate(now) };
  }
  if (period === "month") {
    return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) };
  }
  return { from: customFrom, to: customTo };
}

function formatDate(value: string, locale: Locale) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return locale === "cs" ? `${Number(day)}. ${Number(month)}. ${year}` : `${day}/${month}/${year}`;
}

export function ServiceHistoryPage({ locale }: { locale: Locale }) {
  const t = content[locale];
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState(isoDate(new Date()));
  const [customTo, setCustomTo] = useState(isoDate(new Date()));
  const [family, setFamily] = useState("");
  const [engineId, setEngineId] = useState("");
  const [mechanicId, setMechanicId] = useState("");

  const range = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      // Hranice v epoch ms počítá klient — zná časové pásmo dílny, server ne.
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
        fromMs: String(new Date(`${range.from}T00:00:00`).getTime()),
        toMs: String(new Date(`${range.to}T23:59:59.999`).getTime()),
      });
      if (family) params.set("family", family);
      if (engineId) params.set("engineId", engineId);
      if (mechanicId) params.set("mechanicId", mechanicId);
      const response = await fetch(`/api/service-history?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      setData((await response.json()) as Payload);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, family, engineId, mechanicId]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return <section className="dash-panel"><LoadingState label={t.loading} /></section>;
  if (loadError && !data) {
    return (
      <section className="dash-panel">
        <EmptyState variant="error" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }
  if (!data) return null;

  const engineOptions = family ? data.engines.filter((engine) => engine.family === family) : data.engines;

  return (
    <section className="service-history">
      <article className="dash-panel queue-hero">
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h2>{t.title}</h2>
          <p>{t.intro}</p>
        </div>
        <div className="queue-total" aria-live="polite">
          <strong>{data.records.length}</strong>
          <small>{t.records(data.records.length)}</small>
        </div>
      </article>

      <div className="history-filters">
        <div className="history-filter-group" role="group" aria-label={t.period}>
          <span>{t.period}</span>
          <div className="timeline-filters">
            {(["today", "week", "month", "custom"] as Period[]).map((choice) => (
              <button key={choice} type="button" className={period === choice ? "active" : ""}
                aria-pressed={period === choice} onClick={() => setPeriod(choice)}>{t[choice]}</button>
            ))}
          </div>
        </div>
        {period === "custom" && (
          <div className="history-filter-group">
            <label><span>{t.from}</span>
              <input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} />
            </label>
            <label><span>{t.to}</span>
              <input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)} />
            </label>
          </div>
        )}
        <div className="history-filter-group">
          <label><span>{t.category}</span>
            <select value={family} onChange={(event) => { setFamily(event.target.value); setEngineId(""); }}>
              <option value="">{t.all}</option>
              {data.categories.map((category) => <option key={category.code} value={category.code}>{category.code}</option>)}
            </select>
          </label>
          <label><span>{t.engine}</span>
            <select value={engineId} onChange={(event) => setEngineId(event.target.value)}>
              <option value="">{t.allEngines}</option>
              {engineOptions.map((engine) => <option key={engine.id} value={engine.id}>{engine.code} · {engine.family}</option>)}
            </select>
          </label>
          <label><span>{t.mechanic}</span>
            <select value={mechanicId} onChange={(event) => setMechanicId(event.target.value)}>
              <option value="">{t.allMechanics}</option>
              {data.mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Denní report. Počty jdou z fronty podle data odbavení, ne z data servisu — zápis
          zpětně za včerejšek se tak nepřičte ke dnešku. */}
      <article className="dash-panel history-report">
        <div className="tab-panel-header">
          <div><span className="eyebrow">REPORT</span><h3>{t.reportTitle}</h3><p>{formatDate(range.from, locale)} – {formatDate(range.to, locale)}</p></div>
        </div>
        <div className="history-report-tiles">
          <div><strong>{data.summary.waiting}</strong><small>{t.waiting}</small></div>
          <div className="tone-done"><strong>{data.summary.serviced}</strong><small>{t.serviced}</small></div>
          <div className="tone-skip"><strong>{data.summary.skipped}</strong><small>{t.skipped}</small></div>
          <div className="tone-left"><strong>{data.summary.remaining}</strong><small>{t.remaining}</small></div>
          {/* Stojí zvlášť: nepočítá se z fronty, ale ze zapsaných záznamů. */}
          <div className="tone-recorded"><strong>{data.summary.recorded}</strong><small>{t.recorded}</small></div>
        </div>
        <div className="history-report-split">
          <div>
            <h4>{t.byCategory}</h4>
            <div className="table-wrap">
              <table className="engine-table zebra">
                <thead><tr><th>{t.category}</th><th>{t.waiting}</th><th>{t.serviced}</th><th>{t.skipped}</th><th>{t.remaining}</th><th>{t.recorded}</th></tr></thead>
                <tbody>
                  {data.summary.byCategory.map((row) => (
                    <tr key={row.family}>
                      <td><strong>{row.family}</strong></td>
                      <td>{row.waiting}</td><td>{row.serviced}</td><td>{row.skipped}</td><td>{row.remaining}</td>
                      <td><strong>{row.recorded}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h4>{t.byMechanic}</h4>
            {data.summary.byMechanic.length === 0 ? (
              <p className="form-hint">{t.noMechanics}</p>
            ) : (
              <div className="table-wrap">
                <table className="engine-table zebra">
                  <thead><tr><th>{t.mechanic}</th><th>{t.recorded}</th></tr></thead>
                  <tbody>
                    {data.summary.byMechanic.map((row) => (
                      <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.records}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <p className="form-hint">{t.reportNote}</p>
      </article>

      <article className="dash-panel">
        {data.records.length === 0 ? (
          <EmptyState size="inline" variant="filtered" title={t.empty} description={t.emptyHelp} />
        ) : (
          <div className="table-wrap">
            <table className="engine-table zebra">
              <thead>
                <tr>
                  <th>{t.colDate}</th><th>{t.colCategory}</th><th>{t.colEngine}</th><th>{t.colType}</th>
                  <th>{t.colMechanic}</th><th>{t.colItems}</th><th>{t.colNote}</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((record) => (
                  <tr key={`${record.source}|${record.id}`} className={record.cancelled ? "is-cancelled" : ""}>
                    <td><strong>{formatDate(record.serviceDate, locale)}</strong>{record.serviceTime && <small>{record.serviceTime}</small>}</td>
                    <td>{record.family}</td>
                    <td><span className="equipment-code">{record.engineCode}</span></td>
                    <td>
                      {(locale === "cs" ? record.typeCs : record.typeEn) || "—"}
                      {record.source === "legacy" && <small>{t.legacy}</small>}
                      {record.cancelled && <span className="status-pill danger">{t.cancelled}</span>}
                    </td>
                    <td>{record.mechanicName || "—"}</td>
                    <td>
                      {record.items.length === 0 ? "—" : (
                        <span className="history-items">
                          {record.items.map((item, index) => (
                            <b key={`${item.nameCs}-${index}`}>
                              {locale === "cs" ? item.nameCs : item.nameEn}
                              {item.material && <i>{item.material}</i>}
                            </b>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>{record.cancelled && record.cancelledReason ? record.cancelledReason : record.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
