"use client";

import { useEffect, useState } from "react";
import { countryFlag } from "./countries";
import { RaceLogoBadge } from "./race-logo-badge";
import { vehicleServiceStatus, type VehicleRecord } from "./catalog-pages";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
type Assignment = { raceId: string; raceName: string; raceStatus: "planned" | "active" | "completed"; startDate: string; endDate: string; departureDate: string; returnDate: string; track: string; countryCode: string; logoUrl: string; mechanics: string[]; mechanicsAreSpecific: boolean };
type ServiceEntry = { id: string; serviceDate: string; km: number | null; workDone: string; mechanicId: string | null; mechanicName: string };
type Mechanic = { id: string; name: string };
type DetailData = { vehicle: VehicleRecord; assignments: Assignment[]; serviceEntries: ServiceEntry[]; mechanics: Mechanic[] };

export function VehicleDetail({ vehicleId, locale, role, onBack, onEdit }: { vehicleId: string; locale: Locale; role: Role; onBack: () => void; onEdit: (vehicle: VehicleRecord) => void }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [serviceForm, setServiceForm] = useState<{ mode: "create" } | { mode: "edit"; entry: ServiceEntry } | null>(null);

  async function load() {
    const response = await fetch(`/api/vehicle-records?id=${encodeURIComponent(vehicleId)}`, { cache: "no-store" });
    setData((await response.json()) as DetailData);
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/vehicle-records?id=${encodeURIComponent(vehicleId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => { if (active) setData(result as DetailData); });
    return () => { active = false; };
  }, [vehicleId]);

  if (!data) return <section className="dash-panel empty-state"><span className="spinner" /><p>{locale === "cs" ? "Načítám kartu auta…" : "Loading vehicle card…"}</p></section>;
  const vehicle = data.vehicle;

  async function deleteEntry(entryId: string) {
    const question = locale === "cs" ? "Opravdu chceš tento servisní záznam smazat?" : "Delete this service entry?";
    if (!window.confirm(question)) return;
    const response = await fetch("/api/vehicle-service-entries", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: entryId, vehicleId }),
    });
    if (response.ok) await load();
  }

  return <div className="carb-detail">
    <button className="detail-back" type="button" onClick={onBack}>← {locale === "cs" ? "Zpět na auta" : "Back to vehicles"}</button>
    <section className="dash-panel carb-detail-hero">
      <div className="race-hero-title">
        <RaceLogoBadge logoUrl={vehicle.photoUrl} name={vehicle.name} fallback="⌁" size="large" />
        <div>
          <span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM VEHICLE CARD</span>
          <div className="carb-title-line"><h2>{vehicle.name}</h2></div>
          <p>{vehicle.licensePlate || (locale === "cs" ? "Bez SPZ" : "No plate")}</p>
        </div>
      </div>
      {role !== "mechanic" && <div className="carb-hero-actions"><button className="secondary-compact" type="button" onClick={() => onEdit(vehicle)}>✎ {locale === "cs" ? "Upravit" : "Edit"}</button></div>}
    </section>
    <section className="stats-panel carb-facts">
      <div className="carb-facts-grid cols-4">
        <div className="carb-facts-cell"><small>{locale === "cs" ? "Aktuální nájezd" : "Current mileage"}</small><strong>{formatKm(vehicle.currentKm, locale)}</strong></div>
        <div className="carb-facts-cell"><small>{locale === "cs" ? "Servisní interval" : "Service interval"}</small><strong>{formatKm(vehicle.serviceIntervalKm, locale)}</strong></div>
        <div className="carb-facts-cell"><small>{locale === "cs" ? "Poslední servis při" : "Last service at"}</small><strong>{formatKm(vehicle.lastServiceKm, locale)}</strong>{vehicle.lastServiceDate && <small>{dateOnly(vehicle.lastServiceDate, locale)}</small>}</div>
        <div className="carb-facts-cell"><small>{locale === "cs" ? "Stav" : "Status"}</small><strong><span className={`status-pill ${serviceStatusTone(vehicle)}`}>{serviceStatusLabel(vehicle, locale)}</span></strong></div>
      </div>
      {vehicle.lastServiceNote && <p className="carb-facts-note"><strong>{locale === "cs" ? "Co se dělalo naposledy: " : "Last service work: "}</strong>{vehicle.lastServiceNote}</p>}
    </section>
    <section className="dash-panel carb-record-panel">
      <header><div><span className="eyebrow">RACE HISTORY</span><h3>{locale === "cs" ? "Historie závodů" : "Race history"}</h3><p>{locale === "cs" ? "Kde a s kým bylo auto naposledy na výjezdu." : "Where and with whom the car last travelled."}</p></div></header>
      {data.assignments.length ? <div className="table-wrap"><table className="engine-table race-logo-history-table zebra"><thead><tr><th>{locale === "cs" ? "Závod" : "Race"}</th><th>{locale === "cs" ? "Termín výjezdu" : "Travel dates"}</th><th>{locale === "cs" ? "Mechanici" : "Mechanics"}</th><th>{locale === "cs" ? "Stav" : "Status"}</th></tr></thead><tbody>{data.assignments.map((assignment) => <tr key={assignment.raceId}><td><div className="race-history-identity"><RaceLogoBadge logoUrl={assignment.logoUrl} name={assignment.raceName} fallback={countryFlag(assignment.countryCode)} size="small" /><span><strong>{countryFlag(assignment.countryCode)} {assignment.raceName}</strong><small>{assignment.track}</small></span></div></td><td>{dateRange(assignment.departureDate || assignment.startDate, assignment.returnDate || assignment.endDate, locale)}</td><td>{assignment.mechanics.length ? <>{assignment.mechanics.join(", ")}{!assignment.mechanicsAreSpecific && <small className="cell-note">{locale === "cs" ? "celá posádka" : "whole crew"}</small>}</> : "—"}</td><td><span className={`status-pill ${assignment.raceStatus === "completed" ? "neutral" : "info-pill"}`}>{raceStatusLabel(assignment.raceStatus, locale)}</span></td></tr>)}</tbody></table></div> : <div className="empty-inline"><strong>{locale === "cs" ? "Zatím bez výjezdu" : "No trips yet"}</strong><p>{locale === "cs" ? "Historie se vytvoří automaticky po přiřazení auta k závodu." : "History will be created automatically once the vehicle is assigned to a race."}</p></div>}
    </section>
    <section className="dash-panel carb-record-panel">
      <header><div><span className="eyebrow">SERVICE CARD</span><h3>{locale === "cs" ? "Servisní historie" : "Service history"}</h3><p>{locale === "cs" ? "Všechny zapsané servisy tohoto auta." : "Every logged service for this vehicle."}</p></div><button className="primary-button" type="button" onClick={() => setServiceForm({ mode: "create" })}>＋ {locale === "cs" ? "Přidat servis" : "Add service"}</button></header>
      {data.serviceEntries.length ? <div className="table-wrap"><table className="engine-table zebra"><thead><tr><th>{locale === "cs" ? "Datum" : "Date"}</th><th>{locale === "cs" ? "Nájezd" : "Mileage"}</th><th>{locale === "cs" ? "Provedené práce" : "Work done"}</th><th>{locale === "cs" ? "Mechanik" : "Mechanic"}</th>{role !== "mechanic" && <th className="no-print" />}</tr></thead><tbody>{data.serviceEntries.map((entry) => <tr key={entry.id}><td>{dateOnly(entry.serviceDate, locale)}</td><td>{formatKm(entry.km, locale)}</td><td>{entry.workDone || "—"}</td><td>{entry.mechanicName || "—"}</td>{role !== "mechanic" && <td className="no-print"><div className="record-actions"><button type="button" onClick={() => setServiceForm({ mode: "edit", entry })}>{locale === "cs" ? "Upravit" : "Edit"}</button>{role === "superadmin" && <button className="delete" type="button" onClick={() => void deleteEntry(entry.id)}>{locale === "cs" ? "Smazat" : "Delete"}</button>}</div></td>}</tr>)}</tbody></table></div> : <div className="empty-inline"><strong>{locale === "cs" ? "Zatím bez servisu" : "No service yet"}</strong><p>{locale === "cs" ? "Servisní záznamy se zobrazí po prvním zápisu." : "Service records will appear after the first entry."}</p></div>}
    </section>
    {serviceForm && <AddServiceForm vehicleId={vehicleId} entry={serviceForm.mode === "edit" ? serviceForm.entry : null} mechanics={data.mechanics} locale={locale} onClose={() => setServiceForm(null)} onSaved={async () => { setServiceForm(null); await load(); }} />}
  </div>;
}

