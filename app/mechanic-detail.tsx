"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { countryFlag } from "./countries";
import type { MechanicRecord } from "./catalog-pages";
import { RaceLogoBadge } from "./race-logo-badge";
import { ClothingLightbox, ClothingPhoto, type ClothingPhotoPreview } from "./clothing-photo";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";

type TravelPassenger = { id: string; name: string; kind: string };
type MechanicAccommodation = { id: string; name: string; address: string; checkInDate: string; checkOutDate: string; reservationCode: string; websiteUrl: string; bookingUrl: string; trackDistanceKm: number | null; trackDriveMinutes: number | null; attachmentCount: number };
type MechanicFlight = { id: string; direction: string; departureAirport: string; arrivalAirport: string; departureAt: string; arrivalAt: string; airline: string; flightNumber: string; returnDepartureAirport: string; returnArrivalAirport: string; returnDepartureAt: string; returnArrivalAt: string; returnAirline: string; returnFlightNumber: string; passengersNote: string; passengers: TravelPassenger[]; attachmentCount: number };
type MechanicRental = { id: string; company: string; vehicleType: string; pickupPlace: string; returnPlace: string; pickupAt: string; returnAt: string; reservationCode: string; licensePlate: string; driverName: string; attachmentCount: number };
type MechanicTravel = { accommodations: MechanicAccommodation[]; flights: MechanicFlight[]; rentals: MechanicRental[] };

type RaceAssignment = {
  id: string;
  raceId: string;
  raceName: string;
  logoUrl: string;
  track: string;
  address: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  departureDate: string;
  returnDate: string;
  organizer: string;
  raceStatus: "planned" | "active" | "completed";
  vehicles: string;
  travel: MechanicTravel;
};

type ClothingAssignment = { id: string; clothingItemId: string; itemName: string; size: string; quantity: number; assignedAt: number; notes: string; imageUrl: string; updatedAt: number };
type DetailData = { mechanic: MechanicRecord; assignments: RaceAssignment[]; clothing: ClothingAssignment[] };

