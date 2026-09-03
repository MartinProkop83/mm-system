"use client";

import { useEffect, useMemo, useState } from "react";
import { countryFlag } from "./countries";
import type { LogisticsData, LogisticsRace } from "./logistics-pages";
import { RaceLogoBadge } from "./race-logo-badge";
import { raceCalendarColorDefinition } from "./race-calendar-colors";

type Locale = "cs" | "en";

export function CalendarPage({ locale, onOpenRace }: { locale: Locale; onOpenRace: (raceId: string) => void }) {
  const [data, setData] = useState<LogisticsData>({ races: [], travelers: [], accommodations: [], flights: [], rentals: [] });
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => { const today = new Date(); return new Date(today.getFullYear(), today.getMonth(), 1); });
  const [mechanicId, setMechanicId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/logistics", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("load failed");
      const result = await response.json() as Partial<LogisticsData>;
      if (active) setData({ races: result.races ?? [], travelers: result.travelers ?? [], accommodations: result.accommodations ?? [], flights: result.flights ?? [], rentals: result.rentals ?? [] });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const mechanics = useMemo(() => uniqueResources(data.races.flatMap((race) => race.mechanics)), [data.races]);
  const vehicles = useMemo(() => uniqueResources(data.races.flatMap((race) => race.vehicles.map((vehicle) => ({ id: vehicle.id, name: `${vehicle.name}${vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}` })))), [data.races]);
  const races = useMemo(() => data.races.filter((race) => (!mechanicId || race.mechanics.some((item) => item.id === mechanicId)) && (!vehicleId || race.vehicles.some((item) => item.id === vehicleId))), [data.races, mechanicId, vehicleId]);
  const days = useMemo(() => calendarDays(month), [month]);
  const monthLabel = new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { month: "long", year: "numeric" }).format(month);
  const activeMechanicName = mechanics.find((item) => item.id === mechanicId)?.name;
  const activeVehicleName = vehicles.find((item) => item.id === vehicleId)?.name;
  const printFilterParts = [
    activeMechanicName ? `${locale === "cs" ? "Mechanik" : "Mechanic"}: ${activeMechanicName}` : null,
    activeVehicleName ? `${locale === "cs" ? "Auto" : "Vehicle"}: ${activeVehicleName}` : null,
  ].filter((part): part is string => Boolean(part));

  function printCalendar() {
    const previousTitle = document.title;
    document.body.dataset.printMode = "calendar";
    document.title = `${locale === "cs" ? "Kalendář výjezdů" : "Travel calendar"} — ${monthLabel}`;
    window.print();
    window.setTimeout(() => { delete document.body.dataset.printMode; document.title = previousTitle; }, 500);
  }

  return <div className="calendar-page">
    <section className="dash-panel calendar-header">
      <div><span className="eyebrow">MM RACE CALENDAR</span><h2>{locale === "cs" ? "Kalendář výjezdů" : "Travel calendar"}</h2><p>{locale === "cs" ? "Závody, mechanici, vlastní i pronajatá auta, ubytování a lety na jednom místě." : "Races, mechanics, team and rental cars, accommodation and flights in one place."}</p></div>
      <div className="calendar-header-actions no-print">
        <button className="calendar-print-button" type="button" onClick={printCalendar}>⎙ {locale === "cs" ? "Tisk kalendáře" : "Print calendar"}</button>
        <div className="calendar-filters"><label><span>{locale === "cs" ? "Mechanik" : "Mechanic"}</span><select value={mechanicId} onChange={(event) => setMechanicId(event.target.value)}><option value="">{locale === "cs" ? "Všichni mechanici" : "All mechanics"}</option>{mechanics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>{locale === "cs" ? "Auto" : "Vehicle"}</span><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">{locale === "cs" ? "Všechna auta" : "All vehicles"}</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      </div>
    </section>
    <section className="dash-panel calendar-board calendar-print-area">
      <header><button type="button" className="no-print" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><div><h3>{monthLabel}</h3>{printFilterParts.length > 0 && <span className="print-only calendar-print-filter">{printFilterParts.join(" · ")}</span>}<button type="button" className="no-print" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }}>{locale === "cs" ? "Dnes" : "Today"}</button></div><button type="button" className="no-print" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></header>
      {loading ? <div className="empty-state"><span className="spinner" /></div> : <div className="calendar-grid">{(locale === "cs" ? ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map((day) => <strong className="calendar-weekday" key={day}>{day}</strong>)}{days.map((day) => { const iso = isoDate(day); const dayRaces = races.filter((race) => race.departureDate <= iso && race.returnDate >= iso); return <div className={`calendar-day ${day.getMonth() !== month.getMonth() ? "outside" : ""} ${iso === isoDate(new Date()) ? "today" : ""}`} key={iso}><span className="calendar-date">{day.getDate()}</span>{dayRaces.slice(0, 3).map((race) => <CalendarRaceEvent key={race.id} race={race} locale={locale} onOpen={() => onOpenRace(race.id)} />)}</div>; })}</div>}
    </section>
    <section className="calendar-agenda"><div className="calendar-agenda-heading"><h3>{locale === "cs" ? "Přehled výjezdů" : "Travel overview"}</h3><span>{races.length} {locale === "cs" ? "závodů" : "races"}</span></div>{races.length === 0 ? <div className="dash-panel empty-state"><h3>{locale === "cs" ? "Pro tento filtr nejsou žádné výjezdy" : "No trips match this filter"}</h3><p>{locale === "cs" ? "Volné dny zůstávají v kalendáři bez označení." : "Free days remain blank in the calendar."}</p></div> : races.map((race) => <RaceAgenda key={race.id} race={race} data={data} locale={locale} />)}</section>
  </div>;
}

