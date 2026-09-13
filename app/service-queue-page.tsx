"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";
import { formatCount, type PluralForms } from "./pluralize";

type Locale = "cs" | "en";

/** Jeden důvod, proč motor ve frontě je. Motor jich může mít víc najednou. */
type QueueSource = {
  sourceType: "race" | "loan" | "manual";
  sourceId: string;
  sourceLabel: string;
  returnDate: string;
  driverName: string;
  note: string;
  addedBy: string;
};

/** Jedna dlaždice = jeden motor. Mechanik ho má v ruce jednou, i když přijel z víc zdrojů. */
type QueueItem = {
  engineId: string;
  engineCode: string;
  family: string;
  sources: QueueSource[];
  /** Nejnovější návrat ze všech zdrojů — od té doby motor čeká v dílně. */
  returnDate: string;
  driverNames: string[];
  notes: string[];
  nextRaceDate: string | null;
  nextRaceName: string | null;
  /** Kategorie po staré servisní kartě otevírá jiný formulář zápisu. */
  serviceCardMigrated: boolean;
  /** Kdo motor drží („Beru si ho") a odkdy. `null` = volný. */
  claim: { id: string; byName: string; at: number; canRelease: boolean } | null;
};

type QueueCategory = { code: string; nameCs: string; nameEn: string; sortOrder: number };
type QueueEngine = { id: string; code: string; family: string; inQueue: boolean };
type QueueMechanic = { id: string; name: string };

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

/** Jak často se přepočítá, jak dlouho někdo motor drží. Zvýraznění se mění po hodinách,
 *  takže půlminuta stačí — a nechá dlaždice na pokoji, na rozdíl od tikajících hodin. */
const CLAIM_TICK_MS = 30_000;

/** Od kdy je motor „dlouho rozdělaný". Přes čtyři hodiny na jednom motoru už znamená,
 *  že se něco zaseklo. */
const CLAIM_LONG_MS = 4 * 60 * 60 * 1000;

/** „1 motor / 2 motory / 5 motorů" — čeština potřebuje tři tvary. */
const ENGINE_FORMS: PluralForms = { cs: ["motor", "motory", "motorů"], en: ["engine", "engines"] };

/** „+ 1 další / + 2 další / + 5 dalších" u zkráceného výčtu na dlaždici. */
const MORE_FORMS: PluralForms = { cs: ["další", "další", "dalších"], en: ["more", "more"] };

/**
 * Výčet zkrácený na první položku a počet zbylých („Testovací Pilot 2 + 1 další").
 *
 * Dlaždice má pevnou výšku, takže se spoléhat na zalomení nejde; a ořez uprostřed jména
 * („Testovací Pil") je horší než poctivé „a ještě jeden".
 */
function summarize(values: string[], locale: Locale) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  return `${values[0]} + ${formatCount(values.length - 1, locale, MORE_FORMS)}`;
}

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
    addAlreadyQueued: "už čeká ve frontě",
    addAlreadyQueuedError: "Tenhle motor ve frontě už čeká.",
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
    claim: "Beru si ho",
    claiming: "Beru…",
    release: "Vrátit do fronty",
    claimTaken: "Motor si mezitím vzal někdo jiný.",
    claimError: "Označení se nepodařilo uložit.",
    claimTitle: "Kdo si motor bere?",
    claimIntro: "Tahle obrazovka je přihlášená jedním účtem za celou dílnu, tak vyber, kdo na motoru bude dělat.",
    claimMechanicLabel: "Mechanik",
    claimMechanicSelect: "Vyber mechanika",
    claimMechanicMissing: "Vyber, kdo si motor bere.",
    kindLoan: "Zápůjčka",
    kindManual: "Ručně",
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
    addAlreadyQueued: "already in the queue",
    addAlreadyQueuedError: "This engine is already waiting in the queue.",
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
    claim: "I'll take it",
    claiming: "Taking…",
    release: "Back to the queue",
    claimTaken: "Someone else has taken the engine.",
    claimError: "The claim could not be saved.",
    claimTitle: "Who is taking the engine?",
    claimIntro: "This screen is signed in with one account for the whole workshop, so pick who will be working on the engine.",
    claimMechanicLabel: "Mechanic",
    claimMechanicSelect: "Pick a mechanic",
    claimMechanicMissing: "Pick who is taking the engine.",
    kindLoan: "Loan",
    kindManual: "Manual",
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

