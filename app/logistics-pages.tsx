"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { countryFlag } from "./countries";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
export type LogisticsKind = "accommodation" | "flight" | "rental";

export type TravelAttachment = {
  id: string;
  entityType: LogisticsKind;
  entityId: string;
  leg: "general" | "outbound" | "return";
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: number;
  url: string;
};

export type TravelPassenger = { id: string; name: string; kind: "mechanic" | "team" | "other" };

export type LogisticsRace = {
  id: string; name: string; logoUrl: string; calendarColor: string; track: string; countryCode: string;
  startDate: string; endDate: string; departureDate: string; returnDate: string; status: string;
  mechanics: Array<{ id: string; name: string }>;
  vehicles: Array<{ id: string; name: string; licensePlate: string }>;
};

type TravelBase = {
  id: string; raceId: string; raceName: string; raceTrack: string; countryCode: string; reservationCode: string;
  currency: "CZK" | "EUR"; totalCents: number; status: "planned" | "booked" | "cancelled";
  notes: string; attachments: TravelAttachment[];
};

export type AccommodationRecord = TravelBase & {
  name: string; address: string; checkInDate: string; checkOutDate: string; roomCount: number; guestCount: number;
  websiteUrl: string; bookingUrl: string; trackDistanceKm: number | null; trackDriveMinutes: number | null; trackAddress: string;
  paymentStatus: "unpaid" | "partial" | "paid";
};

export type FlightRecord = TravelBase & {
  direction: "outbound" | "return" | "roundtrip" | "other"; departureAirport: string; arrivalAirport: string;
  departureAt: string; arrivalAt: string; airline: string; flightNumber: string; passengersNote: string;
  returnDepartureAirport: string; returnArrivalAirport: string; returnDepartureAt: string; returnArrivalAt: string;
  returnAirline: string; returnFlightNumber: string; returnReservationCode: string;
  passengers: TravelPassenger[]; baggage: string;
};

export type RentalRecord = TravelBase & {
  company: string; vehicleType: string; pickupPlace: string; returnPlace: string; pickupAt: string; returnAt: string;
  licensePlate: string; driverName: string;
};

type TravelRecord = AccommodationRecord | FlightRecord | RentalRecord;
export type LogisticsData = { races: LogisticsRace[]; travelers: TravelPassenger[]; accommodations: AccommodationRecord[]; flights: FlightRecord[]; rentals: RentalRecord[] };
const emptyData: LogisticsData = { races: [], travelers: [], accommodations: [], flights: [], rentals: [] };

export function LogisticsPage({ kind, locale, role }: { kind: LogisticsKind; locale: Locale; role: Role }) {
  const [data, setData] = useState<LogisticsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<TravelRecord | "new" | null>(null);
  const [detail, setDetail] = useState<TravelRecord | null>(null);
  const records = kind === "accommodation" ? data.accommodations : kind === "flight" ? data.flights : data.rentals;
  const canManage = role !== "mechanic";

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/logistics", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      setData((await response.json()) as LogisticsData);
    } finally { setLoading(false); }
  }
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  async function remove(record: TravelRecord) {
    if (role !== "superadmin" || !window.confirm(locale === "cs" ? "Opravdu tento záznam a jeho přílohy odstranit?" : "Remove this record and its attachments?")) return;
    const response = await fetch("/api/logistics", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: kind, id: record.id }) });
    if (!response.ok) return window.alert(locale === "cs" ? "Záznam se nepodařilo odstranit." : "Could not remove the record.");
    setDetail(null); await load();
  }

  const title = kindTitle(kind, locale);
  return <div className="logistics-page">
    <section className="panel logistics-header"><div><span className="eyebrow">MM TRAVEL</span><h2>{title}</h2><p>{kind === "accommodation" ? (locale === "cs" ? "Ubytování, adresy, termíny a všechny rezervační podklady." : "Accommodation, addresses, dates and all booking documents.") : kind === "flight" ? (locale === "cs" ? "Společné i samostatné lety, cestující, boarding passy a rezervace." : "Shared and individual flights, passengers, boarding passes and bookings.") : (locale === "cs" ? "Pronajatá auta, místa převzetí a vrácení včetně příloh." : "Rental cars, pickup and return locations including attachments.")}</p></div><div><strong>{records.length}</strong>{canManage && <button className="primary-button" type="button" onClick={() => setForm("new")}>＋ {locale === "cs" ? "Přidat" : "Add"}</button>}</div></section>
    <section className="panel logistics-card-panel">
      {loading ? <div className="empty-state"><span className="spinner" /><p>{locale === "cs" ? "Načítám…" : "Loading…"}</p></div> : records.length === 0 ? <div className="empty-state"><span className="empty-engine">{kindIcon(kind)}</span><h2>{locale === "cs" ? "Zatím bez záznamů" : "No records yet"}</h2><p>{locale === "cs" ? "První záznam můžeš vytvořit tady nebo přímo v detailu závodu." : "Create the first record here or directly in a race."}</p></div> : <div className="logistics-card-grid">{records.map((record) => <TravelRecordCard key={record.id} kind={kind} record={record} locale={locale} role={role} onOpen={() => setDetail(record)} onEdit={() => setForm(record)} onDelete={() => { void remove(record); }} />)}</div>}
    </section>
    {detail && <TravelDetailModal kind={kind} record={detail} locale={locale} canManage={canManage} onEdit={() => { setDetail(null); setForm(detail); }} onClose={() => setDetail(null)} />}
    {form && <LogisticsForm kind={kind} locale={locale} races={data.races} travelers={data.travelers} record={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await load(); }} />}
  </div>;
}