export function MechanicDetail({ mechanicId, locale, role, onBack, onEdit }: { mechanicId: string; locale: Locale; role: Role; onBack: () => void; onEdit: (mechanic: MechanicRecord) => void }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<ClothingPhotoPreview | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/mechanic-records?id=${encodeURIComponent(mechanicId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("load failed");
        const result = await response.json() as DetailData;
        if (active) { setData(result); setError(false); }
      } catch {
        if (active) setError(true);
      }
    }
    void load();
    return () => { active = false; };
  }, [mechanicId]);

  const current = useMemo(() => {
    const today = todayIso();
    const available = data?.assignments.filter((item) => item.raceStatus !== "completed" && item.returnDate >= today) ?? [];
    return available.sort((left, right) => left.departureDate.localeCompare(right.departureDate))[0] ?? null;
  }, [data]);

  if (error) return <section className="panel empty-state error-state"><b>!</b><p>{locale === "cs" ? "Kartu mechanika se nepodařilo načíst." : "Could not load the mechanic card."}</p><button className="secondary-compact" type="button" onClick={onBack}>{locale === "cs" ? "Zpět" : "Back"}</button></section>;
  if (!data) return <section className="panel empty-state"><span className="spinner" /><p>{locale === "cs" ? "Načítám kartu mechanika…" : "Loading mechanic card…"}</p></section>;

  const today = todayIso();
  const upcomingCount = data.assignments.filter((item) => item.raceStatus !== "completed" && item.returnDate >= today).length;
  const countries = new Set(data.assignments.map((item) => item.countryCode).filter(Boolean)).size;
  const travelDays = data.assignments.reduce((sum, item) => sum + inclusiveDays(item.departureDate, item.returnDate), 0);
  const initials = data.mechanic.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  function printCard(pdf: boolean) {
    const previousTitle = document.title;
    document.title = `MM System - ${data!.mechanic.name} - ${locale === "cs" ? "historie zavodu" : "race history"}`;
    if (pdf) window.alert(locale === "cs" ? "V následujícím okně zvol dole PDF → Uložit jako PDF." : "In the next window choose PDF → Save as PDF.");
    window.print();
    window.setTimeout(() => { document.title = previousTitle; }, 300);
  }

  return <div className="mechanic-detail mechanic-print-area">
    <button className="detail-back no-print" type="button" onClick={onBack}>← {locale === "cs" ? "Zpět na mechaniky" : "Back to mechanics"}</button>
    <section className="panel mechanic-detail-hero">
      <div className="mechanic-avatar">{initials || "MM"}</div>
      <div><span className="eyebrow">MM MECHANIC CARD</span><h2>{data.mechanic.name}</h2><p>{locale === "cs" ? "Přehled oblečení, přiřazení a historie závodů" : "Clothing, race assignments and history"}</p></div>
      <div className="mechanic-hero-actions no-print"><button className="secondary-compact" type="button" onClick={() => printCard(false)}>⌁ {locale === "cs" ? "Vytisknout" : "Print"}</button><button className="secondary-compact pdf-button" type="button" onClick={() => printCard(true)}>PDF {locale === "cs" ? "Uložit PDF" : "Save PDF"}</button>{role !== "mechanic" && <button className="primary-button" type="button" onClick={() => onEdit(data.mechanic)}>✎ {locale === "cs" ? "Upravit" : "Edit"}</button>}</div>
    </section>

    <section className="mechanic-stat-grid">
      <article className="panel"><span>{locale === "cs" ? "Závodů celkem" : "Total races"}</span><strong>{data.assignments.length}</strong></article>
      <article className="panel"><span>{locale === "cs" ? "Nadcházející" : "Upcoming"}</span><strong>{upcomingCount}</strong></article>
      <article className="panel"><span>{locale === "cs" ? "Navštívených zemí" : "Countries visited"}</span><strong>{countries}</strong></article>
      <article className="panel"><span>{locale === "cs" ? "Dnů na cestách" : "Travel days"}</span><strong>{travelDays}</strong></article>
    </section>

    <section className={`panel mechanic-next-race ${current ? "assigned" : ""}`}>
      <div><span className="eyebrow">{locale === "cs" ? "NEJBLIŽŠÍ ZÁVOD" : "NEXT RACE"}</span>{current ? <div className="race-history-identity featured"><RaceLogoBadge logoUrl={current.logoUrl} name={current.raceName} fallback={countryFlag(current.countryCode)} /><span><h3>{current.raceName}</h3><p>{countryFlag(current.countryCode)} {current.track}{current.address ? ` · ${current.address}` : ""}</p></span></div> : <h3>{locale === "cs" ? "Žádný plánovaný závod" : "No upcoming race"}</h3>}</div>
      {current && <div className="mechanic-next-facts"><span><small>{locale === "cs" ? "Závod" : "Race"}</small><strong>{dateRange(current.startDate, current.endDate, locale)}</strong></span><span><small>{locale === "cs" ? "Cesta" : "Travel"}</small><strong>{dateRange(current.departureDate, current.returnDate, locale)}</strong></span><span><small>{locale === "cs" ? "Auto" : "Car"}</small><strong>{formatVehicles(current.vehicles)}</strong></span><RaceStatus value={current.raceStatus} locale={locale} /></div>}
      {current && <MechanicRaceTravel assignment={current} locale={locale} compact />}
    </section>

    <section className="panel mechanic-clothing-panel">
      <header><div><span className="eyebrow">TEAM CLOTHING</span><h3>{locale === "cs" ? "Oblečení a velikosti" : "Clothing and sizes"}</h3><p>{locale === "cs" ? "Aktuální týmové vybavení mechanika." : "Current team equipment for this mechanic."}</p></div><strong>{data.clothing.length}</strong></header>
      {data.clothing.length ? <div className="mechanic-clothing-grid">{data.clothing.map((item, index) => <article key={item.id}>
        <ClothingPhoto imageUrl={item.imageUrl} name={item.itemName} fallback={item.itemName.slice(0, 2).toUpperCase()} className={`mechanic-clothing-mark tone-${index % 4}`} onOpen={setPhotoPreview} />
        <div><small>{item.itemName}</small><strong>{locale === "cs" ? "Velikost" : "Size"} {item.size}</strong><time>{locale === "cs" ? "Předáno" : "Issued"} {formatAssignedDate(item.assignedAt, locale)}</time>{item.notes && <p>{item.notes}</p>}</div>
        <b>{item.quantity}×</b>
      </article>)}</div> : <div className="empty-inline"><strong>{locale === "cs" ? "Zatím bez oblečení" : "No clothing yet"}</strong><p>{locale === "cs" ? "Položky přiřadíš v nové sekci Oblečení v levém menu." : "Assign items from the Clothing section in the left menu."}</p></div>}
    </section>

    <section className="panel mechanic-history-panel">
      <header><div><span className="eyebrow">RACE HISTORY</span><h3>{locale === "cs" ? "Kompletní historie závodů" : "Complete race history"}</h3><p>{locale === "cs" ? "Kdy a kde byl mechanik přiřazený." : "When and where the mechanic was assigned."}</p></div><strong>{data.assignments.length}</strong></header>
      {data.assignments.length ? <div className="table-wrap"><table className="engine-table mechanic-history-table race-logo-history-table"><thead><tr><th>{locale === "cs" ? "Závod" : "Race"}</th><th>{locale === "cs" ? "Místo" : "Location"}</th><th>{locale === "cs" ? "Termín závodu" : "Race dates"}</th><th>{locale === "cs" ? "Cesta" : "Travel"}</th><th>{locale === "cs" ? "Auto" : "Car"}</th><th>{locale === "cs" ? "Stav" : "Status"}</th></tr></thead><tbody>{data.assignments.map((item) => <MechanicHistoryRows key={item.id} item={item} locale={locale} />)}</tbody></table></div> : <div className="empty-inline"><strong>{locale === "cs" ? "Zatím bez závodu" : "No races yet"}</strong><p>{locale === "cs" ? "Historie se vytvoří automaticky po přiřazení mechanika k závodu." : "History is created automatically after assigning the mechanic to a race."}</p></div>}
    </section>
    <p className="mechanic-print-footer">MM SYSTEM · MACHÁČ MOTORS · {locale === "cs" ? "Karta mechanika" : "Mechanic card"} · {new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB").format(new Date())}</p>
    {photoPreview && <ClothingLightbox preview={photoPreview} onClose={() => setPhotoPreview(null)} />}
  </div>;
}