function AddServiceForm({ vehicleId, entry, mechanics, locale, onClose, onSaved }: { vehicleId: string; entry: ServiceEntry | null; mechanics: Mechanic[]; locale: Locale; onClose: () => void; onSaved: () => void }) {
  const [serviceDate, setServiceDate] = useState(() => {
    if (entry) return entry.serviceDate;
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  });
  const [km, setKm] = useState(entry?.km != null ? String(entry.km) : "");
  const [workDone, setWorkDone] = useState(entry?.workDone ?? "");
  const [mechanicId, setMechanicId] = useState(entry?.mechanicId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/vehicle-service-entries", {
        method: entry ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry?.id, vehicleId, serviceDate, km, workDone, mechanicId }),
      });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "Save failed");
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true">
      <div className="modal-header"><div><span className="eyebrow">MM DIRECTORY</span><h2>{entry ? (locale === "cs" ? "Upravit servis" : "Edit service") : (locale === "cs" ? "Přidat servis" : "Add service")}</h2></div><button className="close-button" type="button" onClick={onClose}>×</button></div>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label><span>{locale === "cs" ? "Datum servisu" : "Service date"} *</span><input type="date" value={serviceDate} required onChange={(event) => setServiceDate(event.target.value)} /></label>
          <label><span>{locale === "cs" ? "Nájezd při servisu (km)" : "Mileage at service (km)"}</span><input type="number" min={0} step={1} value={km} onChange={(event) => setKm(event.target.value)} /></label>
          <label className="full-field"><span>{locale === "cs" ? "Mechanik" : "Mechanic"}</span><select value={mechanicId} onChange={(event) => setMechanicId(event.target.value)}><option value="">{locale === "cs" ? "Nevybráno" : "Not selected"}</option>{mechanics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="full-field"><span>{locale === "cs" ? "Co bylo provedeno" : "What was done"}</span><textarea value={workDone} onChange={(event) => setWorkDone(event.target.value)} rows={3} placeholder={locale === "cs" ? "Výměna oleje, brzdové destičky…" : "Oil change, brake pads…"} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Uložit servis" : "Save service")}</button></div>
      </form>
    </section>
  </div>;
}

