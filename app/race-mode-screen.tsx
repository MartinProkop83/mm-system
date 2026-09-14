"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";

type Locale = "cs" | "en";
type AppRole = "superadmin" | "boss" | "mechanic";

type RaceRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  departureDate: string;
  returnDate: string;
  status: "planned" | "active" | "completed";
};

/** Jeden přiřazený motor pilota. `tracksHours` říká server — klient rodinu motoru nevidí. */
type EngineSlot = { engineId: string; engineCode: string; tracksHours: boolean };

type EntryRow = { id: string; category: string; driverName: string; engines: EngineSlot[] };

type EngineRunRow = { engineId: string; raced: boolean };

type CustomerRow = { id: string; name: string };
type InventoryRow = { id: string; code: string; name: string; quantity: number; priceCzkCents: number; priceEurCents: number };
type DeliveryRow = { id: string; customerName: string; description: string; quantity: number; currency: string; amountCents: number; isPaid: boolean };

type RaceModeData = {
  race: { id: string; name: string; startDate: string; endDate: string };
  entries: EntryRow[];
  engineRuns: EngineRunRow[];
  /** Jen pro superadmina a vedení — mechanikovi se nenačtou ani nezobrazí. */
  customers?: CustomerRow[];
  inventory?: InventoryRow[];
  deliveries?: DeliveryRow[];
};

