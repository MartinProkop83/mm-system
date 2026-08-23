"use client";

import { useEffect, useMemo, useState } from "react";
import { countryFlag } from "./countries";
import type { DriverRecord, TeamRecord } from "./catalog-pages";
import { RaceLogoBadge } from "./race-logo-badge";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
type EntityType = "driver" | "team";
type Subject = DriverRecord | TeamRecord;

type Assignment = {
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
  driverId: string;
  driverName: string;
  teamId: string | null;
  teamName: string;
  category: string;
  engine1Code: string;
  engine1Configuration: string;
  engine2Code: string;
  engine2Configuration: string;
  engine3Code: string;
  engine3Configuration: string;
  carburetor1Code: string;
  carburetor2Code: string;
  carburetor3Code: string;
  basePriceCents: number;
  discountBasisPoints: number;
  finalPriceCents: number;
  currency: "CZK" | "EUR" | "";
  paymentMethod: "" | "cash" | "card" | "bank_transfer";
  isPaid: boolean;
  notes: string;
};

type DetailData = { type: EntityType; subject: Subject; assignments: Assignment[]; canViewFinance: boolean };

export function CompetitionHistoryDetail({ entityType, entityId, locale, role, onBack, onEdit }: { entityType: EntityType; entityId: string; locale: Locale; role: Role; onBack: () => void; onEdit: (subject: Subject) => void }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState(false);
  const [raceFilter, setRaceFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/competition-history?type=${entityType}&id=${encodeURIComponent(entityId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("load failed");
        const result = await response.json() as DetailData;
        if (active) { setData(result); setError(false); }
      } catch {
        if (active) setError(true);
      }
    }
    void load();
    return () => { active = false; };
  }, [entityId, entityType]);

  const nextRaceEntries = useMemo(() => {
    if (!data) return [];
    const today = todayIso();
    const upcoming = data.assignments
      .filter((item) => item.raceStatus !== "completed" && (item.returnDate || item.endDate) >= today)
      .sort((left, right) => left.startDate.localeCompare(right.startDate));
    return upcoming.length ? upcoming.filter((item) => item.raceId === upcoming[0].raceId) : [];
  }, [data]);

  const filteredAssignments = useMemo(() => (data?.assignments ?? []).filter((item) => {
    if (raceFilter !== "all" && item.raceId !== raceFilter) return false;
    if (driverFilter !== "all" && item.driverId !== driverFilter) return false;
    if (currencyFilter !== "all" && item.currency !== currencyFilter) return false;
    if (paymentFilter === "paid" && !item.isPaid) return false;
    if (paymentFilter === "unpaid" && item.isPaid) return false;
    return true;
  }), [currencyFilter, data, driverFilter, paymentFilter, raceFilter]);

  const financeSummaries = useMemo(() => (["CZK", "EUR"] as const).map((currency) => {
    const rows = filteredAssignments.filter((item) => item.currency === currency);
    const total = rows.reduce((sum, item) => sum + Number(item.finalPriceCents), 0);
    const paid = rows.filter((item) => item.isPaid).reduce((sum, item) => sum + Number(item.finalPriceCents), 0);
    return { currency, count: rows.length, total, paid, outstanding: total - paid };
  }).filter((item) => item.count > 0), [filteredAssignments]);

  const teamFinanceBreakdown = useMemo(() => {
    const grouped = new Map<string, { driverId: string; driverName: string; currency: "CZK" | "EUR"; races: Set<string>; total: number; paid: number }>();
    for (const item of filteredAssignments) {
      if (!item.currency) continue;
      const key = `${item.driverId}:${item.currency}`;
      const row = grouped.get(key) ?? { driverId: item.driverId, driverName: item.driverName, currency: item.currency, races: new Set<string>(), total: 0, paid: 0 };
      row.races.add(item.raceId);
      row.total += Number(item.finalPriceCents);
      if (item.isPaid) row.paid += Number(item.finalPriceCents);
      grouped.set(key, row);
    }
    return [...grouped.values()].sort((left, right) => left.driverName.localeCompare(right.driverName) || left.currency.localeCompare(right.currency));
  }, [filteredAssignments]);

  const raceOptions = useMemo(() => {
    const options = new Map<string, { id: string; name: string; startDate: string }>();
    for (const item of data?.assignments ?? []) options.set(item.raceId, { id: item.raceId, name: item.raceName, startDate: item.startDate });
    return [...options.values()].sort((left, right) => right.startDate.localeCompare(left.startDate));
  }, [data]);

  const driverOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const item of data?.assignments ?? []) options.set(item.driverId, item.driverName);
    return [...options].sort((left, right) => left[1].localeCompare(right[1]));
  }, [data]);

  if (error) return <section className="panel empty-state error-state"><b>!</b><p>{locale === "cs" ? "Historii se nepodařilo načíst." : "Could not load the history."}</p><button className="secondary-compact" type="button" onClick={onBack}>{locale === "cs" ? "Zpět" : "Back"}</button></section>;
  if (!data) return <section className="panel empty-state"><span className="spinner" /><p>{locale === "cs" ? "Načítám kompletní historii…" : "Loading complete history…"}</p></section>;

  const isDriver = entityType === "driver";
  const subject = data.subject;
  const driver = isDriver ? subject as DriverRecord : null;
  const team = !isDriver ? subject as TeamRecord : null;
  const races = new Set(data.assignments.map((item) => item.raceId)).size;
  const drivers = new Set(data.assignments.map((item) => item.driverId)).size;
  const categories = new Set(data.assignments.map((item) => item.category).filter(Boolean)).size;
  const engines = uniqueEquipment(data.assignments, "engine").length;
  const carbs = uniqueEquipment(data.assignments, "carburetor").length;
  const nextRace = nextRaceEntries[0] ?? null;
  const filteredRaceCount = new Set(filteredAssignments.map((item) => item.raceId)).size;
  const initials = subject.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  function printCard(pdf: boolean) {
    const previousTitle = document.title;
    document.title = `MM System - ${subject.name} - ${locale === "cs" ? "historie zavodu" : "race history"}`;
    if (pdf) window.alert(locale === "cs" ? "V následujícím okně zvol PDF → Uložit jako PDF." : "In the next window choose PDF → Save as PDF.");
    window.print();
    window.setTimeout(() => { document.title = previousTitle; }, 300);
  }

  return <div className="competition-detail competition-print-area">
    <button className="detail-back no-print" type="button" onClick={onBack}>← {locale === "cs" ? (isDriver ? "Zpět na piloty" : "Zpět na týmy") : (isDriver ? "Back to drivers" : "Back to teams")}</button>
    <section className={`panel competition-detail-hero ${isDriver ? "driver" : "team"}`}>
      <div className="mechanic-avatar competition-avatar">{initials || "MM"}</div>
      <div><span className="eyebrow">{isDriver ? "MM DRIVER CARD" : "MM TEAM CARD"}</span><div className="competition-title-line"><h2>{subject.name}</h2>{driver && <span className={`status-pill ${driver.isActive ? "success" : "neutral"}`}>{driver.isActive ? (locale === "cs" ? "Aktivní" : "Active") : (locale === "cs" ? "Neaktivní" : "Inactive")}</span>}</div><p>{isDriver ? [driver?.teamName, driver?.defaultCategory, driver?.nationality ? `${countryFlag(driver.nationality)} ${driver.nationality}` : ""].filter(Boolean).join(" · ") : [team?.countryCode ? `${countryFlag(team.countryCode)} ${team.countryCode}` : "", locale === "cs" ? "Historie týmu a jeho pilotů" : "Team and driver history"].filter(Boolean).join(" · ")}</p></div>
      <div className="mechanic-hero-actions no-print"><button className="secondary-compact" type="button" onClick={() => printCard(false)}>⌁ {locale === "cs" ? "Vytisknout" : "Print"}</button><button className="secondary-compact pdf-button" type="button" onClick={() => printCard(true)}>PDF {locale === "cs" ? "Uložit PDF" : "Save PDF"}</button>{role !== "mechanic" && <button className="primary-button" type="button" onClick={() => onEdit(subject)}>✎ {locale === "cs" ? "Upravit" : "Edit"}</button>}</div>
    </section>

    <section className="mechanic-stat-grid competition-stat-grid">
      <article className="panel"><span>{locale === "cs" ? "Závodů celkem" : "Total races"}</span><strong>{races}</strong></article>
      <article className="panel"><span>{isDriver ? (locale === "cs" ? "Kategorií" : "Categories") : (locale === "cs" ? "Pilotů" : "Drivers")}</span><strong>{isDriver ? categories : drivers}</strong></article>
      <article className="panel"><span>{locale === "cs" ? "Použitých motorů" : "Engines used"}</span><strong>{engines}</strong></article>
      <article className="panel"><span>{locale === "cs" ? "Použitých karburátorů" : "Carburetors used"}</span><strong>{carbs}</strong></article>
    </section>

    {data.canViewFinance && <section className="panel competition-finance-panel">
      <header><div><span className="eyebrow">MM FINANCE</span><h3>{isDriver ? (locale === "cs" ? "Platby pilota" : "Driver payments") : (locale === "cs" ? "Finance týmu" : "Team finances")}</h3><p>{locale === "cs" ? "Přehled cen závodů, zaplacených částek a neuhrazených plateb." : "Race fees, paid amounts and outstanding payments."}</p></div><strong>{filteredRaceCount}</strong></header>
      <div className="competition-finance-filters no-print">
        <label>{locale === "cs" ? "Závod" : "Race"}<select value={raceFilter} onChange={(event) => setRaceFilter(event.target.value)}><option value="all">{locale === "cs" ? "Všechny závody" : "All races"}</option>{raceOptions.map((item) => <option key={item.id} value={item.id}>{item.name} · {dateOnly(item.startDate, locale)}</option>)}</select></label>
        {!isDriver && <label>{locale === "cs" ? "Pilot" : "Driver"}<select value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)}><option value="all">{locale === "cs" ? "Všichni piloti" : "All drivers"}</option>{driverOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
        <label>{locale === "cs" ? "Měna" : "Currency"}<select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)}><option value="all">{locale === "cs" ? "Obě měny" : "Both currencies"}</option><option value="CZK">CZK</option><option value="EUR">EUR</option></select></label>
        <label>{locale === "cs" ? "Platba" : "Payment"}<select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}><option value="all">{locale === "cs" ? "Všechny platby" : "All payments"}</option><option value="paid">{locale === "cs" ? "Zaplaceno" : "Paid"}</option><option value="unpaid">{locale === "cs" ? "Nezaplaceno" : "Unpaid"}</option></select></label>
      </div>
      {financeSummaries.length ? <div className="competition-finance-summaries">{financeSummaries.map((summary) => <article key={summary.currency}><header><b>{summary.currency}</b><span>{summary.count} {locale === "cs" ? "závodů" : "races"}</span></header><div><span>{locale === "cs" ? "Celkem" : "Total"}</span><strong>{formatMoney(summary.total, summary.currency, locale)}</strong></div><div className="paid"><span>{locale === "cs" ? "Zaplaceno" : "Paid"}</span><strong>{formatMoney(summary.paid, summary.currency, locale)}</strong></div><div className={summary.outstanding > 0 ? "outstanding" : "paid"}><span>{locale === "cs" ? "Zbývá" : "Outstanding"}</span><strong>{formatMoney(summary.outstanding, summary.currency, locale)}</strong></div></article>)}</div> : <div className="empty-inline compact"><strong>{locale === "cs" ? "Pro tento filtr nejsou žádné ceny" : "No fees match these filters"}</strong></div>}
      {!isDriver && teamFinanceBreakdown.length > 0 && <div className="table-wrap competition-team-finance-wrap"><table className="engine-table competition-team-finance-table"><thead><tr><th>{locale === "cs" ? "Pilot" : "Driver"}</th><th>{locale === "cs" ? "Závodů" : "Races"}</th><th>{locale === "cs" ? "Měna" : "Currency"}</th><th>{locale === "cs" ? "Celkem" : "Total"}</th><th>{locale === "cs" ? "Zaplaceno" : "Paid"}</th><th>{locale === "cs" ? "Zbývá" : "Outstanding"}</th></tr></thead><tbody>{teamFinanceBreakdown.map((item) => <tr key={`${item.driverId}-${item.currency}`}><td><strong>{item.driverName}</strong></td><td>{item.races.size}</td><td>{item.currency}</td><td><strong>{formatMoney(item.total, item.currency, locale)}</strong></td><td className="finance-paid">{formatMoney(item.paid, item.currency, locale)}</td><td className={item.total - item.paid > 0 ? "finance-outstanding" : "finance-paid"}>{formatMoney(item.total - item.paid, item.currency, locale)}</td></tr>)}</tbody></table></div>}
    </section>}

    <section className={`panel competition-next-race ${nextRace ? "assigned" : ""}`}>
      <header><div><span className="eyebrow">{locale === "cs" ? "NEJBLIŽŠÍ ZÁVOD" : "NEXT RACE"}</span>{nextRace ? <div className="race-history-identity featured"><RaceLogoBadge logoUrl={nextRace.logoUrl} name={nextRace.raceName} fallback={countryFlag(nextRace.countryCode)} /><span><h3>{nextRace.raceName}</h3><p>{countryFlag(nextRace.countryCode)} {nextRace.track}{nextRace.address ? ` · ${nextRace.address}` : ""} · {dateRange(nextRace.startDate, nextRace.endDate, locale)}</p></span></div> : <h3>{locale === "cs" ? "Žádný plánovaný závod" : "No upcoming race"}</h3>}</div>{nextRace && <RaceStatus value={nextRace.raceStatus} locale={locale} />}</header>
      {nextRace && <div className="competition-next-entries">{nextRaceEntries.map((item) => <article key={item.id}><div><strong>{item.driverName}</strong><span>{item.category}{item.teamName ? ` · ${item.teamName}` : ""}</span></div><EquipmentSlots type="engine" values={[engineHistoryLabel(item.engine1Code, item.engine1Configuration), engineHistoryLabel(item.engine2Code, item.engine2Configuration), engineHistoryLabel(item.engine3Code, item.engine3Configuration)]} locale={locale} /><EquipmentSlots type="carburetor" values={[item.carburetor1Code, item.carburetor2Code, item.carburetor3Code]} locale={locale} /></article>)}</div>}
    </section>

    <section className="panel mechanic-history-panel competition-history-panel">
      <header><div><span className="eyebrow">RACE HISTORY</span><h3>{locale === "cs" ? "Kompletní historie závodů" : "Complete race history"}</h3><p>{locale === "cs" ? "Motory, jejich konfigurace a karburátory zůstávají u každého startu uložené v pozicích 1–3." : "Engines, their configurations and carburetors remain recorded in slots 1–3 for every entry."}</p></div><strong>{filteredRaceCount}</strong></header>
      {filteredAssignments.length ? <div className="table-wrap"><table className="engine-table competition-history-table race-logo-history-table"><thead><tr><th>{locale === "cs" ? "Závod" : "Race"}</th>{!isDriver && <th>{locale === "cs" ? "Pilot" : "Driver"}</th>}<th>{locale === "cs" ? "Kategorie" : "Category"}</th><th>{locale === "cs" ? "Motory 1–3" : "Engines 1–3"}</th><th>{locale === "cs" ? "Karburátory 1–3" : "Carburetors 1–3"}</th>{data.canViewFinance && <th>{locale === "cs" ? "Cena" : "Fee"}</th>}{data.canViewFinance && <th>{locale === "cs" ? "Platba" : "Payment"}</th>}<th>{locale === "cs" ? "Stav" : "Status"}</th></tr></thead><tbody>{filteredAssignments.map((item) => <tr key={item.id}><td><div className="race-history-identity"><RaceLogoBadge logoUrl={item.logoUrl} name={item.raceName} fallback={countryFlag(item.countryCode)} size="small" /><span><strong>{item.raceName}</strong><small>{item.track} · {dateRange(item.startDate, item.endDate, locale)}</small></span></div></td>{!isDriver && <td><strong>{item.driverName}</strong><small>{item.teamName || "—"}</small></td>}<td><strong>{item.category || "—"}</strong></td><td><EquipmentSlots type="engine" values={[engineHistoryLabel(item.engine1Code, item.engine1Configuration), engineHistoryLabel(item.engine2Code, item.engine2Configuration), engineHistoryLabel(item.engine3Code, item.engine3Configuration)]} locale={locale} compact /></td><td><EquipmentSlots type="carburetor" values={[item.carburetor1Code, item.carburetor2Code, item.carburetor3Code]} locale={locale} compact /></td>{data.canViewFinance && <td><strong>{item.currency ? formatMoney(item.finalPriceCents, item.currency, locale) : "—"}</strong>{item.discountBasisPoints > 0 && <small>-{formatDiscount(item.discountBasisPoints)} %</small>}</td>}{data.canViewFinance && <td><span className={`status-pill ${item.isPaid ? "success" : "danger"}`}>{item.isPaid ? (locale === "cs" ? "Zaplaceno" : "Paid") : (locale === "cs" ? "Nezaplaceno" : "Unpaid")}</span><small>{paymentMethodLabel(item.paymentMethod, locale)}</small></td>}<td><RaceStatus value={item.raceStatus} locale={locale} /></td></tr>)}</tbody></table></div> : <div className="empty-inline"><strong>{data.assignments.length ? (locale === "cs" ? "Filtru neodpovídá žádný závod" : "No race matches the filters") : (locale === "cs" ? "Zatím bez závodu" : "No races yet")}</strong><p>{locale === "cs" ? "Historie vznikne automaticky po přiřazení v detailu závodu." : "History is created automatically after an assignment in a race."}</p></div>}
    </section>
    <p className="mechanic-print-footer">MM SYSTEM · MACHÁČ MOTORS · {isDriver ? (locale === "cs" ? "Karta pilota" : "Driver card") : (locale === "cs" ? "Karta týmu" : "Team card")} · {new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB").format(new Date())}</p>
  </div>;
}