function TravelRecordCard({ kind, record, locale, role, onOpen, onEdit, onDelete }: { kind: LogisticsKind; record: TravelRecord; locale: Locale; role: Role; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const summary = recordSummary(kind, record, locale);
  return <article className={`logistics-card kind-${kind}`}>
    <button className="logistics-card-open" type="button" onClick={onOpen} aria-label={`${locale === "cs" ? "Otevřít detail" : "Open detail"}: ${summary.title}`}>
      <header><span>{kindIcon(kind)}</span><div><small>{countryFlag(record.countryCode)} {record.raceName} · {record.raceTrack}</small><h3>{summary.title}</h3></div><StatusPill value={record.status} locale={locale} /></header>
      <p>{summary.place}</p><strong>{summary.time}</strong>
      {kind === "flight" && <div className="flight-passenger-line"><small>{locale === "cs" ? "Kdo letí" : "Passengers"}</small><strong>{passengerNames(record as FlightRecord, locale)}</strong></div>}
      <div className="logistics-card-meta"><span>⌁ {kind === "flight" && (record as FlightRecord).direction === "roundtrip" ? [record.reservationCode, (record as FlightRecord).returnReservationCode].filter(Boolean).join(" / ") || (locale === "cs" ? "bez kódu" : "no code") : record.reservationCode || (locale === "cs" ? "bez kódu" : "no code")}</span><span className={record.attachments.length ? "has-files" : ""}>📎 {record.attachments.length} {locale === "cs" ? "příloh" : "files"}</span>{kind === "flight" && <span>👥 {(record as FlightRecord).passengers.length}</span>}</div>
    </button>
    <footer><strong>{money(record.totalCents, record.currency, locale)}</strong>{role !== "mechanic" && <div><button type="button" onClick={onEdit}>{locale === "cs" ? "Upravit" : "Edit"}</button>{role === "superadmin" && <button className="delete" type="button" onClick={onDelete}>{locale === "cs" ? "Smazat" : "Delete"}</button>}</div>}</footer>
  </article>;
}

function StatusPill({ value, locale }: { value: string; locale: Locale }) {
  const label = value === "booked" ? (locale === "cs" ? "Rezervováno" : "Booked") : value === "cancelled" ? (locale === "cs" ? "Zrušeno" : "Cancelled") : (locale === "cs" ? "Plánováno" : "Planned");
  return <em className={`status-pill ${value === "booked" ? "success" : value === "cancelled" ? "neutral" : "info-pill"}`}>{label}</em>;
}

function LogisticsForm({ kind, locale, races, travelers, record, lockedRaceId, onClose, onSaved }: { kind: LogisticsKind; locale: Locale; races: LogisticsRace[]; travelers: TravelPassenger[]; record: TravelRecord | null; lockedRaceId?: string; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const [recordId, setRecordId] = useState(record?.id ?? ""); const [files, setFiles] = useState<File[]>([]); const [returnFiles, setReturnFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<TravelAttachment[]>(record?.attachments ?? []);
  const flight = kind === "flight" ? record as FlightRecord | null : null;
  const accommodation = kind === "accommodation" ? record as AccommodationRecord | null : null;
  const rental = kind === "rental" ? record as RentalRecord | null : null;
  const passengerOptions = useMemo(() => mergePassengers(travelers, flight?.passengers ?? []), [travelers, flight?.passengers]);
  const [selectedPassengers, setSelectedPassengers] = useState<string[]>(flight?.passengers.map((item) => item.id) ?? []);
  const [flightDirection, setFlightDirection] = useState<FlightRecord["direction"]>(flight?.direction ?? "outbound");
  const [selectedRaceId, setSelectedRaceId] = useState(lockedRaceId ?? record?.raceId ?? "");
  const [accommodationName, setAccommodationName] = useState(accommodation?.name ?? "");
  const [accommodationAddress, setAccommodationAddress] = useState(accommodation?.address ?? "");
  const [trackDistanceKm, setTrackDistanceKm] = useState<number | null>(accommodation?.trackDistanceKm ?? null);
  const [trackDriveMinutes, setTrackDriveMinutes] = useState<number | null>(accommodation?.trackDriveMinutes ?? null);
  const [locatingAccommodation, setLocatingAccommodation] = useState(false);
  const selectedRace = races.find((race) => race.id === selectedRaceId);

  function invalidateAccommodationRoute() {
    setTrackDistanceKm(null);
    setTrackDriveMinutes(null);
  }

  async function locateAccommodation(quiet = false) {
    if (!selectedRaceId || !accommodationAddress.trim()) {
      if (!quiet) setError(locale === "cs" ? "Nejdřív vyber závod a vyplň přesnou adresu ubytování." : "Select a race and enter the exact accommodation address first.");
      return null;
    }
    setLocatingAccommodation(true);
    if (!quiet) setError("");
    try {
      const response = await fetch("/api/accommodation-distance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raceId: selectedRaceId, name: accommodationName, address: accommodationAddress }) });
      const result = await response.json() as { travel?: { distanceKm: number; driveMinutes: number }; error?: string };
      if (!response.ok || !result.travel) throw new Error(result.error || "Route calculation failed");
      setTrackDistanceKm(result.travel.distanceKm);
      setTrackDriveMinutes(result.travel.driveMinutes);
      return result.travel;
    } catch (routeError) {
      if (!quiet) setError(localizeLogisticsError(routeError instanceof Error ? routeError.message : "Route calculation failed", locale));
      return null;
    } finally { setLocatingAccommodation(false); }
  }

  async function deleteAttachment(attachment: TravelAttachment) {
    if (!window.confirm(locale === "cs" ? `Odstranit přílohu ${attachment.fileName}?` : `Remove ${attachment.fileName}?`)) return;
    const response = await fetch("/api/logistics-attachments", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: attachment.id }) });
    if (!response.ok) return setError(locale === "cs" ? "Přílohu se nepodařilo odstranit." : "Could not remove the attachment.");
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const passengers = passengerOptions.filter((item) => selectedPassengers.includes(item.id));
    try {
      const raceId = lockedRaceId ?? selectedRaceId;
      const calculatedTravel = kind === "accommodation" && (trackDistanceKm === null || trackDriveMinutes === null) ? await locateAccommodation(true) : null;
      const response = await fetch("/api/logistics", { method: recordId ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, type: kind, id: recordId || undefined, raceId, passengers, trackDistanceKm: calculatedTravel?.distanceKm ?? trackDistanceKm ?? "", trackDriveMinutes: calculatedTravel?.driveMinutes ?? trackDriveMinutes ?? "" }) });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "Save failed");
      setRecordId(result.id);
      const uploadFiles = async (selectedFiles: File[], leg: TravelAttachment["leg"]) => {
        if (!selectedFiles.length) return;
        const upload = new FormData(); upload.set("entityType", kind); upload.set("entityId", result.id!); upload.set("leg", leg); selectedFiles.forEach((file) => upload.append("files", file));
        const uploadResponse = await fetch("/api/logistics-attachments", { method: "POST", body: upload });
        const uploadResult = await uploadResponse.json() as { error?: string };
        if (!uploadResponse.ok) throw new Error(uploadResult.error || "Upload failed");
      };
      await uploadFiles(files, kind === "flight" ? (flightDirection === "return" ? "return" : "outbound") : "general");
      if (files.length) setFiles([]);
      if (kind === "flight" && flightDirection === "roundtrip") {
        await uploadFiles(returnFiles, "return");
        if (returnFiles.length) setReturnFiles([]);
      }
      onSaved();
    } catch (saveError) { setError(localizeLogisticsError(saveError instanceof Error ? saveError.message : "Save failed", locale)); setSaving(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal logistics-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">MM TRAVEL</span><h2>{recordId ? (locale === "cs" ? "Upravit" : "Edit") : (locale === "cs" ? "Nový záznam" : "New record")} · {kindTitle(kind, locale).toLocaleLowerCase(locale === "cs" ? "cs" : "en")}</h2></div><button className="close-button" type="button" onClick={onClose}>×</button></div><form onSubmit={submit}><div className="form-grid">
    {lockedRaceId ? <div className="form-readonly full-field"><span>{locale === "cs" ? "Závod a termín" : "Race and dates"}</span><strong>{raceFormLabel(races.find((race) => race.id === lockedRaceId), locale)}</strong></div> : <label className="full-field"><span>{locale === "cs" ? "Závod a termín" : "Race and dates"} *</span><select name="raceId" required autoFocus value={selectedRaceId} onChange={(event) => { setSelectedRaceId(event.target.value); if (kind === "accommodation") invalidateAccommodationRoute(); }}><option value="">{locale === "cs" ? "Vyber závod…" : "Select race…"}</option>{races.map((race) => <option key={race.id} value={race.id}>{raceFormLabel(race, locale)}</option>)}</select></label>}
    {kind === "accommodation" ? <>
      <label><span>{locale === "cs" ? "Název ubytování" : "Accommodation name"} *</span><input name="name" required value={accommodationName} onChange={(event) => { setAccommodationName(event.target.value); invalidateAccommodationRoute(); }} /></label><label><span>{locale === "cs" ? "Místo / adresa" : "Location / address"} *</span><input name="address" required value={accommodationAddress} onChange={(event) => { setAccommodationAddress(event.target.value); invalidateAccommodationRoute(); }} /></label>
      <label><span>{locale === "cs" ? "Web ubytování" : "Accommodation website"}</span><input name="websiteUrl" inputMode="url" placeholder="https://hotel…" defaultValue={accommodation?.websiteUrl ?? ""} /></label><label><span>{locale === "cs" ? "Odkaz na Booking" : "Booking link"}</span><input name="bookingUrl" inputMode="url" placeholder="https://booking.com/…" defaultValue={accommodation?.bookingUrl ?? ""} /></label>
      <label><span>Check-in *</span><input type="date" name="checkInDate" required defaultValue={accommodation?.checkInDate ?? ""} /></label><label><span>Check-out *</span><input type="date" name="checkOutDate" required defaultValue={accommodation?.checkOutDate ?? ""} /></label>
      <label><span>{locale === "cs" ? "Počet pokojů" : "Rooms"}</span><input type="number" min="0" name="roomCount" defaultValue={accommodation?.roomCount ?? 0} /></label><label><span>{locale === "cs" ? "Počet osob" : "Guests"}</span><input type="number" min="0" name="guestCount" defaultValue={accommodation?.guestCount ?? 0} /></label>
      <label><span>{locale === "cs" ? "Číslo rezervace" : "Booking number"}</span><input name="reservationCode" defaultValue={accommodation?.reservationCode ?? ""} /></label><label><span>{locale === "cs" ? "Platba" : "Payment"}</span><select name="paymentStatus" defaultValue={accommodation?.paymentStatus ?? "unpaid"}><option value="unpaid">{locale === "cs" ? "Nezaplaceno" : "Unpaid"}</option><option value="partial">{locale === "cs" ? "Částečně" : "Partially paid"}</option><option value="paid">{locale === "cs" ? "Zaplaceno" : "Paid"}</option></select></label>
      <section className="accommodation-route-box full-field"><header><div><span>{locale === "cs" ? "CESTA Z UBYTOVÁNÍ" : "TRIP FROM ACCOMMODATION"}</span><strong>{locale === "cs" ? "Vzdálenost na trať" : "Distance to circuit"}</strong><small>{selectedRace ? `${selectedRace.name} · ${selectedRace.track}` : (locale === "cs" ? "Vyber závod" : "Select a race")}</small></div><button className="secondary-compact" type="button" disabled={locatingAccommodation} onClick={() => { void locateAccommodation(); }}>{locatingAccommodation ? (locale === "cs" ? "Počítám…" : "Calculating…") : (locale === "cs" ? "Spočítat podle adresy" : "Calculate from address")}</button></header><div><label><span>{locale === "cs" ? "Vzdálenost (km)" : "Distance (km)"}</span><input name="trackDistanceKm" type="number" min="0" step="0.1" value={trackDistanceKm ?? ""} onChange={(event) => setTrackDistanceKm(event.target.value === "" ? null : Number(event.target.value))} /></label><label><span>{locale === "cs" ? "Doba jízdy (min)" : "Drive time (min)"}</span><input name="trackDriveMinutes" type="number" min="0" step="1" value={trackDriveMinutes ?? ""} onChange={(event) => setTrackDriveMinutes(event.target.value === "" ? null : Number(event.target.value))} /></label></div><p>{trackDistanceKm !== null || trackDriveMinutes !== null ? <><b>{trackDistanceKm !== null ? `${formatDecimal(trackDistanceKm, locale)} km` : "—"}</b>{trackDriveMinutes !== null ? ` · ≈ ${formatDriveMinutes(trackDriveMinutes, locale)}` : ""}</> : (locale === "cs" ? "Po uložení se vzdálenost zkusí dopočítat automaticky." : "The distance will also be calculated automatically when saved.")}</p></section>
    </> : kind === "flight" ? <>
      <label className="full-field"><span>{locale === "cs" ? "Typ cesty" : "Trip type"}</span><select name="direction" value={flightDirection} onChange={(event) => setFlightDirection(event.target.value as FlightRecord["direction"])}><option value="outbound">{locale === "cs" ? "Tam" : "Outbound"}</option><option value="return">{locale === "cs" ? "Zpět" : "Return"}</option><option value="roundtrip">{locale === "cs" ? "Tam i zpět" : "Round trip"}</option><option value="other">{locale === "cs" ? "Jiný" : "Other"}</option></select></label>
      <fieldset className="travel-flight-leg full-field"><legend>{flightDirection === "return" ? (locale === "cs" ? "Cesta zpět" : "Return journey") : (locale === "cs" ? "Cesta tam" : "Outbound journey")}</legend><div className="travel-flight-leg-grid">
        <label><span>{locale === "cs" ? "Odletové letiště" : "Departure airport"} *</span><input name="departureAirport" required defaultValue={flight?.departureAirport ?? ""} placeholder="PRG" /></label><label><span>{locale === "cs" ? "Příletové letiště" : "Arrival airport"} *</span><input name="arrivalAirport" required defaultValue={flight?.arrivalAirport ?? ""} placeholder="MXP" /></label>
        <label><span>{locale === "cs" ? "Odlet" : "Departure"} *</span><input type="datetime-local" name="departureAt" required defaultValue={flight?.departureAt ?? ""} /></label><label><span>{locale === "cs" ? "Přílet" : "Arrival"} *</span><input type="datetime-local" name="arrivalAt" required defaultValue={flight?.arrivalAt ?? ""} /></label>
        <label><span>{locale === "cs" ? "Aerolinka" : "Airline"}</span><input name="airline" defaultValue={flight?.airline ?? ""} /></label><label><span>{locale === "cs" ? "Číslo letu" : "Flight number"}</span><input name="flightNumber" defaultValue={flight?.flightNumber ?? ""} /></label>
        <label className="full-field"><span>{flightDirection === "return" ? (locale === "cs" ? "Rezervační kód – cesta zpět" : "Booking code – return journey") : (locale === "cs" ? "Rezervační kód – cesta tam" : "Booking code – outbound journey")}</span><input name="reservationCode" defaultValue={flight?.reservationCode ?? ""} /></label>
      </div></fieldset>
      {flightDirection === "roundtrip" && <fieldset className="travel-flight-leg return-leg full-field"><legend>{locale === "cs" ? "Cesta zpět" : "Return journey"}</legend><div className="travel-flight-leg-grid">
        <label><span>{locale === "cs" ? "Odletové letiště zpět" : "Return departure airport"} *</span><input name="returnDepartureAirport" required defaultValue={flight?.returnDepartureAirport || flight?.arrivalAirport || ""} placeholder="MXP" /></label><label><span>{locale === "cs" ? "Příletové letiště zpět" : "Return arrival airport"} *</span><input name="returnArrivalAirport" required defaultValue={flight?.returnArrivalAirport || flight?.departureAirport || ""} placeholder="PRG" /></label>
        <label><span>{locale === "cs" ? "Odlet zpět" : "Return departure"} *</span><input type="datetime-local" name="returnDepartureAt" required defaultValue={flight?.returnDepartureAt ?? ""} /></label><label><span>{locale === "cs" ? "Přílet zpět" : "Return arrival"} *</span><input type="datetime-local" name="returnArrivalAt" required defaultValue={flight?.returnArrivalAt ?? ""} /></label>
        <label><span>{locale === "cs" ? "Aerolinka zpět" : "Return airline"}</span><input name="returnAirline" defaultValue={flight?.returnAirline || flight?.airline || ""} /></label><label><span>{locale === "cs" ? "Číslo letu zpět" : "Return flight number"}</span><input name="returnFlightNumber" defaultValue={flight?.returnFlightNumber ?? ""} /></label>
        <label className="full-field"><span>{locale === "cs" ? "Rezervační kód – cesta zpět" : "Booking code – return journey"}</span><input name="returnReservationCode" defaultValue={flight?.returnReservationCode ?? ""} /></label>
      </div></fieldset>}
      <fieldset className="travel-passenger-picker full-field"><legend>{locale === "cs" ? "Kdo letí" : "Passengers"}</legend><div>{passengerOptions.map((passenger) => <label key={passenger.id}><input type="checkbox" checked={selectedPassengers.includes(passenger.id)} onChange={(event) => setSelectedPassengers((current) => event.target.checked ? [...current, passenger.id] : current.filter((id) => id !== passenger.id))} /><span>{passenger.name}</span><small>{passenger.kind === "mechanic" ? (locale === "cs" ? "Mechanik" : "Mechanic") : (locale === "cs" ? "Člen týmu" : "Team member")}</small></label>)}</div>{!passengerOptions.length && <p>{locale === "cs" ? "Nejdřív přidej mechaniky nebo uživatele týmu." : "Add mechanics or team users first."}</p>}</fieldset>
      <label><span>{locale === "cs" ? "Další cestující / poznámka" : "Other passengers / note"}</span><input name="passengersNote" defaultValue={flight?.passengersNote ?? ""} placeholder={locale === "cs" ? "Např. Piero letí samostatně" : "E.g. Piero travels separately"} /></label><label><span>{locale === "cs" ? "Zavazadla" : "Baggage"}</span><input name="baggage" defaultValue={flight?.baggage ?? ""} /></label>
    </> : <>
      <label><span>{locale === "cs" ? "Společnost / půjčovna" : "Rental company"} *</span><input name="company" required defaultValue={rental?.company ?? ""} /></label><label><span>{locale === "cs" ? "Typ auta" : "Vehicle type"}</span><input name="vehicleType" defaultValue={rental?.vehicleType ?? ""} placeholder={locale === "cs" ? "Dodávka, osobní auto…" : "Van, car…"} /></label>
      <label><span>{locale === "cs" ? "Místo převzetí" : "Pickup place"} *</span><input name="pickupPlace" required defaultValue={rental?.pickupPlace ?? ""} /></label><label><span>{locale === "cs" ? "Kde se auto vrací" : "Return location"} *</span><input name="returnPlace" required defaultValue={rental?.returnPlace ?? ""} /></label>
      <label><span>{locale === "cs" ? "Převzetí" : "Pickup"} *</span><input type="datetime-local" name="pickupAt" required defaultValue={rental?.pickupAt ?? ""} /></label><label><span>{locale === "cs" ? "Vrácení" : "Return"} *</span><input type="datetime-local" name="returnAt" required defaultValue={rental?.returnAt ?? ""} /></label>
      <label><span>{locale === "cs" ? "Rezervační kód" : "Booking code"}</span><input name="reservationCode" defaultValue={rental?.reservationCode ?? ""} /></label><label><span>{locale === "cs" ? "SPZ" : "License plate"}</span><input name="licensePlate" defaultValue={rental?.licensePlate ?? ""} /></label><label><span>{locale === "cs" ? "Hlavní řidič" : "Main driver"}</span><input name="driverName" defaultValue={rental?.driverName ?? ""} /></label>
    </>}
    <label><span>{locale === "cs" ? "Cena celkem" : "Total price"}</span><input name="total" inputMode="decimal" defaultValue={record ? (record.totalCents / 100).toFixed(2) : ""} /></label><label><span>{locale === "cs" ? "Měna" : "Currency"}</span><select name="currency" defaultValue={record?.currency ?? "EUR"}><option>EUR</option><option>CZK</option></select></label>
    <label><span>{locale === "cs" ? "Stav" : "Status"}</span><select name="status" defaultValue={record?.status ?? "planned"}><option value="planned">{locale === "cs" ? "Plánováno" : "Planned"}</option><option value="booked">{locale === "cs" ? "Rezervováno" : "Booked"}</option><option value="cancelled">{locale === "cs" ? "Zrušeno" : "Cancelled"}</option></select></label>
    <label className="full-field"><span>{locale === "cs" ? "Poznámky / výjimky" : "Notes / exceptions"}</span><textarea name="notes" rows={3} defaultValue={record?.notes ?? ""} /></label>
    {kind === "flight" ? <>
      <AttachmentUploadField title={flightDirection === "return" ? (locale === "cs" ? "Přílohy – cesta zpět" : "Attachments – return journey") : (locale === "cs" ? "Přílohy – cesta tam" : "Attachments – outbound journey")} files={files} setFiles={setFiles} attachments={attachments.filter((item) => item.leg === (flightDirection === "return" ? "return" : "outbound"))} locale={locale} onDelete={deleteAttachment} />
      {flightDirection === "roundtrip" && <AttachmentUploadField title={locale === "cs" ? "Přílohy – cesta zpět" : "Attachments – return journey"} files={returnFiles} setFiles={setReturnFiles} attachments={attachments.filter((item) => item.leg === "return")} locale={locale} onDelete={deleteAttachment} />}
      {attachments.some((item) => item.leg === "general") && <section className="travel-attachment-section legacy full-field"><span>{locale === "cs" ? "Dřívější společné přílohy" : "Earlier shared attachments"}</span><small>{locale === "cs" ? "Přílohy uložené před rozdělením letu na cestu tam a zpět." : "Files saved before the flight was split into outbound and return journeys."}</small><AttachmentGallery attachments={attachments.filter((item) => item.leg === "general")} locale={locale} canDelete onDelete={(attachment) => { void deleteAttachment(attachment); }} /></section>}
    </> : <AttachmentUploadField title={locale === "cs" ? "Přílohy" : "Attachments"} files={files} setFiles={setFiles} attachments={attachments} locale={locale} onDelete={deleteAttachment} />}
  </div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Uložit včetně příloh" : "Save with attachments")}</button></div></form></section></div>;
}

export function RaceLogisticsPanel({ raceId, locale, role }: { raceId: string; locale: Locale; role: Role }) {
  const [data, setData] = useState<LogisticsData>(emptyData);
  const [form, setForm] = useState<{ kind: LogisticsKind; record: TravelRecord | null } | null>(null);
  const [detail, setDetail] = useState<{ kind: LogisticsKind; record: TravelRecord } | null>(null);
  const canManage = role !== "mechanic";
  async function load() { const response = await fetch(`/api/logistics?raceId=${encodeURIComponent(raceId)}`, { cache: "no-store" }); if (response.ok) setData((await response.json()) as LogisticsData); }
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [raceId]);
  return <section className="panel race-travel-panel"><header><div><span className="eyebrow">MM TRAVEL</span><h3>{locale === "cs" ? "Cesta a ubytování" : "Travel & accommodation"}</h3><p>{locale === "cs" ? "Kliknutím otevřeš všechny časy, místa, cestující a přílohy." : "Click to open all times, locations, passengers and attachments."}</p></div>{canManage && <div><button className="secondary-compact" type="button" onClick={() => setForm({ kind: "accommodation", record: null })}>＋ {locale === "cs" ? "Ubytování" : "Accommodation"}</button><button className="secondary-compact" type="button" onClick={() => setForm({ kind: "flight", record: null })}>＋ {locale === "cs" ? "Letenka" : "Flight"}</button><button className="secondary-compact" type="button" onClick={() => setForm({ kind: "rental", record: null })}>＋ {locale === "cs" ? "Pronájem auta" : "Car rental"}</button></div>}</header><div className="race-travel-grid"><RaceTravelGroup kind="accommodation" records={data.accommodations} locale={locale} onOpen={(record) => setDetail({ kind: "accommodation", record })} /><RaceTravelGroup kind="flight" records={data.flights} locale={locale} onOpen={(record) => setDetail({ kind: "flight", record })} /><RaceTravelGroup kind="rental" records={data.rentals} locale={locale} onOpen={(record) => setDetail({ kind: "rental", record })} /></div>
    {detail && <TravelDetailModal kind={detail.kind} record={detail.record} locale={locale} canManage={canManage} onEdit={() => { setForm({ kind: detail.kind, record: detail.record }); setDetail(null); }} onClose={() => setDetail(null)} />}
    {form && <LogisticsForm kind={form.kind} locale={locale} races={data.races} travelers={data.travelers} record={form.record} lockedRaceId={raceId} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await load(); }} />}
  </section>;
}