/**
 * Jak nápadně se má rozpracovaný motor zvýraznit.
 *
 * Rozhoduje kalendářní den, ne počet hodin: motor zabraný ve 23:50 visí ráno „od včerejška",
 * i když od té doby uběhlo míň než osm hodin. Přesně to má být z druhé strany dílny vidět.
 */
function claimLevel(claimedAt: number, now: number): "fresh" | "long" | "overnight" {
  // Před prvním tikem (server-side render) se drží nejmírnější stav — jinak by dlaždice
  // po hydrataci přeskočila barvu.
  if (!now) return "fresh";
  if (new Date(claimedAt).toDateString() !== new Date(now).toDateString()) return "overnight";
  return now - claimedAt >= CLAIM_LONG_MS ? "long" : "fresh";
}

/**
 * Hodiny v hlavičce fronty. Obrazovka v dílně slouží i jako nástěnné hodiny, proto sekundy.
 *
 * Tiká ve vlastní komponentě, aby překreslení každou sekundu nešlo přes celou frontu
 * s šedesáti dlaždicemi. Další tik se plánuje na nejbližší celou sekundu, takže se údaj
 * mění, když se opravdu mění, a neujíždí.
 */
function QueueClock({ locale }: { locale: Locale }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer = 0;
    function tick() {
      setNow(new Date());
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    }
    timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const tag = locale === "cs" ? "cs-CZ" : "en-GB";
  return (
    <div className="queue-clock" role="timer" aria-live="off">
      {/* Do prvního tiku je prázdno — čas ze serveru by po hydrataci stejně nesouhlasil. */}
      <strong>{now ? now.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "\u00a0"}</strong>
      <small>{now ? now.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "\u00a0"}</small>
    </div>
  );
}

/**
 * Důvody, proč motor ve frontě je, tak jak se vypíšou na dlaždici („Cheb + ZÁPŮJČKA").
 *
 * Stejné důvody se slučují: dva závody téhož jména i dvě ruční zařazení jsou pro mechanika
 * jedna informace. Ruční poznámky se tím neztratí, ty mají na dlaždici vlastní řádky.
 */
function queueReasons(item: QueueItem, t: Copy) {
  const reasons: Array<{ key: string; kind: QueueSource["sourceType"]; label: string }> = [];
  for (const source of item.sources) {
    const label = source.sourceType === "race" ? source.sourceLabel
      : source.sourceType === "loan" ? t.kindLoan : t.kindManual;
    if (!label || reasons.some((reason) => reason.label === label)) continue;
    reasons.push({ key: `${source.sourceType}|${label}`, kind: source.sourceType, label });
  }
  return reasons;
}

/** Klíč položky. Fronta je sloučená po motorech, takže stačí jeho id. */
function itemKey(item: Pick<QueueItem, "engineId">) {
  return item.engineId;
}

