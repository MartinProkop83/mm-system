"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";
import { formatCount, type PluralForms } from "./pluralize";

type Locale = "cs" | "en";

type QueueItem = {
  engineId: string;
  engineCode: string;
  family: string;
  sourceType: "race" | "loan" | "manual";
  sourceId: string;
  sourceLabel: string;
  returnDate: string;
  returnedAt: number;
  nextRaceDate: string | null;
  nextRaceName: string | null;
  note: string;
  addedBy: string;
};

type QueueCategory = { code: string; nameCs: string; nameEn: string; sortOrder: number };
type QueueEngine = { id: string; code: string; family: string };

/** Kolik dlaždic vedle sebe. Ukládá se do localStorage — nástěnka na zdi chce jinou hodnotu
 *  než mobil a nesmí si to navzájem přepisovat, proto zařízení, ne uživatelský účet. */
const DENSITY_KEY = "mm-service-queue-density";
const DENSITY_CHOICES = [1, 2, 3, 4, 5, 6] as const;
/** Kolik dlaždic se na dané šířce ještě vejde čitelně — vyšší volby se zašednou. */
const MIN_WIDTH_PER_TILE = 230;

function defaultDensity(width: number) {
  if (width >= 1600) return 6;
  if (width >= 1200) return 4;
  if (width >= 900) return 3;
  if (width >= 600) return 2;
  return 1;
}

/** Nástěnka na zdi nesmí ukazovat stav z doby, kdy ji někdo naposled otevřel. */
const REFRESH_MS = 60_000;

/** „1 motor / 2 motory / 5 motorů" — čeština potřebuje tři tvary. */
const ENGINE_FORMS: PluralForms = { cs: ["motor", "motory", "motorů"], en: ["engine", "engines"] };

const content = {
  cs: {
    eyebrow: "SERVIS",
    title: "Fronta na servis",
    intro: "Motory, které se vrátily ze závodu nebo ze zápůjčky a čekají na vyřízení.",
    waiting: "čeká na servis",
    loading: "Načítám frontu…",
    loadError: "Frontu se nepodařilo načíst.",
    retry: "Zkusit znovu",
    empty: "Fronta je prázdná",
    emptyHelp: "Až skončí závod nebo se vrátí zapůjčený motor, objeví se tady sám.",
    emptyFiltered: "V této kategorii nic nečeká",
    all: "Všechny",
    fromLoan: "Zápůjčka",
    returned: "Návrat",
    nextRace: "Další závod",
    density: "Motorů na řádek",
    densityHint: (max: number) => `Na téhle obrazovce se vejde nejvýš ${max}.`,
    addEngine: "Přidat motor do fronty",
    fullscreen: "Celá obrazovka",
    addTitle: "Přidat motor do fronty",
    addIntro: "Pro motor, který se nevrátil ze závodu ani ze zápůjčky — třeba když se na něm něco nezdá.",
    addEngineLabel: "Motor",
    addEngineSelect: "Vyber motor",
    addNoteLabel: "Proč jde do fronty",
    addNoteHint: "Povinné. Zobrazí se na dlaždici, ať mechanik ví, co hledat.",
    addNotePlaceholder: "Například: divný zvuk, kontrola po pádu…",
    addConfirm: "Přidat do fronty",
    adding: "Přidávám…",
    addNoteMissing: "Napiš, proč motor jde do fronty.",
    addEngineMissing: "Vyber motor.",
    manual: "Ručně zařazeno",
    addedBy: "Přidal",
    select: "Označit k odbavení",
    selected: (count: number) => `Označeno: ${count}`,
    selectAll: "Označit vše",
    clearSelection: "Zrušit výběr",
    skip: "Nejel / bez servisu",
    skipSelected: (count: number) => `Nejel / bez servisu (${count})`,
    skipping: "Odbavuji…",
    skipTitle: "Odbavit bez servisního záznamu?",
    skipOne: (code: string) => `Motor ${code} zmizí z fronty bez servisního záznamu.`,
    skipMany: (count: number) => `${formatCount(count, "cs", ENGINE_FORMS)} zmizí z fronty bez servisního záznamu.`,
    skipNote: "Uloží se, kdo a kdy to odklikl. Servisní záznam tím nevznikne.",
    skipConfirm: "Odbavit",
    cancel: "Zrušit",
    openCard: "Otevřít servisní kartu",
    refreshedAt: (time: string) => `Obnoveno ${time}`,
    genericError: "Odbavení se nepodařilo uložit.",
  },
  en: {
    eyebrow: "SERVICE",
    title: "Service queue",
    intro: "Engines back from a race or a loan, waiting to be dealt with.",
    waiting: "waiting for service",
    loading: "Loading the queue…",
    loadError: "The queue could not be loaded.",
    retry: "Try again",
    empty: "The queue is empty",
    emptyHelp: "Once a race ends or a lent engine comes back, it shows up here on its own.",
    emptyFiltered: "Nothing waiting in this category",
    all: "All",
    fromLoan: "Loan",
    returned: "Back",
    nextRace: "Next race",
    density: "Engines per row",
    densityHint: (max: number) => `This screen fits ${max} at most.`,
    addEngine: "Add engine to the queue",
    fullscreen: "Full screen",
    addTitle: "Add engine to the queue",
    addIntro: "For an engine that came back from neither a race nor a loan — for example when something about it seems off.",
    addEngineLabel: "Engine",
    addEngineSelect: "Pick an engine",
    addNoteLabel: "Why it goes in",
    addNoteHint: "Required. Shown on the tile so the mechanic knows what to look for.",
    addNotePlaceholder: "For example: odd noise, check after a crash…",
    addConfirm: "Add to queue",
    adding: "Adding…",
    addNoteMissing: "Write why the engine goes into the queue.",
    addEngineMissing: "Pick an engine.",
    manual: "Added manually",
    addedBy: "Added by",
    select: "Select for bulk action",
    selected: (count: number) => `Selected: ${count}`,
    selectAll: "Select all",
    clearSelection: "Clear selection",
    skip: "Didn't run / no service",
    skipSelected: (count: number) => `Didn't run / no service (${count})`,
    skipping: "Clearing…",
    skipTitle: "Clear without a service record?",
    skipOne: (code: string) => `Engine ${code} leaves the queue without a service record.`,
    skipMany: (count: number) => `${formatCount(count, "en", ENGINE_FORMS)} leave the queue without a service record.`,
    skipNote: "Who cleared it and when is recorded. No service record is created.",
    skipConfirm: "Clear",
    cancel: "Cancel",
    openCard: "Open the service card",
    refreshedAt: (time: string) => `Refreshed at ${time}`,
    genericError: "The action could not be saved.",
  },
} as const;