function EquipmentSlots({ type, values, locale, compact = false }: { type: "engine" | "carburetor"; values: string[]; locale: Locale; compact?: boolean }) {
  const title = type === "engine" ? (locale === "cs" ? "Motory" : "Engines") : (locale === "cs" ? "Karburátory" : "Carburetors");
  return <div className={`equipment-slot-list ${compact ? "compact" : ""}`}><small>{title}</small><div>{values.map((value, index) => <span className={value ? "filled" : "empty"} key={index}><b>{index + 1}</b>{value || "—"}</span>)}</div></div>;
}

function uniqueEquipment(assignments: Assignment[], type: "engine" | "carburetor") {
  const values = assignments.flatMap((item) => type === "engine" ? [item.engine1Code, item.engine2Code, item.engine3Code] : [item.carburetor1Code, item.carburetor2Code, item.carburetor3Code]);
  return [...new Set(values.filter(Boolean))];
}

function engineHistoryLabel(code: string, configuration: string) {
  if (!code) return "";
  const normalizedConfiguration = configuration.trim();
  return normalizedConfiguration && normalizedConfiguration.toUpperCase() !== code.toUpperCase() ? `${code} · ${normalizedConfiguration}` : code;
}

function formatMoney(cents: number, currency: "CZK" | "EUR", locale: Locale) {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency, maximumFractionDigits: currency === "CZK" ? 0 : 2 }).format(Number(cents || 0) / 100);
}

function formatDiscount(basisPoints: number) {
  return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(Number(basisPoints || 0) / 100);
}

function paymentMethodLabel(value: Assignment["paymentMethod"], locale: Locale) {
  const labels = {
    cash: ["Hotově", "Cash"],
    card: ["Kartou", "Card"],
    bank_transfer: ["Převodem", "Bank transfer"],
    "": ["Bez způsobu platby", "No payment method"],
  } as const;
  return labels[value][locale === "cs" ? 0 : 1];
}

function RaceStatus({ value, locale }: { value: Assignment["raceStatus"]; locale: Locale }) {
  const labels = { planned: ["Plánováno", "Planned"], active: ["Probíhá", "Active"], completed: ["Dokončeno", "Completed"] } as const;
  return <span className={`status-pill ${value === "active" ? "success" : value === "planned" ? "info-pill" : "neutral"}`}>{labels[value]?.[locale === "cs" ? 0 : 1] ?? value}</span>;
}

function dateOnly(value: string, locale: Locale) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value || "—";
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function dateRange(start: string, end: string, locale: Locale) {
  return start === end ? dateOnly(start, locale) : `${dateOnly(start, locale)} – ${dateOnly(end, locale)}`;
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