function CalendarRaceEvent({ race, locale, onOpen }: { race: LogisticsRace; locale: Locale; onOpen: () => void }) {
  const mechanics = race.mechanics.map((item) => item.name);
  const vehicles = race.vehicles.map((item) => `${item.name}${item.licensePlate ? ` · ${item.licensePlate}` : ""}`);
  const empty = locale === "cs" ? "Nikdo nepřiřazen" : "None assigned";
  const hoverText = `${race.name} · ${race.track}\n${locale === "cs" ? "Mechanici" : "Mechanics"}: ${mechanics.join(", ") || empty}\n${locale === "cs" ? "Auta" : "Vehicles"}: ${vehicles.join(", ") || empty}`;
  return <button className="calendar-event" style={calendarColorStyle(race.calendarColor)} type="button" onClick={onOpen} title={hoverText} aria-label={`${locale === "cs" ? "Otevřít závod" : "Open race"} ${race.name}, ${race.track}`}><div className="calendar-event-title"><RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="small" /><b>{race.name}</b></div><span className="calendar-event-track">{countryFlag(race.countryCode)} {race.track}</span><small>{race.mechanics.length} {locale === "cs" ? "mechaniků" : "mechanics"} · {race.vehicles.length} {locale === "cs" ? "aut" : "vehicles"}</small><span className="calendar-event-tooltip" role="tooltip"><strong>{locale === "cs" ? "Přiřazení k závodu" : "Race assignments"}</strong><span><b>{locale === "cs" ? "Mechanici" : "Mechanics"}</b>{mechanics.length ? mechanics.map((name) => <i key={name}>{name}</i>) : <i>{empty}</i>}</span><span><b>{locale === "cs" ? "Auta" : "Vehicles"}</b>{vehicles.length ? vehicles.map((name) => <i key={name}>{name}</i>) : <i>{empty}</i>}</span><em>{locale === "cs" ? "Kliknutím otevřeš detail závodu" : "Click to open race details"}</em></span></button>;
}

function RaceAgenda({ race, data, locale }: { race: LogisticsRace; data: LogisticsData; locale: Locale }) {
  const accommodations = data.accommodations.filter((item) => item.raceId === race.id);
  const flights = data.flights.filter((item) => item.raceId === race.id);
  const rentals = data.rentals.filter((item) => item.raceId === race.id);
  return <article className="dash-panel agenda-race" style={calendarColorStyle(race.calendarColor)}><div className="agenda-title"><RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} /><div><h3>{race.name}</h3><p>{countryFlag(race.countryCode)} {race.track} · {dateRange(race.departureDate, race.returnDate, locale)}</p></div></div><div className="agenda-columns"><AgendaGroup title={locale === "cs" ? "Mechanici" : "Mechanics"} items={race.mechanics.map((item) => item.name)} /><AgendaGroup title={locale === "cs" ? "Auta týmu" : "Team vehicles"} items={race.vehicles.map((item) => `${item.name}${item.licensePlate ? ` · ${item.licensePlate}` : ""}`)} /><AgendaGroup title={locale === "cs" ? "Ubytování" : "Accommodation"} items={accommodations.map((item) => `${item.name} · ${item.guestCount} ${locale === "cs" ? "osob" : "guests"}${formatAccommodationRoute(item, locale) ? ` · ${formatAccommodationRoute(item, locale)}` : ""}`)} /><AgendaGroup title={locale === "cs" ? "Letenky" : "Flights"} items={flights.map((item) => `${item.departureAirport} ${item.direction === "roundtrip" ? "↔" : "→"} ${item.arrivalAirport} · ${item.flightNumber || item.airline || "—"}${item.direction === "roundtrip" ? ` / ${item.returnFlightNumber || item.returnAirline || "—"}` : ""}`)} /><AgendaGroup title={locale === "cs" ? "Pronájem auta" : "Car rental"} items={rentals.map((item) => `${item.company} · ${item.vehicleType || (locale === "cs" ? "auto" : "car")}`)} /></div></article>;
}

function calendarColorStyle(value: unknown) {
  const color = raceCalendarColorDefinition(value);
  return { "--calendar-event-accent": color.accent, "--calendar-event-bg": color.background, "--calendar-event-text": color.text, "--calendar-event-muted": color.muted } as React.CSSProperties;
}

function AgendaGroup({ title, items }: { title: string; items: string[] }) { return <div><strong>{title}</strong>{items.length ? items.map((item, index) => <span key={`${item}-${index}`}>{item}</span>) : <small>—</small>}</div>; }
function uniqueResources(items: Array<{ id: string; name: string }>) { return [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) => a.name.localeCompare(b.name)); }
function calendarDays(month: Date) { const first = new Date(month.getFullYear(), month.getMonth(), 1); const offset = (first.getDay() + 6) % 7; const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset); return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)); }
function isoDate(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function dateRange(start: string, end: string, locale: Locale) { const format = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day)); }; return `${format(start)} – ${format(end)}`; }
function formatAccommodationRoute(item: LogisticsData["accommodations"][number], locale: Locale) { const parts: string[] = []; if (item.trackDistanceKm !== null) parts.push(`${new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { maximumFractionDigits: 1 }).format(item.trackDistanceKm)} km`); if (item.trackDriveMinutes !== null) parts.push(`≈ ${item.trackDriveMinutes} min`); return parts.join(" · "); }