function RaceTravelGroup({ kind, records, locale, onOpen }: { kind: LogisticsKind; records: TravelRecord[]; locale: Locale; onOpen: (record: TravelRecord) => void }) {
  return <section className={`race-travel-group kind-${kind}`}><header><span>{kindIcon(kind)}</span><strong>{kindTitle(kind, locale)}</strong><b>{records.length}</b></header>{records.length ? <div>{records.map((record) => { const summary = recordSummary(kind, record, locale); const accommodation = kind === "accommodation" ? record as AccommodationRecord : null; return <button className="race-travel-entry" type="button" key={record.id} onClick={() => onOpen(record)}><span><b>{summary.title}</b><small>{accommodation?.address || summary.place}</small>{accommodation && (accommodation.trackDistanceKm !== null || accommodation.trackDriveMinutes !== null) && <div className="race-accommodation-trip"><span>{locale === "cs" ? "NA TRAŤ" : "TO CIRCUIT"}</span>{accommodation.trackDriveMinutes !== null && <strong>≈ {formatDriveMinutes(accommodation.trackDriveMinutes, locale)}</strong>}{accommodation.trackDistanceKm !== null && <small>{formatDecimal(accommodation.trackDistanceKm, locale)} km</small>}</div>}{kind === "flight" && <em><b>{locale === "cs" ? "Letí:" : "Passengers:"}</b> {passengerNames(record as FlightRecord, locale)}</em>}</span><strong>{summary.time}</strong><em className={record.attachments.length ? "has-files" : ""}>📎 {record.attachments.length}</em><i>›</i></button>; })}</div> : <p>{locale === "cs" ? "Zatím nezadané" : "Not entered"}</p>}</section>;
}