function formatKm(value: number | null | undefined, locale: Locale) {
  if (value == null) return "—";
  return `${value.toLocaleString(locale === "cs" ? "cs-CZ" : "en-GB")} km`;
}

function serviceStatusTone(vehicle: VehicleRecord) {
  const status = vehicleServiceStatus(vehicle);
  if (status === "due") return "danger";
  if (status === "soon") return "warning-pill";
  if (status === "ok") return "success";
  return "neutral";
}

function serviceStatusLabel(vehicle: VehicleRecord, locale: Locale) {
  const status = vehicleServiceStatus(vehicle);
  if (status === "due") return locale === "cs" ? "Servis potřeba" : "Service due";
  if (status === "soon") return locale === "cs" ? "Brzy servis" : "Service soon";
  if (status === "ok") return locale === "cs" ? "Připraveno" : "Ready";
  return locale === "cs" ? "Bez sledování" : "Not tracked";
}

function dateOnly(value: string, locale: Locale) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function dateRange(start: string, end: string, locale: Locale) {
  if (!start || !end) return "—";
  return start === end ? dateOnly(start, locale) : `${dateOnly(start, locale)} – ${dateOnly(end, locale)}`;
}

function raceStatusLabel(status: Assignment["raceStatus"], locale: Locale) {
  const labels = { planned: ["Plánováno", "Planned"], active: ["Probíhá", "Active"], completed: ["Dokončeno", "Completed"] } as const;
  return labels[status][locale === "cs" ? 0 : 1];
}