function MechanicHistoryRows({ item, locale }: { item: RaceAssignment; locale: Locale }) {
  return <><tr><td><div className="race-history-identity"><RaceLogoBadge logoUrl={item.logoUrl} name={item.raceName} fallback={countryFlag(item.countryCode)} size="small" /><span><strong>{item.raceName}</strong><small>{item.organizer || "—"}</small></span></div></td><td><strong>{item.track}</strong><small>{item.address || item.countryCode}</small></td><td>{dateRange(item.startDate, item.endDate, locale)}</td><td>{dateRange(item.departureDate, item.returnDate, locale)}<small>{inclusiveDays(item.departureDate, item.returnDate)} {locale === "cs" ? "dní" : "days"}</small></td><td>{formatVehicles(item.vehicles)}</td><td><RaceStatus value={item.raceStatus} locale={locale} /></td></tr><tr className="mechanic-travel-table-row"><td colSpan={6}><MechanicRaceTravel assignment={item} locale={locale} /></td></tr></>;
}

function MechanicRaceTravel({ assignment, locale, compact = false }: { assignment: RaceAssignment; locale: Locale; compact?: boolean }) {
  const travel = assignment.travel ?? { accommodations: [], flights: [], rentals: [] };
  const total = travel.accommodations.length + travel.flights.length + travel.rentals.length;
  return <section className={`mechanic-race-travel ${compact ? "compact" : ""}`}><header><div><span>MM TRAVEL</span><strong>{assignment.raceName} · {assignment.track}</strong></div><b>{total ? `${total} ${locale === "cs" ? "záznamů" : "records"}` : (locale === "cs" ? "Nezadáno" : "Not entered")}</b></header><div className="mechanic-travel-grid">
    <TravelGroup title={locale === "cs" ? "Ubytování" : "Accommodation"} icon="⌂" empty={locale === "cs" ? "Ubytování nezadáno" : "No accommodation"}>{travel.accommodations.map((item) => <article key={item.id}><strong>{item.name}</strong><span>{item.address || "—"}</span><small>{dateRange(item.checkInDate, item.checkOutDate, locale)}{formatAccommodationRoute(item, locale) ? ` · ${formatAccommodationRoute(item, locale)}` : ""}{item.attachmentCount ? ` · 📎 ${item.attachmentCount}` : ""}</small></article>)}</TravelGroup>
    <TravelGroup title={locale === "cs" ? "Letenky" : "Flights"} icon="✈" empty={locale === "cs" ? "Letenka pro mechanika nezadána" : "No flight for this mechanic"}>{travel.flights.map((item) => <article key={item.id}><strong>{item.departureAirport} {item.direction === "roundtrip" ? "↔" : "→"} {item.arrivalAirport}</strong><div className="mechanic-flight-leg"><b>{item.direction === "return" ? (locale === "cs" ? "Zpět" : "Return") : (locale === "cs" ? "Tam" : "Outbound")}</b><span>{[item.airline, item.flightNumber].filter(Boolean).join(" · ") || "—"}</span><small>{dateTime(item.departureAt, locale)} → {dateTime(item.arrivalAt, locale)}</small></div>{item.direction === "roundtrip" && <div className="mechanic-flight-leg return-leg"><b>{locale === "cs" ? "Zpět" : "Return"}</b><span>{[item.returnAirline, item.returnFlightNumber].filter(Boolean).join(" · ") || "—"}</span><small>{item.returnDepartureAirport} → {item.returnArrivalAirport} · {dateTime(item.returnDepartureAt, locale)} → {dateTime(item.returnArrivalAt, locale)}</small></div>}<p><b>{locale === "cs" ? "Letí:" : "Passengers:"}</b> {item.passengers.length ? item.passengers.map((passenger) => passenger.name).join(", ") : (item.passengersNote || (locale === "cs" ? "společná letenka" : "shared flight"))}{item.attachmentCount ? ` · 📎 ${item.attachmentCount}` : ""}</p></article>)}</TravelGroup>
    <TravelGroup title={locale === "cs" ? "Pronájem auta" : "Car rental"} icon="▰" empty={locale === "cs" ? "Pronájem auta nezadán" : "No car rental"}>{travel.rentals.map((item) => <article key={item.id}><strong>{item.company}</strong><span>{item.pickupPlace} → {item.returnPlace}</span><small>{dateTime(item.pickupAt, locale)} – {dateTime(item.returnAt, locale)}{item.attachmentCount ? ` · 📎 ${item.attachmentCount}` : ""}</small></article>)}</TravelGroup>
  </div></section>;
}