function TravelDetailModal({ kind, record, locale, canManage, onEdit, onClose }: { kind: LogisticsKind; record: TravelRecord; locale: Locale; canManage: boolean; onEdit: () => void; onClose: () => void }) {
  const fields = detailFields(kind, record, locale);
  const flight = kind === "flight" ? record as FlightRecord : null;
  const accommodation = kind === "accommodation" ? record as AccommodationRecord : null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal travel-detail-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">MM TRAVEL · {kindTitle(kind, locale).toLocaleUpperCase(locale === "cs" ? "cs" : "en")}</span><h2>{recordSummary(kind, record, locale).title}</h2><p>{countryFlag(record.countryCode)} {record.raceName} · {record.raceTrack}</p></div><button className="close-button" type="button" onClick={onClose}>×</button></div><div className="travel-detail-grid">{fields.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value || "—"}</strong></div>)}</div>{accommodation && <AccommodationLinks item={accommodation} locale={locale} />}{flight && <section className="travel-detail-passengers"><h3>{locale === "cs" ? "Cestující" : "Passengers"}</h3>{flight.passengers.length ? <div>{flight.passengers.map((passenger) => <span key={passenger.id}>✓ {passenger.name}</span>)}</div> : <p>{locale === "cs" ? "Bez vybraných členů týmu" : "No team members selected"}</p>}{flight.passengersNote && <p>{flight.passengersNote}</p>}</section>}{record.notes && <section className="travel-detail-notes"><small>{locale === "cs" ? "Poznámka" : "Notes"}</small><p>{record.notes}</p></section>}<section className="travel-detail-files"><h3>{locale === "cs" ? "Přílohy a náhledy" : "Attachments and previews"}</h3><AttachmentSections attachments={record.attachments} direction={flight?.direction} locale={locale} /></section><div className="modal-actions"><span className="modal-actions-spacer" />{canManage && <button className="secondary-compact" type="button" onClick={onEdit}>{locale === "cs" ? "Upravit záznam" : "Edit record"}</button>}<button className="primary-button" type="button" onClick={onClose}>{locale === "cs" ? "Zavřít" : "Close"}</button></div></section></div>;
}