export function ServiceQueuePage({ locale, onOpenEngineService, fullscreenHref }: {
  locale: Locale;
  /** Otevře servisní kartu motoru rovnou ve formuláři zápisu. */
  onOpenEngineService: (engineId: string, serviceCardMigrated: boolean) => void;
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
  const [mechanics, setMechanics] = useState<QueueMechanic[]>([]);
  // `true` u sdíleného panelu v dílně — tam se při zabrání musí vybrat konkrétní člověk.
  const [needsMechanic, setNeedsMechanic] = useState(false);
  const [claimTarget, setClaimTarget] = useState<QueueItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // null = uživatel si ještě nevybral, drží se odhad podle šířky
  const [density, setDensity] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1440);
  // Čas pro výpočet zvýraznění rozpracovaných motorů. 0 = ještě neproběhl první tik.
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(API, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as {
        items: QueueItem[]; categories: QueueCategory[]; engines: QueueEngine[];
        mechanics?: QueueMechanic[]; claimNeedsMechanic?: boolean;
      };
      setItems(data.items);
      setCategories(data.categories);
      setEngines(data.engines ?? []);
      setMechanics(data.mechanics ?? []);
      setNeedsMechanic(Boolean(data.claimNeedsMechanic));
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

  // Zvýraznění rozpracovaných motorů se musí přebarvit samo, i když se fronta nemění —
  // po čtyřech hodinách a po půlnoci. První tik jde přes `setTimeout`, aby se stav
  // nenastavoval přímo v těle efektu.
  useEffect(() => {
    let timer = 0;
    function tick() {
      setNow(Date.now());
      timer = window.setTimeout(tick, CLAIM_TICK_MS);
    }
    timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, []);

  /**
   * Řazení ve sloupci: úplně nahoře rozpracované motory (nejdéle držené první, protože právě
   * ty se mají řešit), pak motory s blížícím se závodem podle jeho data a nakonec ostatní
   * podle data návratu, nejstarší nahoře.
   */
  const sorted = useMemo(() => {
    return items.slice().sort((left, right) => {
      if (Boolean(left.claim) !== Boolean(right.claim)) return left.claim ? -1 : 1;
      if (left.claim && right.claim && left.claim.at !== right.claim.at) return left.claim.at - right.claim.at;
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

  /**
   * „Beru si ho" / „Vrátit do fronty".
   *
   * Výsledek se nikdy nedomýšlí z klientského stavu — po odpovědi se fronta načte znovu,
   * protože motor si mezitím mohl vzít někdo jiný a jeho jméno musí na dlaždici sednout.
   */
  async function setClaim(item: QueueItem, take: boolean, mechanicId?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(take ? { claimEngineId: item.engineId, claimMechanicId: mechanicId ?? "" } : { releaseEngineId: item.engineId }),
      });
      if (response.status === 409) setError(t.claimTaken);
      else if (!response.ok) setError(t.claimError);
      else setClaimTarget(null);
      await load();
    } catch {
      setError(t.claimError);
    } finally {
      setBusy(false);
    }
  }

  async function skip(targets: QueueItem[]) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Odbavení platí pro všechny důvody, proč motor ve frontě je — mechanik ho odbavuje
        // jednou, ne zvlášť za závod a zvlášť za zápůjčku.
        body: JSON.stringify({
          items: targets.flatMap((item) => item.sources.map((source) => ({
            engineId: item.engineId, sourceType: source.sourceType, sourceId: source.sourceId,
          }))),
        }),
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
          {/* Obrazovka v dílně slouží i jako hodiny — proto sekundy a čitelnost z dálky. */}
          <QueueClock locale={locale} />
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
              <button type="button" className={`carb-unit-tile queue-filter-tile tone-total${filter === "ALL" ? " active" : ""}`}
                aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")}>
                <b>{items.length}</b><span>{t.all}</span>
              </button>
              {visibleCategories.map((category) => (
                <button key={category.code} type="button"
                  className={`carb-unit-tile queue-filter-tile tone-${familyTone(category.code)}${filter === category.code ? " active" : ""}`}
                  aria-pressed={filter === category.code} onClick={() => setFilter(category.code)}>
                  <b>{countByFamily.get(category.code) ?? 0}</b><span>{category.code}</span>
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
                        const level = item.claim ? claimLevel(item.claim.at, now) : null;
                        const manualOnly = item.sources.every((source) => source.sourceType === "manual");
                        return (
                          <article key={key} className={`queue-card${item.nextRaceDate ? " has-next-race" : ""}${manualOnly ? " is-manual" : ""}${level ? ` is-claimed claimed-${level}` : ""}${isSelected ? " selected" : ""}`}>
                            <label className="queue-card-select" title={t.select}>
                              <input type="checkbox" checked={isSelected} onChange={() => toggle(item)} aria-label={`${t.select} — ${item.engineCode}`} />
                              <span aria-hidden="true">✓</span>
                            </label>
                            <button className="queue-card-open" type="button" onClick={() => onOpenEngineService(item.engineId, item.serviceCardMigrated)}
                              aria-label={`${t.openCard} — ${item.engineCode}`}>
                              <strong className="queue-card-code">{item.engineCode}</strong>
                              {/* Pořadí na dlaždici kopíruje, co mechanik u ponku potřebuje nejdřív:
                                  číslo motoru, kdo na něm dělá, kategorie s pilotem, datum návratu. */}
                              {/* Čas zabrání se ukládá, ale nezobrazuje — na dlaždici by z něj byly
                                  stopky nad hlavou. Jak dlouho motor někdo drží, říká barva. */}
                              {item.claim && <span className="queue-card-claim">{item.claim.byName}</span>}
                              {/* Důvod ručního zařazení je jediné, z čeho mechanik pozná, proč tu motor
                                  je — proto hned pod číslem motoru a velkým písmem. */}
                              {item.notes.length > 0 && (
                                <span className="queue-card-note">{summarize(item.notes, locale)}</span>
                              )}
                              {/* Údaje pod sebou, všechny na stejné svislici. Štítek druhu odliší
                                  závod od zápůjčky — bez něj vypadá řádek u obojího stejně. */}
                              <span className="queue-card-facts">
                                <b className="queue-card-family">{item.family}</b>
                                {/* Všechny důvody, proč motor ve frontě je. U závodu mluví název sám za
                                    sebe; zápůjčku a ruční zařazení nic jiného neodliší, tam značka zůstává. */}
                                <span className="queue-card-source">
                                  {queueReasons(item, t).map((reason, index) => (
                                    <span key={reason.key} className="queue-card-reason">
                                      {index > 0 && <em className="queue-card-plus">+</em>}
                                      {reason.kind === "race"
                                        ? reason.label
                                        : <i className={`queue-card-kind kind-${reason.kind}`}>{reason.label}</i>}
                                    </span>
                                  ))}
                                </span>
                                {item.driverNames.length > 0 && (
                                  <span className="queue-card-driver">{summarize(item.driverNames, locale)}</span>
                                )}
                                <span className="queue-card-date">{t.returned}: {formatDate(item.returnDate, locale)}</span>
                              </span>
                              {item.nextRaceDate && (
                                <span className="queue-card-next">⚑ {t.nextRace}: {formatDate(item.nextRaceDate, locale)}</span>
                              )}
                            </button>
                            <div className="queue-card-actions">
                              {/* Na motoru dělá vždycky jeden — zabraný motor si druhý vzít nemůže. */}
                              {!item.claim && (
                                <button className="queue-card-claim-button" type="button" disabled={busy}
                                  onClick={() => { if (needsMechanic) setClaimTarget(item); else void setClaim(item, true); }}>
                                  {busy ? t.claiming : t.claim}
                                </button>
                              )}
                              {item.claim?.canRelease && (
                                <button className="queue-card-release" type="button" disabled={busy}
                                  onClick={() => void setClaim(item, false)}>{t.release}</button>
                              )}
                              <button className="queue-card-skip" type="button" disabled={busy} onClick={() => setConfirming([item])}>
                                {t.skip}
                              </button>
                            </div>
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
              if (response.status === 409) { setError(t.addAlreadyQueuedError); setAddOpen(false); await load(); return; }
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

      {claimTarget && (
        <ClaimMechanicModal t={t} item={claimTarget} mechanics={mechanics} busy={busy}
          onClose={() => setClaimTarget(null)}
          onSubmit={(mechanicId) => void setClaim(claimTarget, true, mechanicId)} />
      )}

      {confirming && confirming.length > 0 && (
        <SkipConfirmModal t={t} items={confirming} busy={busy}
          onClose={() => setConfirming(null)} onConfirm={() => void skip(confirming)} />
      )}
    </section>
  );
}

/**
 * Výběr mechanika při zabrání motoru na sdílené obrazovce.
 *
 * Nástěnka v dílně je přihlášená jedním účtem za celou partu, takže „přihlášený uživatel"
 * není ten, kdo si motor bere. Mechanikův vlastní účet tenhle modal nevidí — tam je člověk
 * dán přihlášením.
 */
function ClaimMechanicModal({ t, item, mechanics, busy, onClose, onSubmit }: {
  t: Copy; item: QueueItem; mechanics: QueueMechanic[]; busy: boolean;
  onClose: () => void;
  onSubmit: (mechanicId: string) => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const [mechanicId, setMechanicId] = useState("");
  const [formError, setFormError] = useState("");

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="queue-claim-title" tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          if (!mechanicId) { setFormError(t.claimMechanicMissing); return; }
          onSubmit(mechanicId);
        }}>
        <header className="modal-header">
          <div><span className="eyebrow">{item.engineCode}</span><h2 id="queue-claim-title">{t.claimTitle}</h2><p>{t.claimIntro}</p></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <div className="form-grid">
          <label><span>{t.claimMechanicLabel} *</span>
            <select value={mechanicId} onChange={(event) => setMechanicId(event.target.value)} autoFocus>
              <option value="">{t.claimMechanicSelect}</option>
              {mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}
            </select>
          </label>
        </div>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? t.claiming : t.claim}</button>
        </footer>
      </form>
    </div>
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
              {/* Motor, který ve frontě už čeká, se nenabízí — dlaždice je jedna na motor. */}
              {engines.map((engine) => (
                <option key={engine.id} value={engine.id} disabled={engine.inQueue}>
                  {engine.code} · {engine.family}{engine.inQueue ? ` — ${t.addAlreadyQueued}` : ""}
                </option>
              ))}
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
