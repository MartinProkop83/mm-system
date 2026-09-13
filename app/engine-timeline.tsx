"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";

type Locale = "cs" | "en";

type TimelineKind =
  | "service" | "service_legacy" | "service_cancelled"
  | "race" | "loan" | "loan_returned"
  | "queue_added" | "queue_skipped"
  | "technical" | "usage" | "system";

type TimelineEvent = {
  id: string;
  kind: TimelineKind;
  date: string;
  time: string;
  sortAt: number;
  title: string;
  detail: string;
  actor: string;
  system: boolean;
  serviceRecordId?: string;
  raceId?: string;
};

/** Skupiny filtru — jeden filtr může pokrývat víc druhů událostí. */
const FILTERS: Array<{ id: string; kinds: TimelineKind[] }> = [
  { id: "all", kinds: [] },
  { id: "service", kinds: ["service", "service_legacy", "service_cancelled"] },
  { id: "race", kinds: ["race"] },
  { id: "loan", kinds: ["loan", "loan_returned"] },
  { id: "queue", kinds: ["queue_added", "queue_skipped"] },
  { id: "technical", kinds: ["technical"] },
  { id: "usage", kinds: ["usage"] },
];

const content = {
  cs: {
    title: "Historie motoru",
    intro: "Všechno, co se s motorem dělo, od nejnovějšího.",
    loading: "Načítám historii…",
    loadError: "Historii se nepodařilo načíst.",
    retry: "Zkusit znovu",
    empty: "Zatím tu není žádná událost",
    emptyHelp: "Jakmile motor vyjede na závod, vrátí se ze zápůjčky nebo projde servisem, objeví se to tady.",
    emptyFiltered: "V tomto filtru nic není",
    showSystem: "Zobrazit i systémové události",
    systemHint: "Založení karty, přejmenování, archivace a podobné zásahy do záznamu.",
    filters: {
      all: "Vše", service: "Servis", race: "Závody", loan: "Zápůjčky",
      queue: "Fronta", technical: "Technické údaje", usage: "Motohodiny",
    } as Record<string, string>,
    kinds: {
      service: "Servis", service_legacy: "Servis", service_cancelled: "Storno",
      race: "Závod", loan: "Zápůjčka", loan_returned: "Návrat",
      queue_added: "Fronta", queue_skipped: "Fronta",
      technical: "Technické údaje", usage: "Motohodiny", system: "Systém",
    } as Record<TimelineKind, string>,
    fromService: "Ze servisu",
    manual: "Ručně",
    openRecord: "Otevřít servisní záznam",
    legacyNote: "Starý model",
  },
  en: {
    title: "Engine history",
    intro: "Everything that happened to the engine, newest first.",
    loading: "Loading history…",
    loadError: "The history could not be loaded.",
    retry: "Try again",
    empty: "No events yet",
    emptyHelp: "Once the engine races, comes back from a loan or gets serviced, it shows up here.",
    emptyFiltered: "Nothing in this filter",
    showSystem: "Also show system events",
    systemHint: "Card creation, renaming, archiving and similar changes to the record itself.",
    filters: {
      all: "All", service: "Service", race: "Races", loan: "Loans",
      queue: "Queue", technical: "Technical data", usage: "Running hours",
    } as Record<string, string>,
    kinds: {
      service: "Service", service_legacy: "Service", service_cancelled: "Cancelled",
      race: "Race", loan: "Loan", loan_returned: "Returned",
      queue_added: "Queue", queue_skipped: "Queue",
      technical: "Technical data", usage: "Running hours", system: "System",
    } as Record<TimelineKind, string>,
    fromService: "From service",
    manual: "Manual",
    openRecord: "Open the service record",
    legacyNote: "Legacy model",
  },
} as const;

function formatDate(value: string, locale: Locale) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return locale === "cs" ? `${Number(day)}. ${Number(month)}. ${year}` : `${day}/${month}/${year}`;
}