function AccommodationLinks({ item, locale }: { item: AccommodationRecord; locale: Locale }) {
  const directionsUrl = accommodationDirectionsUrl(item);
  if (!item.websiteUrl && !item.bookingUrl && !directionsUrl) return null;
  return <section className="travel-detail-links"><h3>{locale === "cs" ? "Odkazy a cesta" : "Links and route"}</h3><div>{directionsUrl && <a href={directionsUrl} target="_blank" rel="noreferrer">⌖ {locale === "cs" ? "Trasa na trať" : "Directions to circuit"}</a>}{item.websiteUrl && <a href={item.websiteUrl} target="_blank" rel="noreferrer">↗ {locale === "cs" ? "Web ubytování" : "Accommodation website"}</a>}{item.bookingUrl && <a href={item.bookingUrl} target="_blank" rel="noreferrer">B {locale === "cs" ? "Otevřít Booking" : "Open Booking"}</a>}</div></section>;
}

function AttachmentUploadField({ title, files, setFiles, attachments, locale, onDelete }: { title: string; files: File[]; setFiles: (files: File[]) => void; attachments: TravelAttachment[]; locale: Locale; onDelete: (attachment: TravelAttachment) => Promise<void> }) {
  return <section className="travel-upload-field travel-attachment-section full-field"><span>{title}</span><label><input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /><b>＋ {locale === "cs" ? "Vybrat PDF nebo obrázky" : "Select PDFs or images"}</b></label><small>{locale === "cs" ? "Můžeš přidat více rezervací, boarding passů a screenshotů najednou. Maximálně 15 MB na soubor." : "Add multiple bookings, boarding passes and screenshots at once. Maximum 15 MB per file."}</small>{files.length > 0 && <div className="travel-selected-files">{files.map((file, index) => <span key={`${file.name}-${index}`}>📎 {file.name}<button type="button" onClick={() => setFiles(files.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}{attachments.length > 0 && <AttachmentGallery attachments={attachments} locale={locale} canDelete onDelete={(attachment) => { void onDelete(attachment); }} />}</section>;
}

function AttachmentSections({ attachments, direction, locale }: { attachments: TravelAttachment[]; direction?: FlightRecord["direction"]; locale: Locale }) {
  if (!direction) return <AttachmentGallery attachments={attachments} locale={locale} />;
  const sections: Array<{ leg: TravelAttachment["leg"]; title: string }> = [];
  if (attachments.some((item) => item.leg === "general")) sections.push({ leg: "general", title: locale === "cs" ? "Společné / dřívější přílohy" : "Shared / earlier attachments" });
  if (direction !== "return") sections.push({ leg: "outbound", title: locale === "cs" ? "Cesta tam" : "Outbound journey" });
  if (direction === "return" || direction === "roundtrip") sections.push({ leg: "return", title: locale === "cs" ? "Cesta zpět" : "Return journey" });
  if (!sections.length) sections.push({ leg: "outbound", title: locale === "cs" ? "Přílohy letu" : "Flight attachments" });
  return <div className="travel-attachment-sections">{sections.map((section) => <section key={section.leg}><h4>{section.title}</h4><AttachmentGallery attachments={attachments.filter((item) => item.leg === section.leg)} locale={locale} /></section>)}</div>;
}

function AttachmentGallery({ attachments, locale, canDelete = false, onDelete }: { attachments: TravelAttachment[]; locale: Locale; canDelete?: boolean; onDelete?: (attachment: TravelAttachment) => void }) {
  if (!attachments.length) return <p className="travel-files-empty">{locale === "cs" ? "Zatím bez příloh" : "No attachments yet"}</p>;
  return <div className="travel-attachment-grid">{attachments.map((attachment) => <article key={attachment.id}><a href={attachment.url} target="_blank" rel="noreferrer">{attachment.contentType.startsWith("image/") ? <img src={attachment.url} alt={attachment.fileName} /> : <span className="travel-pdf-preview"><b>PDF</b><small>{locale === "cs" ? "Otevřít dokument" : "Open document"}</small></span>}<strong>{attachment.fileName}</strong><small>{formatFileSize(attachment.sizeBytes, locale)}</small></a>{canDelete && <button type="button" onClick={() => onDelete?.(attachment)}>×</button>}</article>)}</div>;
}

function recordSummary(kind: LogisticsKind, record: TravelRecord, locale: Locale) {
  if (kind === "accommodation") { const item = record as AccommodationRecord; return { title: item.name, place: [item.address, formatAccommodationRoute(item, locale)].filter(Boolean).join(" · ") || "—", time: dateRange(item.checkInDate, item.checkOutDate, locale) }; }
  if (kind === "flight") { const item = record as FlightRecord; const roundtrip = item.direction === "roundtrip"; return { title: `${item.departureAirport} ${roundtrip ? "↔" : "→"} ${item.arrivalAirport}`, place: roundtrip ? `${locale === "cs" ? "Tam" : "Out"}: ${[item.airline, item.flightNumber].filter(Boolean).join(" · ") || "—"} · ${locale === "cs" ? "Zpět" : "Back"}: ${[item.returnAirline, item.returnFlightNumber].filter(Boolean).join(" · ") || "—"}` : ([item.airline, item.flightNumber].filter(Boolean).join(" · ") || directionLabel(item.direction, locale)), time: roundtrip ? `${locale === "cs" ? "Tam" : "Out"}: ${dateTime(item.departureAt, locale)} · ${locale === "cs" ? "Zpět" : "Back"}: ${dateTime(item.returnDepartureAt, locale)}` : `${dateTime(item.departureAt, locale)} → ${dateTime(item.arrivalAt, locale)}` }; }
  const item = record as RentalRecord; return { title: item.company, place: `${item.pickupPlace} → ${item.returnPlace}`, time: `${dateTime(item.pickupAt, locale)} – ${dateTime(item.returnAt, locale)}` };
}

function detailFields(kind: LogisticsKind, record: TravelRecord, locale: Locale): Array<[string, string]> {
  const common: Array<[string, string]> = [[locale === "cs" ? "Rezervační kód" : "Booking code", record.reservationCode], [locale === "cs" ? "Cena" : "Price", money(record.totalCents, record.currency, locale)], [locale === "cs" ? "Stav" : "Status", statusText(record.status, locale)]];
  if (kind === "accommodation") { const item = record as AccommodationRecord; return [[locale === "cs" ? "Název" : "Name", item.name], [locale === "cs" ? "Místo / adresa" : "Location / address", item.address], [locale === "cs" ? "Cesta na trať" : "Trip to circuit", formatAccommodationRoute(item, locale)], ["Check-in", dateOnly(item.checkInDate, locale)], ["Check-out", dateOnly(item.checkOutDate, locale)], [locale === "cs" ? "Pokoje / hosté" : "Rooms / guests", `${item.roomCount} / ${item.guestCount}`], [locale === "cs" ? "Platba" : "Payment", paymentLabel(item.paymentStatus, locale)], ...common]; }
  if (kind === "flight") { const item = record as FlightRecord; const mainIsReturn = item.direction === "return"; const mainCs = mainIsReturn ? "Cesta zpět" : "Cesta tam"; const mainEn = mainIsReturn ? "Return" : "Outbound"; const fields: Array<[string, string]> = [[locale === "cs" ? "Typ cesty" : "Trip type", directionLabel(item.direction, locale)], [`${locale === "cs" ? mainCs : mainEn} – ${locale === "cs" ? "odlet" : "departure"}`, `${item.departureAirport} · ${dateTime(item.departureAt, locale)}`], [`${locale === "cs" ? mainCs : mainEn} – ${locale === "cs" ? "přílet" : "arrival"}`, `${item.arrivalAirport} · ${dateTime(item.arrivalAt, locale)}`], [`${locale === "cs" ? mainCs : mainEn} – ${locale === "cs" ? "aerolinka / let" : "airline / flight"}`, [item.airline, item.flightNumber].filter(Boolean).join(" · ")], [`${locale === "cs" ? mainCs : mainEn} – ${locale === "cs" ? "rezervační kód" : "booking code"}`, item.reservationCode]]; if (item.direction === "roundtrip") fields.push([locale === "cs" ? "Cesta zpět – odlet" : "Return – departure", `${item.returnDepartureAirport} · ${dateTime(item.returnDepartureAt, locale)}`], [locale === "cs" ? "Cesta zpět – přílet" : "Return – arrival", `${item.returnArrivalAirport} · ${dateTime(item.returnArrivalAt, locale)}`], [locale === "cs" ? "Cesta zpět – aerolinka / let" : "Return – airline / flight", [item.returnAirline, item.returnFlightNumber].filter(Boolean).join(" · ")], [locale === "cs" ? "Cesta zpět – rezervační kód" : "Return – booking code", item.returnReservationCode]); return [...fields, [locale === "cs" ? "Zavazadla" : "Baggage", item.baggage], ...common.slice(1)]; }
  const item = record as RentalRecord; return [[locale === "cs" ? "Společnost" : "Company", item.company], [locale === "cs" ? "Vozidlo / SPZ" : "Vehicle / plate", [item.vehicleType, item.licensePlate].filter(Boolean).join(" · ")], [locale === "cs" ? "Převzetí" : "Pickup", `${item.pickupPlace} · ${dateTime(item.pickupAt, locale)}`], [locale === "cs" ? "Vrácení" : "Return", `${item.returnPlace} · ${dateTime(item.returnAt, locale)}`], [locale === "cs" ? "Hlavní řidič" : "Main driver", item.driverName], ...common];
}

function mergePassengers(...groups: TravelPassenger[][]) { const map = new Map<string, TravelPassenger>(); groups.flat().forEach((item) => map.set(item.id, item)); return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "cs")); }
function kindTitle(kind: LogisticsKind, locale: Locale) { return kind === "accommodation" ? (locale === "cs" ? "Ubytování" : "Accommodation") : kind === "flight" ? (locale === "cs" ? "Letenky" : "Flights") : (locale === "cs" ? "Pronájem aut" : "Car rental"); }
function kindIcon(kind: LogisticsKind) { return kind === "accommodation" ? "⌂" : kind === "flight" ? "✈" : "▰"; }
function raceFormLabel(race: LogisticsRace | undefined, locale: Locale) { if (!race) return "—"; const start = compactFormDate(race.startDate, locale); const end = compactFormDate(race.endDate, locale); return `${countryFlag(race.countryCode)} ${race.name} · ${race.track} · ${start === end ? start : `${start}–${end}`}`; }
function compactFormDate(value: string, locale: Locale) { const [year, month, day] = value.split("-"); if (!year || !month || !day) return value || "—"; return locale === "cs" ? `${day}.${month}.${year}` : `${day}/${month}/${year}`; }
function statusText(value: string, locale: Locale) { return value === "booked" ? (locale === "cs" ? "Rezervováno" : "Booked") : value === "cancelled" ? (locale === "cs" ? "Zrušeno" : "Cancelled") : (locale === "cs" ? "Plánováno" : "Planned"); }
function dateRange(start: string, end: string, locale: Locale) { return `${dateOnly(start, locale)} – ${dateOnly(end, locale)}`; }
function dateOnly(value: string, locale: Locale) { if (!value) return "—"; const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day)); }
function dateTime(value: string, locale: Locale) { if (!value) return "—"; const [date, time] = value.split("T"); return `${dateOnly(date, locale)} · ${time || "—"}`; }
function money(cents: number, currency: string, locale: Locale) { return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency }).format(cents / 100); }
function paymentLabel(value: AccommodationRecord["paymentStatus"], locale: Locale) { if (value === "paid") return locale === "cs" ? "Zaplaceno" : "Paid"; if (value === "partial") return locale === "cs" ? "Částečně zaplaceno" : "Partially paid"; return locale === "cs" ? "Nezaplaceno" : "Unpaid"; }
function directionLabel(value: FlightRecord["direction"], locale: Locale) { if (value === "outbound") return locale === "cs" ? "Let tam" : "Outbound"; if (value === "return") return locale === "cs" ? "Let zpět" : "Return"; if (value === "roundtrip") return locale === "cs" ? "Tam i zpět" : "Round trip"; return locale === "cs" ? "Další let" : "Other flight"; }
function passengerNames(flight: FlightRecord, locale: Locale) { return flight.passengers.length ? flight.passengers.map((passenger) => passenger.name).join(", ") : (flight.passengersNote || (locale === "cs" ? "Nikdo není vybrán" : "No one selected")); }
function formatFileSize(bytes: number, locale: Locale) { if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`; return `${new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`; }
function formatDecimal(value: number, locale: Locale) { return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { maximumFractionDigits: 1 }).format(value); }
function formatDriveMinutes(value: number, locale: Locale) { const hours = Math.floor(value / 60); const minutes = Math.round(value % 60); if (!hours) return `${minutes} min`; return minutes ? `${hours} h ${minutes} min` : `${hours} h`; }
function formatAccommodationRoute(item: AccommodationRecord, locale: Locale) { const parts: string[] = []; if (item.trackDistanceKm !== null) parts.push(`${formatDecimal(item.trackDistanceKm, locale)} km`); if (item.trackDriveMinutes !== null) parts.push(`≈ ${formatDriveMinutes(item.trackDriveMinutes, locale)}`); return parts.join(" · "); }
function accommodationDirectionsUrl(item: AccommodationRecord) { const origin = item.address.trim(); const destination = (item.trackAddress || item.raceTrack).trim(); if (!origin || !destination) return ""; const url = new URL("https://www.google.com/maps/dir/"); url.search = new URLSearchParams({ api: "1", origin, destination }).toString(); return url.toString(); }
function localizeLogisticsError(error: string, locale: Locale) { if (locale === "en") return error; const messages: Record<string, string> = { "Race not found": "Vyber platný závod.", "Accommodation, location, check-in and check-out are required": "Vyplň ubytování, místo, příjezd a odjezd.", "Check-out must be after check-in": "Check-out musí být po check-inu.", "Accommodation links must use HTTP or HTTPS": "Odkazy na ubytování musí být platné webové adresy.", "Race and accommodation address are required": "Nejdřív vyber závod a vyplň přesnou adresu ubytování.", "Accommodation location could not be determined": "Adresu ubytování se nepodařilo najít. Zkontroluj ji nebo vzdálenost doplň ručně.", "Circuit location could not be determined": "Polohu tratě se nepodařilo určit. Zkontroluj adresu tratě.", "Route to circuit could not be calculated": "Cestu z ubytování na trať se nepodařilo spočítat. Hodnoty můžeš doplnit ručně.", "Route calculation failed": "Výpočet cesty se nepodařil. Zkus to znovu nebo hodnoty doplň ručně.", "Flight route and times are required": "Vyplň trasu a časy letu.", "Arrival must be after departure": "Přílet musí být po odletu.", "Return flight route and times are required": "Vyplň trasu a časy zpátečního letu.", "Return flight must be after outbound arrival": "Zpáteční let musí začít po příletu cesty tam a přílet zpět musí být po odletu.", "Rental company, places and times are required": "Vyplň půjčovnu, místa a časy převzetí a vrácení.", "Rental return must be after pickup": "Vrácení musí být později než převzetí.", "Files must be PDF, PNG, JPG or WebP": "Přílohy musí být PDF, PNG, JPG nebo WebP.", "One of the files is larger than 15 MB": "Některý soubor je větší než 15 MB." }; return messages[error] ?? error; }