const content = {
  cs: {
    back: "Zpět",
    backToPicker: "Zpět na výběr závodu",
    loading: "Načítám…",
    loadError: "Nepodařilo se načíst data.",
    retry: "Zkusit znovu",
    pickTitle: "Který závod?",
    pickIntro: "Vyber závod, na kterém se právě jede.",
    noRace: "Dnes žádný závod neprobíhá",
    noRaceHelp: "RACE MODE se nabízí jen na den odjezdu až návratu, nebo do dvou dnů po skončení závodu.",
    statusActive: "Probíhá",
    statusEndedToday: "Skončil dnes",
    statusEndedDays: (n: number) => n === 1 ? "Skončil včera" : `Skončil před ${n} dny`,
    day: (n: number, total: number) => `${n}. den z ${total}`,
    drivers: "pilotů",
    confirmed: "potvrzeno",
    remaining: "zbývá",
    of: "z",
    engines: "motorů",
    driven: "JEL",
    notDriven: "NEJEL",
    hoursLabel: "Motohodiny (Oppama)",
    hoursPlaceholder: "01:24",
    hoursSave: "Uložit",
    hoursSaving: "Ukládám…",
    hoursSaved: "Uloženo",
    hoursError: "Motohodiny se nepodařilo uložit.",
    savingRun: "Ukládám…",
    runError: "Nepodařilo se uložit. Zkus to znovu.",
    noEntries: "Na tomto závodě zatím nejsou žádní piloti.",
    unconfirmed: "Nepotvrzeno",
    deliveries: "Předávky",
    deliveriesIntro: "Kdo si co odvezl a jestli zaplatil.",
    newDelivery: "Nová předávka",
    customer: "Komu",
    customerPlaceholder: "Jméno nebo firma",
    item: "Co",
    fromStock: "Ze skladu",
    freeText: "Jiné",
    itemPlaceholder: "Co se předalo",
    quantity: "Ks",
    amount: "Za kolik",
    paid: "Zaplaceno",
    saveDelivery: "Uložit předávku",
    savingDelivery: "Ukládám…",
    deliveryError: "Předávku se nepodařilo uložit.",
    noDeliveries: "Zatím žádná předávka.",
    stockLeft: (count: number) => `skladem ${count}`,
  },
  en: {
    back: "Back",
    backToPicker: "Back to race picker",
    loading: "Loading…",
    loadError: "Could not load the data.",
    retry: "Try again",
    pickTitle: "Which race?",
    pickIntro: "Pick the race that is happening right now.",
    noRace: "No race is happening today",
    noRaceHelp: "RACE MODE only appears on the days from departure to return, or up to two days after a race ends.",
    statusActive: "Active",
    statusEndedToday: "Ended today",
    statusEndedDays: (n: number) => n === 1 ? "Ended yesterday" : `Ended ${n} days ago`,
    day: (n: number, total: number) => `Day ${n} of ${total}`,
    drivers: "drivers",
    confirmed: "confirmed",
    remaining: "left",
    of: "of",
    engines: "engines",
    driven: "RACED",
    notDriven: "DID NOT RACE",
    hoursLabel: "Running hours (Oppama)",
    hoursPlaceholder: "01:24",
    hoursSave: "Save",
    hoursSaving: "Saving…",
    hoursSaved: "Saved",
    hoursError: "Could not save the running hours.",
    savingRun: "Saving…",
    runError: "Could not save. Try again.",
    noEntries: "No drivers on this race yet.",
    unconfirmed: "Unconfirmed",
    deliveries: "Handovers",
    deliveriesIntro: "Who took what and whether they paid.",
    newDelivery: "New handover",
    customer: "To whom",
    customerPlaceholder: "Name or company",
    item: "What",
    fromStock: "From stock",
    freeText: "Other",
    itemPlaceholder: "What was handed over",
    quantity: "Qty",
    amount: "Amount",
    paid: "Paid",
    saveDelivery: "Save handover",
    savingDelivery: "Saving…",
    deliveryError: "The handover could not be saved.",
    noDeliveries: "No handovers yet.",
    stockLeft: (count: number) => `${count} in stock`,
  },
} as const;

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function diffDays(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/**
 * Které závody RACE MODE nabízí: buď dnešek padá do rozsahu odjezd → návrat, nebo závod
 * skončil nejvýš před dvěma dny (na place se potvrzení často nestihne ještě týž večer).
 */
function isEligible(race: RaceRow, today: string) {
  const from = race.departureDate || race.startDate;
  const to = race.returnDate || race.endDate;
  if (from <= today && today <= to) return true;
  const daysSinceEnd = diffDays(today, race.endDate);
  return daysSinceEnd >= 0 && daysSinceEnd <= 2;
}

export function RaceModeScreen({ locale, role }: { locale: Locale; role: AppRole }) {
  const t = content[locale];
  // Mechanik má jako celou aplikaci frontu na servis, takže se z režimu vrací tam, ne do menu.
  const homeHref = role === "mechanic" ? "/servis-fronta" : "/";
  const [races, setRaces] = useState<RaceRow[] | null>(null);
  const [racesError, setRacesError] = useState(false);
  const [raceId, setRaceId] = useState<string | null>(null);

  const loadRaces = useCallback(async () => {
    setRacesError(false);
    try {
      // Nabídka závodů jde z RACE MODE routy, ne z plánování — ta vrací jen to, co je
      // na place potřeba, a je jediná, kterou má otevřenou i mechanik.
      const response = await fetch("/api/race-mode", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { races: RaceRow[] };
      setRaces(data.races);
    } catch {
      setRacesError(true);
    }
  }, []);

  useEffect(() => { void loadRaces(); }, [loadRaces]);

  const today = useMemo(() => todayIso(), []);
  // Server posílá rovnou jen závody, které do režimu patří — tohle je poslední pojistka,
  // aby se ve výběru neobjevilo něco, co mezitím vypadlo z okna.
  const eligible = useMemo(() => (races ?? []).filter((race) => isEligible(race, today)), [races, today]);

  // Jeden aktivní závod → vejde se do něj rovnou, bez mezikroku. Víc jich znamená výběr.
  useEffect(() => {
    if (raceId === null && eligible.length === 1) setRaceId(eligible[0].id);
  }, [eligible, raceId]);

  if (races === null && !racesError) {
    return <main className="queue-screen"><div className="queue-screen-body"><LoadingState label={t.loading} /></div></main>;
  }

  if (racesError) {
    return (
      <main className="queue-screen">
        <div className="queue-screen-body">
          <EmptyState variant="error" icon="!" title={t.loadError}
            action={<button className="secondary-compact" type="button" onClick={() => void loadRaces()}>{t.retry}</button>} />
        </div>
      </main>
    );
  }

  if (raceId) {
    return (
      <RaceModeConfirm
        locale={locale}
        raceId={raceId}
        canGoBackToPicker={eligible.length > 1}
        homeHref={homeHref}
        onBack={() => setRaceId(null)}
      />
    );
  }

  return (
    <main className="queue-screen">
      <header className="queue-screen-bar">
        <img src="/machac-motors-logo.jpg" alt="Macháč Motors" />
        <Link className="secondary-compact" href={homeHref}>← {t.back}</Link>
      </header>
      <div className="queue-screen-body">
        <section className="dash-panel race-mode-picker">
          <div className="tab-panel-header"><div><span className="eyebrow">RACE MODE</span><h2>{t.pickTitle}</h2><p>{t.pickIntro}</p></div></div>
          {eligible.length === 0 ? (
            <EmptyState icon="🏁" title={t.noRace} description={t.noRaceHelp} />
          ) : (
            <div className="race-mode-pick-list">
              {eligible.map((race) => {
                const daysSinceEnd = diffDays(today, race.endDate);
                const isActive = race.status !== "completed";
                return (
                  <button key={race.id} type="button" className="race-mode-pick-card" onClick={() => setRaceId(race.id)}>
                    <strong>{race.name}</strong>
                    <em className={isActive ? "tone-active" : "tone-ended"}>
                      {isActive ? t.statusActive : (daysSinceEnd <= 0 ? t.statusEndedToday : t.statusEndedDays(daysSinceEnd))}
                    </em>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function RaceModeConfirm({ locale, raceId, canGoBackToPicker, homeHref, onBack }: {
  locale: Locale; raceId: string; canGoBackToPicker: boolean; homeHref: string; onBack: () => void;
}) {
  const t = content[locale];
  const [data, setData] = useState<RaceModeData | null>(null);
  const [error, setError] = useState(false);
  // Optimistická vrstva nad `engineRuns` z serveru — psaní na place nesmí čekat na odpověď,
  // ale při chybě se vrátí zpět na to, co server naposledy potvrdil.
  const [pending, setPending] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(false);
    try {
      const response = await fetch(`/api/race-mode?raceId=${encodeURIComponent(raceId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      setData((await response.json()) as RaceModeData);
    } catch {
      setError(true);
    }
  }, [raceId]);

  useEffect(() => { void load(); }, [load]);

  const runByEngine = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const run of data?.engineRuns ?? []) map.set(run.engineId, run.raced);
    return map;
  }, [data]);

  async function setRun(entryId: string, engineId: string, raced: boolean) {
    setPending((current) => new Set(current).add(engineId));
    // Optimistický zápis: dlaždice se přebarví hned, ne až po odpovědi serveru.
    setData((current) => current && {
      ...current,
      engineRuns: [...current.engineRuns.filter((run) => run.engineId !== engineId), { engineId, raced }],
    });
    try {
      const response = await fetch("/api/race-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "engineRun", raceId, entryId, engineId, raced }),
      });
      if (!response.ok) throw new Error("save failed");
    } catch {
      window.alert(t.runError);
      await load();
    } finally {
      setPending((current) => { const next = new Set(current); next.delete(engineId); return next; });
    }
  }

  if (!data && !error) return <main className="queue-screen"><div className="queue-screen-body"><LoadingState label={t.loading} /></div></main>;
  if (error || !data) {
    return (
      <main className="queue-screen">
        <div className="queue-screen-body">
          <EmptyState variant="error" icon="!" title={t.loadError}
            action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
        </div>
      </main>
    );
  }

  const { race, entries } = data;

  const totalDays = Math.max(1, diffDays(race.endDate, race.startDate) + 1);
  const dayNumber = Math.min(totalDays, Math.max(1, diffDays(todayIso(), race.startDate) + 1));

  const allEngines = entries.flatMap((entry) => entry.engines);
  const confirmedCount = allEngines.filter((slot) => runByEngine.has(slot.engineId)).length;

  const groups = new Map<string, EntryRow[]>();
  for (const entry of entries) groups.set(entry.category, [...(groups.get(entry.category) ?? []), entry]);

  return (
    <main className="queue-screen race-mode-screen">
      <header className="queue-screen-bar">
        {canGoBackToPicker
          ? <button className="secondary-compact" type="button" onClick={onBack}>← {t.backToPicker}</button>
          : <Link className="secondary-compact" href={homeHref}>← {t.back}</Link>}
      </header>
      <div className="queue-screen-body">
        <section className="dash-panel race-mode-header">
          <div>
            <span className="eyebrow">RACE MODE</span>
            <h2>{race.name}</h2>
            {totalDays > 1 && <p>{t.day(dayNumber, totalDays)}</p>}
          </div>
          <div className="race-mode-header-stats">
            <div><strong>{entries.length}</strong><small>{t.drivers}</small></div>
            <div className="tone-done"><strong>{confirmedCount}</strong><small>{t.of} {allEngines.length} {t.confirmed}</small></div>
          </div>
        </section>

        {entries.length === 0 ? (
          <section className="dash-panel"><EmptyState size="inline" title={t.noEntries} /></section>
        ) : (
          Array.from(groups.entries()).map(([category, categoryEntries]) => (
            <section key={category} className="dash-panel race-mode-category">
              <h3>{category}</h3>
              <div className="race-mode-drivers">
                {categoryEntries.map((entry) => (
                  <article key={entry.id} className="race-mode-driver">
                    <strong>{entry.driverName}</strong>
                    <div className="race-mode-engines">
                      {entry.engines.map((slot) => (
                        <EngineRunCard
                          key={slot.engineId}
                          t={t}
                          slot={slot}
                          raced={runByEngine.get(slot.engineId)}
                          saving={pending.has(slot.engineId)}
                          onSetRun={(raced) => void setRun(entry.id, slot.engineId, raced)}
                          raceId={raceId}
                          entryId={entry.id}
                        />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}

        {/* Předávky vidí jen superadmin a vedení — mechanikovi je server vůbec nepošle,
            takže se blok ani nevykreslí. */}
        {data.deliveries && <DeliveryBlock t={t} raceId={raceId} data={data} onSaved={() => void load()} />}
      </div>
    </main>
  );
}

function DeliveryBlock({ t, raceId, data, onSaved }: {
  t: (typeof content)[Locale]; raceId: string; data: RaceModeData; onSaved: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [partId, setPartId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [amount, setAmount] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const part = data.inventory?.find((item) => item.id === partId) ?? null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/race-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "delivery", raceId, customerName,
          inventoryPartId: partId || undefined,
          description: partId ? undefined : description,
          quantity: Number(quantity) || 1,
          // Cena se zadává v korunách, ukládá se v haléřích jako všude jinde v systému.
          amountCents: Math.round((Number(amount.replace(",", ".")) || 0) * 100),
          currency: "CZK", isPaid,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "save failed");
      setCustomerName(""); setPartId(""); setDescription(""); setQuantity("1"); setAmount("");
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message !== "save failed" ? saveError.message : t.deliveryError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dash-panel race-mode-deliveries">
      <div className="tab-panel-header"><div><span className="eyebrow">{t.deliveries.toUpperCase()}</span><h3>{t.deliveries}</h3><p>{t.deliveriesIntro}</p></div></div>

      <form className="race-mode-delivery-form" onSubmit={(event) => void save(event)}>
        <label><span>{t.customer} *</span>
          <input list="race-mode-customers" value={customerName} placeholder={t.customerPlaceholder} required
            onChange={(event) => setCustomerName(event.target.value)} />
          <datalist id="race-mode-customers">
            {(data.customers ?? []).map((customer) => <option key={customer.id} value={customer.name} />)}
          </datalist>
        </label>

        <label><span>{t.item} — {t.fromStock}</span>
          <select value={partId} onChange={(event) => {
            setPartId(event.target.value);
            // Cena ze skladu se předvyplní, ale jde přepsat — na place se občas smlouvá.
            const picked = data.inventory?.find((item) => item.id === event.target.value);
            if (picked) setAmount(String(picked.priceCzkCents / 100));
          }}>
            <option value="">{t.freeText}</option>
            {(data.inventory ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.name} · {t.stockLeft(item.quantity)}</option>
            ))}
          </select>
        </label>

        {!partId && (
          <label><span>{t.item} *</span>
            <input value={description} placeholder={t.itemPlaceholder} required
              onChange={(event) => setDescription(event.target.value)} />
          </label>
        )}

        <label className="race-mode-delivery-small"><span>{t.quantity}</span>
          <input inputMode="numeric" value={quantity} max={part?.quantity}
            onChange={(event) => setQuantity(event.target.value.replace(/[^0-9]/g, ""))} />
        </label>

        <label className="race-mode-delivery-small"><span>{t.amount} (Kč)</span>
          <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>

        <label className="race-mode-delivery-paid">
          <input type="checkbox" checked={isPaid} onChange={(event) => setIsPaid(event.target.checked)} />
          <span>{t.paid}</span>
        </label>

        <button className="primary-button" type="submit" disabled={saving}>{saving ? t.savingDelivery : t.saveDelivery}</button>
      </form>

      {error && <p className="form-error" role="alert">{error}</p>}

      {data.deliveries && data.deliveries.length > 0 ? (
        <ul className="race-mode-delivery-list">
          {data.deliveries.map((delivery) => (
            <li key={delivery.id}>
              <strong>{delivery.customerName}</strong>
              <span>{delivery.quantity}× {delivery.description}</span>
              <b>{(delivery.amountCents / 100).toLocaleString("cs-CZ")} {delivery.currency}</b>
              <em className={delivery.isPaid ? "tone-paid" : "tone-unpaid"}>{delivery.isPaid ? "✓" : "—"}</em>
            </li>
          ))}
        </ul>
      ) : <p className="form-hint">{t.noDeliveries}</p>}
    </section>
  );
}

function EngineRunCard({ t, slot, raced, saving, onSetRun, raceId, entryId }: {
  t: (typeof content)[Locale];
  slot: EngineSlot;
  raced: boolean | undefined;
  saving: boolean;
  onSetRun: (raced: boolean) => void;
  raceId: string;
  entryId: string;
}) {
  // Jestli motor sleduje motohodiny, rozhoduje server — klient rodinu motoru vůbec nedostane.
  const state = raced === undefined ? "unset" : raced ? "driven" : "not-driven";

  return (
    <div className={`race-mode-engine tone-${state}`}>
      <div className="race-mode-engine-head">
        <strong>{slot.engineCode}</strong>
        {state === "unset" && <span className="race-mode-unconfirmed">{t.unconfirmed}</span>}
      </div>
      <div className="race-mode-engine-buttons">
        <button type="button" className={`race-mode-btn driven${raced === true ? " active" : ""}`} disabled={saving} onClick={() => onSetRun(true)}>
          {t.driven}
        </button>
        <button type="button" className={`race-mode-btn not-driven${raced === false ? " active" : ""}`} disabled={saving} onClick={() => onSetRun(false)}>
          {t.notDriven}
        </button>
      </div>
      {raced === true && slot.tracksHours && (
        <HoursField t={t} raceId={raceId} entryId={entryId} engineId={slot.engineId} />
      )}
    </div>
  );
}

function HoursField({ t, raceId, entryId, engineId }: {
  t: (typeof content)[Locale]; raceId: string; entryId: string; engineId: string;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/race-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "usage", raceId, entryId, engineId, oppama: value }),
      });
      if (!response.ok) throw new Error("save failed");
      setSaved(true);
    } catch {
      setError(t.hoursError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="race-mode-hours" onSubmit={(event) => void save(event)}>
      <label>
        <span>{t.hoursLabel}</span>
        <input inputMode="numeric" placeholder={t.hoursPlaceholder} pattern="[0-9]{1,3}:[0-5][0-9]" required
          value={value} onChange={(event) => { setValue(event.target.value); setSaved(false); }} />
      </label>
      <button className="secondary-compact" type="submit" disabled={saving}>{saving ? t.hoursSaving : t.hoursSave}</button>
      {saved && <span className="race-mode-hours-saved">✓ {t.hoursSaved}</span>}
      {error && <span className="form-error">{error}</span>}
    </form>
  );
}