export function EngineTimeline({ engineId, locale, onOpenServiceRecord }: {
  engineId: string;
  locale: Locale;
  /** Proklik z události na servisní záznam, který ji způsobil. */
  onOpenServiceRecord?: (serviceRecordId: string) => void;
}) {
  const t = content[locale];
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showSystem, setShowSystem] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await fetch(`/api/engine-timeline?engineId=${encodeURIComponent(engineId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { events: TimelineEvent[] };
      setEvents(data.events);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [engineId]);

  useEffect(() => { void load(); }, [load]);

  // Systémové události jsou zásahy do záznamu, ne do motoru — drží se stranou, dokud je
  // někdo nechce vidět.
  const visible = useMemo(() => {
    const kinds = FILTERS.find((item) => item.id === filter)?.kinds ?? [];
    return events.filter((event) => {
      if (event.system && !showSystem) return false;
      return kinds.length === 0 || kinds.includes(event.kind);
    });
  }, [events, filter, showSystem]);

  const countByFilter = useMemo(() => {
    const pool = events.filter((event) => showSystem || !event.system);
    return new Map(FILTERS.map((item) => [
      item.id,
      item.kinds.length === 0 ? pool.length : pool.filter((event) => item.kinds.includes(event.kind)).length,
    ]));
  }, [events, showSystem]);

  if (loading) return <section className="dash-panel tab-panel"><LoadingState size="inline" label={t.loading} /></section>;
  if (loadError) {
    return (
      <section className="dash-panel tab-panel">
        <EmptyState variant="error" size="inline" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }

  return (
    <section className="dash-panel tab-panel">
      <div className="tab-panel-header">
        <div><span className="eyebrow">TIMELINE</span><h2>{t.title}</h2><p>{t.intro}</p></div>
      </div>

      {events.length === 0 ? (
        <EmptyState size="inline" title={t.empty} description={t.emptyHelp} />
      ) : (
        <>
          <div className="timeline-controls">
            <div className="timeline-filters" role="group" aria-label={t.title}>
              {FILTERS.filter((item) => item.id === "all" || (countByFilter.get(item.id) ?? 0) > 0).map((item) => (
                <button key={item.id} type="button" className={filter === item.id ? "active" : ""}
                  aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                  {t.filters[item.id]}<small>{countByFilter.get(item.id) ?? 0}</small>
                </button>
              ))}
            </div>
            <label className="timeline-system-toggle" title={t.systemHint}>
              <input type="checkbox" checked={showSystem} onChange={(event) => setShowSystem(event.target.checked)} />
              {t.showSystem}
            </label>
          </div>

          {visible.length === 0 ? (
            <EmptyState size="inline" variant="filtered" title={t.emptyFiltered} />
          ) : (
            <ol className="timeline">
              {visible.map((event) => {
                const fromService = event.kind === "technical" && Boolean(event.serviceRecordId);
                return (
                  <li key={event.id} className={`timeline-item kind-${event.kind}`}>
                    <div className="timeline-marker" aria-hidden="true" />
                    <div className="timeline-body">
                      <div className="timeline-meta">
                        <time>{formatDate(event.date, locale)}{event.time && ` ${event.time}`}</time>
                        <span className="timeline-kind">{t.kinds[event.kind]}</span>
                        {event.kind === "service_legacy" && <span className="timeline-tag">{t.legacyNote}</span>}
                        {/* Změna technických údajů: ruční zásah vs. propsání ze servisu. */}
                        {event.kind === "technical" && (
                          <span className={`timeline-tag ${fromService ? "from-service" : "manual"}`}>
                            {fromService ? t.fromService : t.manual}
                          </span>
                        )}
                        {event.actor && <span className="timeline-actor">{event.actor}</span>}
                      </div>
                      <strong className="timeline-title">{event.title}</strong>
                      {event.detail && <span className="timeline-detail">{event.detail}</span>}
                      {fromService && onOpenServiceRecord && (
                        <button className="timeline-link" type="button"
                          onClick={() => onOpenServiceRecord(event.serviceRecordId as string)}>
                          {t.openRecord} →
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