function TravelGroup({ title, icon, empty, children }: { title: string; icon: string; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="mechanic-travel-group"><header><span>{icon}</span><strong>{title}</strong></header><div>{hasChildren ? children : <p className="mechanic-travel-empty">{empty}</p>}</div></section>;
}

function RaceStatus({ value, locale }: { value: RaceAssignment["raceStatus"]; locale: Locale }) {
  const labels = { planned: ["Plánováno", "Planned"], active: ["Probíhá", "Active"], completed: ["Dokončeno", "Completed"] } as const;
  return <span className={`status-pill ${value === "active" ? "success" : value === "planned" ? "info-pill" : "neutral"}`}>{labels[value][locale === "cs" ? 0 : 1]}</span>;
}

function dateOnly(value: string, locale: Locale) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value || "—";
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function dateRange(start: string, end: string, locale: Locale) {
  return start === end ? dateOnly(start, locale) : `${dateOnly(start, locale)} – ${dateOnly(end, locale)}`;
}

function dateTime(value: string, locale: Locale) {
  if (!value) return "—";
  const [date, time] = value.split("T");
  return `${dateOnly(date, locale)} · ${time || "—"}`;
}

function inclusiveDays(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00Z`).getTime();
  const endDate = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(startDate) || !Number.isFinite(endDate) || endDate < startDate) return 0;
  return Math.floor((endDate - startDate) / 86_400_000) + 1;
}

function formatVehicles(value: string) {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean).join(", ") : "—";
}

function formatAccommodationRoute(item: MechanicAccommodation, locale: Locale) {
  const parts: string[] = [];
  if (item.trackDistanceKm !== null) parts.push(`${new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { maximumFractionDigits: 1 }).format(item.trackDistanceKm)} km`);
  if (item.trackDriveMinutes !== null) parts.push(`≈ ${formatDriveMinutes(item.trackDriveMinutes)}`);
  return parts.join(" · ");
}

function formatDriveMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatAssignedDate(value: number, locale: Locale) {
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime()) || Number(value) <= 0) return "—";
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "numeric", year: "numeric" }).format(date);
}