type Copy = (typeof content)[Locale];

const API = "/api/service-queue";

/** OKN-J sdílí barevný tón s OKN, stejně jako všude jinde v aplikaci. */
function familyTone(family: string) {
  return (family === "OKN-J" ? "OKN" : family).toLowerCase();
}

function formatDate(value: string, locale: Locale) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return locale === "cs" ? `${Number(day)}. ${Number(month)}. ${year}` : `${day}/${month}/${year}`;
}

/** Klíč položky — motor může ve frontě čekat víckrát, jednou za každý pobyt mimo dílnu. */
function itemKey(item: Pick<QueueItem, "engineId" | "sourceType" | "sourceId">) {
  return `${item.engineId}|${item.sourceType}|${item.sourceId}`;
}

export function ServiceQueuePage({ locale, onOpenEngineService, fullscreenHref }: {
  locale: Locale;
  /** Otevře servisní kartu motoru rovnou ve formuláři zápisu. */
  onOpenEngineService: (engineId: string) => void;
  /** Odkaz do režimu bez menu. Uvnitř samotného režimu se nepředává. */
  fullscreenHref?: string;
}) {
  const t = content[locale];
  const [items, setItems] = useState<QueueItem[]>([]);
  const [categories, setCategories] = useState<QueueCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<QueueItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [engines, setEngines] = useState<QueueEngine[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  // null = uživatel si ještě nevybral, drží se odhad podle šířky
  const [density, setDensity] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1440);

  const load = useCallback(async () => {
    try {
      const response = await fetch(API, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { items: QueueItem[]; categories: QueueCategory[]; engines: QueueEngine[] };
      setItems(data.items);
      setCategories(data.categories);
      setEngines(data.engines ?? []);
      // Výběr nesmí přežít zmizení položky z fronty (jiný mechanik ji mezitím odbavil).
      setSelected((current) => current.filter((key) => data.items.some((item) => itemKey(item) === key)));
      setLoadError(false);
      setRefreshedAt(new Date());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Volba hustoty se čte ze zařízení, ne z účtu — nástěnka na zdi a mobil se nesmí přebíjet.
  useEffect(() => {
    function syncWidth() { setViewportWidth(window.innerWidth); }
    syncWidth();
    window.addEventListener("resize", syncWidth);
    try {
      const stored = Number(window.localStorage.getItem(DENSITY_KEY));
      if (DENSITY_CHOICES.includes(stored as typeof DENSITY_CHOICES[number])) setDensity(stored);
    } catch {
      // Soukromé okno nebo zakázané úložiště — zůstane odhad podle šířky.
    }
    return () => window.removeEventListener("resize", syncWidth);
  }, []);

  function pickDensity(value: number) {
    setDensity(value);
    try {
      window.localStorage.setItem(DENSITY_KEY, String(value));
    } catch {
      // Neuložení volby není důvod ji neaplikovat na tuhle relaci.
    }
  }

  // Automatické obnovení — nástěnka na zdi nikdo neobnovuje ručně.
  useEffect(() => {
    const timer = setInterval(() => { void load(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  /**
   * Řazení ve sloupci: nejdřív motory s blížícím se závodem (podle jeho data), pak ostatní
   * podle data návratu, nejstarší nahoře.
   */
  const sorted = useMemo(() => {
    return items.slice().sort((left, right) => {
      if (Boolean(left.nextRaceDate) !== Boolean(right.nextRaceDate)) return left.nextRaceDate ? -1 : 1;
      if (left.nextRaceDate && right.nextRaceDate && left.nextRaceDate !== right.nextRaceDate) {
        return left.nextRaceDate < right.nextRaceDate ? -1 : 1;
      }
      if (left.returnDate !== right.returnDate) return left.returnDate < right.returnDate ? -1 : 1;
      return left.engineCode.localeCompare(right.engineCode);
    });
  }, [items]);

  // Šest dlaždic vedle sebe na mobilu nedává smysl — vyšší volby se zašednou.
  const maxDensity = Math.max(1, Math.min(DENSITY_CHOICES.length, Math.floor(viewportWidth / MIN_WIDTH_PER_TILE)));
  const effectiveDensity = Math.min(density ?? defaultDensity(viewportWidth), maxDensity);

  const countByFamily = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.family, (counts.get(item.family) ?? 0) + 1);
    return counts;
  }, [items]);

  // Kategorie bez jediného motoru se vynechává úplně; zobrazená kategorie smí mít nulu
  // (například když ji filtr vyprázdní).
  const visibleCategories = categories.filter((category) => (countByFamily.get(category.code) ?? 0) > 0);
  // Odbavení poslední položky kategorie tu kategorii z nabídky odstraní — filtr by na ní
  // jinak uvázl a stránka by vypadala prázdná, i když fronta prázdná není.
  useEffect(() => {
    if (filter !== "ALL" && !visibleCategories.some((category) => category.code === filter)) setFilter("ALL");
  }, [filter, visibleCategories]);
  const shownCategories = filter === "ALL" ? visibleCategories : visibleCategories.filter((category) => category.code === filter);
  const visibleItems = filter === "ALL" ? sorted : sorted.filter((item) => item.family === filter);

  function toggle(item: QueueItem) {
    const key = itemKey(item);
    setSelected((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  }

  async function skip(targets: QueueItem[]) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: targets.map((item) => ({ engineId: item.engineId, sourceType: item.sourceType, sourceId: item.sourceId })) }),
      });
      if (!response.ok) throw new Error("skip failed");
      setSelected([]);
      setConfirming(null);
      await load();
    } catch {
      setError(t.genericError);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="dash-panel"><LoadingState label={t.loading} /></section>;
  if (loadError) {
    return (
      <section className="dash-panel">
        <EmptyState variant="error" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }

  const selectedItems = visibleItems.filter((item) => selected.includes(itemKey(item)));

  return (
    <section className="service-queue">
      <article className="dash-panel queue-hero">
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h2>{t.title}</h2>
          <p>{t.intro}</p>
        </div>
        <div className="queue-hero-side">
          {fullscreenHref && <Link className="secondary-compact queue-add-button" href={fullscreenHref}>⛶ {t.fullscreen}</Link>}
          <button className="primary-button queue-add-button" type="button" onClick={() => setAddOpen(true)}>＋ {t.addEngine}</button>
          <div className="queue-total" aria-live="polite">
            <strong>{items.length}</strong>
            <small>{t.waiting}</small>
          </div>
        </div>
      </article>

      {/* Kolik dlaždic vedle sebe. Volba se drží na zařízení, ne u účtu. */}
      <div className="queue-density" role="group" aria-label={t.density}>
        <span>{t.density}</span>
        <div className="queue-density-choices">
          {DENSITY_CHOICES.map((choice) => (
            <button key={choice} type="button" disabled={choice > maxDensity}
              className={choice === effectiveDensity ? "active" : ""}
              aria-pressed={choice === effectiveDensity}
              title={choice > maxDensity ? t.densityHint(maxDensity) : undefined}
              onClick={() => pickDensity(choice)}>{choice}</button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <section className="dash-panel"><EmptyState icon="✓" title={t.empty} description={t.emptyHelp} /></section>
      ) : (
        <>
          <div className="carb-unit-filters" aria-label={t.title}>
            <div className="carb-unit-category-tiles">
              <button type="button" className={`carb-unit-tile tone-total${filter === "ALL" ? " active" : ""}`}
                aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")}>
                {t.all}<small>{items.length}</small>
              </button>
              {visibleCategories.map((category) => (
                <button key={category.code} type="button"
                  className={`carb-unit-tile tone-${familyTone(category.code)}${filter === category.code ? " active" : ""}`}
                  aria-pressed={filter === category.code} onClick={() => setFilter(category.code)}>
                  {category.code}<small>{countByFamily.get(category.code) ?? 0}</small>
                </button>
              ))}
            </div>
          </div>

          {/* Hromadné odbavení — po závodě se třemi sloty na motor jich tu čeká spousta,
              co vůbec nejely, a odklikávat je po jednom nedává smysl. */}
          <div className="queue-bulk">
            <div className="queue-bulk-info">
              {selected.length > 0 && <strong aria-live="polite">{t.selected(selected.length)}</strong>}
              {refreshedAt && <small>{t.refreshedAt(refreshedAt.toLocaleTimeString(locale === "cs" ? "cs-CZ" : "en-GB", { hour: "2-digit", minute: "2-digit" }))}</small>}
            </div>
            <div className="queue-bulk-actions">
              {selected.length > 0 && (
                <button className="secondary-compact" type="button" onClick={() => setSelected([])}>{t.clearSelection}</button>
              )}
              {visibleItems.length > 0 && selected.length < visibleItems.length && (
                <button className="secondary-compact" type="button" onClick={() => setSelected(visibleItems.map(itemKey))}>{t.selectAll}</button>
              )}
              <button className="danger-compact" type="button" disabled={selected.length === 0 || busy}
                onClick={() => setConfirming(selectedItems)}>
                {busy ? t.skipping : t.skipSelected(selected.length)}
              </button>
            </div>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          {shownCategories.length === 0 ? (
            <section className="dash-panel"><EmptyState size="inline" variant="filtered" title={t.emptyFiltered} /></section>
          ) : (
            // Zvolená hustota je počet dlaždic na řádek celkem. Když je kategorií míň než
            // dlaždic, zbytek by zůstal prázdný — proto se dlaždice uvnitř sloupce rozloží
            // do mřížky, aby šířku využily.
            <div className="queue-board" style={{
              "--queue-columns": Math.min(effectiveDensity, shownCategories.length),
              "--queue-tiles-per-column": Math.max(1, Math.floor(effectiveDensity / Math.max(1, shownCategories.length))),
            } as React.CSSProperties}>
              {shownCategories.map((category) => {
                const columnItems = visibleItems.filter((item) => item.family === category.code);
                return (
                  <section key={category.code} className={`queue-column tone-${familyTone(category.code)}`}>
                    <header>
                      <h3>{category.code}</h3>
                      <span className="queue-column-count" aria-live="polite">{columnItems.length}</span>
                    </header>
                    <div className="queue-column-items">
                      {columnItems.map((item) => {
                        const key = itemKey(item);
                        const isSelected = selected.includes(key);
                        return (
                          <article key={key} className={`queue-card${item.nextRaceDate ? " has-next-race" : ""}${item.sourceType === "manual" ? " is-manual" : ""}${isSelected ? " selected" : ""}`}>
                            <label className="queue-card-select" title={t.select}>
                              <input type="checkbox" checked={isSelected} onChange={() => toggle(item)} aria-label={`${t.select} — ${item.engineCode}`} />
                              <span aria-hidden="true">✓</span>
                            </label>
                            <button className="queue-card-open" type="button" onClick={() => onOpenEngineService(item.engineId)}
                              aria-label={`${t.openCard} — ${item.engineCode}`}>
                              <strong className="queue-card-code">{item.engineCode}</strong>
                              <span className="queue-card-family">{item.family}</span>
                              <span className="queue-card-source">
                                {item.sourceType === "manual" ? t.manual : item.sourceType === "loan" ? t.fromLoan : item.sourceLabel}
                              </span>
                              <span className="queue-card-date">{t.returned}: {formatDate(item.returnDate, locale)}</span>
                              {item.sourceType === "manual" && item.note && (
                                <span className="queue-card-note" title={`${t.addedBy}: ${item.addedBy}`}>{item.note}</span>
                              )}
                              {item.nextRaceDate && (
                                <span className="queue-card-next">⚑ {t.nextRace}: {formatDate(item.nextRaceDate, locale)}</span>
                              )}
                            </button>
                            <button className="queue-card-skip" type="button" disabled={busy} onClick={() => setConfirming([item])}>
                              {t.skip}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {addOpen && (
        <AddEngineModal t={t} engines={engines} busy={busy}
          onClose={() => setAddOpen(false)}
          onSubmit={async (engineId, note) => {
            setBusy(true);
            setError("");
            try {
              const response = await fetch(API, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ addEngineId: engineId, addNote: note }),
              });
              if (!response.ok) throw new Error("add failed");
              setAddOpen(false);
              await load();
            } catch {
              setError(t.genericError);
            } finally {
              setBusy(false);
            }
          }} />
      )}

      {confirming && confirming.length > 0 && (
        <SkipConfirmModal t={t} items={confirming} busy={busy}
          onClose={() => setConfirming(null)} onConfirm={() => void skip(confirming)} />
      )}
    </section>
  );
}

function SkipConfirmModal({ t, items, busy, onClose, onConfirm }: {
  t: Copy; items: QueueItem[]; busy: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const dialogRef = useModalA11y(onClose);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="queue-skip-title" tabIndex={-1}>
        <header className="modal-header">
          <div>
            <span className="eyebrow">{t.eyebrow}</span>
            <h2 id="queue-skip-title">{t.skipTitle}</h2>
            <p>{items.length === 1 ? t.skipOne(items[0].engineCode) : t.skipMany(items.length)}</p>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        {items.length > 1 && (
          <fieldset className="parts-fieldset sc-chips-field">
            <legend>{t.selected(items.length)}</legend>
            <span className="sc-chip-list">{items.map((item) => <b key={itemKey(item)}>{item.engineCode}</b>)}</span>
          </fieldset>
        )}
        <p className="form-hint">{t.skipNote}</p>
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="danger-compact" type="button" disabled={busy} onClick={onConfirm}>{busy ? t.skipping : t.skipConfirm}</button>
        </footer>
      </section>
    </div>
  );
}

/** Ruční zařazení motoru do fronty — s povinnou poznámkou, proč tam jde. */
function AddEngineModal({ t, engines, busy, onClose, onSubmit }: {
  t: Copy; engines: QueueEngine[]; busy: boolean;
  onClose: () => void;
  onSubmit: (engineId: string, note: string) => Promise<void>;
}) {
  const dialogRef = useModalA11y(onClose);
  const [engineId, setEngineId] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="queue-add-title" tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          if (!engineId) { setFormError(t.addEngineMissing); return; }
          if (!note.trim()) { setFormError(t.addNoteMissing); return; }
          void onSubmit(engineId, note.trim());
        }}>
        <header className="modal-header">
          <div><span className="eyebrow">{t.eyebrow}</span><h2 id="queue-add-title">{t.addTitle}</h2><p>{t.addIntro}</p></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <div className="form-grid">
          <label><span>{t.addEngineLabel} *</span>
            <select value={engineId} onChange={(event) => setEngineId(event.target.value)} autoFocus>
              <option value="">{t.addEngineSelect}</option>
              {engines.map((engine) => <option key={engine.id} value={engine.id}>{engine.code} · {engine.family}</option>)}
            </select>
          </label>
        </div>
        <label className="standalone-textarea"><span>{t.addNoteLabel} *</span>
          <textarea rows={3} maxLength={500} value={note} placeholder={t.addNotePlaceholder} onChange={(event) => setNote(event.target.value)} />
          <small>{t.addNoteHint}</small>
        </label>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? t.adding : t.addConfirm}</button>
        </footer>
      </form>
    </div>
  );
}
