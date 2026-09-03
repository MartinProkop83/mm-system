"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogData } from "./catalog-pages";
import { SaleForm, paymentMethodLabel, saleItemDescription, type EngineChoice, type SaleRecord } from "./sales-page";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
type RaceInfo = { id: string; name: string; startDate: string; endDate: string; track: string; status: "planned" | "active" | "completed" };

const emptyCatalog: CatalogData = { raceTypes: [], teams: [], drivers: [], mechanics: [], vehicles: [], carburetors: [] };

export function RaceSalesPanel({ race, locale, role }: { race: RaceInfo; locale: Locale; role: Role }) {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [engines, setEngines] = useState<EngineChoice[]>([]);
  const [catalog, setCatalog] = useState<CatalogData>(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<SaleRecord | "new" | null>(null);
  const canManage = role !== "mechanic" && (race.status !== "completed" || role === "superadmin");

  async function load() {
    setLoading(true);
    try {
      const [salesResponse, enginesResponse, catalogResponse] = await Promise.all([
        fetch(`/api/sales?raceId=${encodeURIComponent(race.id)}`, { cache: "no-store" }),
        fetch("/api/engines", { cache: "no-store" }),
        fetch("/api/catalog", { cache: "no-store" }),
      ]);
      if (!salesResponse.ok || !enginesResponse.ok || !catalogResponse.ok) throw new Error("load failed");
      setSales(((await salesResponse.json()) as { sales: SaleRecord[] }).sales);
      setEngines(((await enginesResponse.json()) as { engines: EngineChoice[] }).engines);
      setCatalog((await catalogResponse.json()) as CatalogData);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [race.id]);

  async function voidSale(sale: SaleRecord) {
    if (role !== "superadmin" || sale.voidedAt) return;
    const confirmed = window.confirm(locale === "cs" ? `Opravdu stornovat objednávku ${sale.saleNumber}?` : `Void order ${sale.saleNumber}?`);
    if (!confirmed) return;
    const response = await fetch("/api/sales", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sale.id }) });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      window.alert(result.error || (locale === "cs" ? "Objednávku se nepodařilo stornovat." : "Could not void order."));
      return;
    }
    await load();
  }

  const activeSales = sales.filter((sale) => !sale.voidedAt);
  const totals = useMemo(() => (["CZK", "EUR"] as const).map((currency) => ({ currency, cents: activeSales.filter((sale) => sale.currency === currency).reduce((sum, sale) => sum + sale.totalCents, 0) })).filter((total) => total.cents > 0), [sales]);
  const unpaidCount = activeSales.filter((sale) => !sale.isPaid).length;
  const undeliveredCount = activeSales.filter((sale) => !sale.isDelivered).length;

  return <>
    <section className="dash-panel race-sales-panel race-sales-print-page">
      <header className="race-sales-header">
        <div className="race-sales-title"><img src="/machac-motors-logo.jpg" alt="Macháč Motors" /><div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM SALES · RACE</span><h2>{locale === "cs" ? "Prodej a servis na závodě" : "Race sales and service"}</h2><p>{race.name} · {race.track} · {formatRaceDates(race.startDate, race.endDate, locale)}</p></div></div>
        <div className="race-sales-summary"><span>{activeSales.length} {locale === "cs" ? "objednávek" : "orders"}</span>{totals.map((total) => <strong key={total.currency}>{formatMoney(total.cents, total.currency, locale)}</strong>)}{undeliveredCount > 0 && <em>{undeliveredCount} {locale === "cs" ? "nepředáno" : "not delivered"}</em>}{unpaidCount > 0 && <em>{unpaidCount} {locale === "cs" ? "nezaplaceno" : "unpaid"}</em>}</div>
        {canManage && <button className="primary-button no-print" type="button" onClick={() => setEditing("new")}>＋ {locale === "cs" ? "Nová objednávka" : "New order"}</button>}
      </header>

      {loading && <div className="race-sales-state"><span className="spinner" /> {locale === "cs" ? "Načítám objednávky…" : "Loading orders…"}</div>}
      {!loading && error && <div className="race-sales-state error-state">{locale === "cs" ? "Objednávky se nepodařilo načíst." : "Could not load orders."}</div>}
      {!loading && !error && activeSales.length === 0 && <div className="race-sales-empty no-print"><strong>{locale === "cs" ? "Zatím bez objednávek" : "No orders yet"}</strong><p>{locale === "cs" ? "Přidej zákazníka, více dílů nebo servis do jedné objednávky. Součet se vypočítá automaticky." : "Add a customer, multiple items or service to one order. The total is calculated automatically."}</p>{canManage && <button className="secondary-compact" type="button" onClick={() => setEditing("new")}>＋ {locale === "cs" ? "Přidat první objednávku" : "Add first order"}</button>}</div>}

      {!loading && !error && activeSales.length > 0 && <div className="race-order-list">{activeSales.map((sale) => <article className="race-order" key={sale.id}>
        <header><div><span>{sale.saleNumber}</span><h3>{sale.customerName}</h3>{sale.documentNumber && <small>{locale === "cs" ? "Doklad" : "Document"}: {sale.documentNumber}</small>}</div><div className="race-order-status"><b className={sale.isDelivered ? "done" : "open"}>{sale.isDelivered ? "✓ " : "○ "}{sale.isDelivered ? (locale === "cs" ? "Předáno" : "Delivered") : (locale === "cs" ? "Nepředáno" : "Not delivered")}</b><b className={sale.isPaid ? "done" : "open"}>{sale.isPaid ? "✓ " : "○ "}{sale.isPaid ? (locale === "cs" ? "Zaplaceno" : "Paid") : (locale === "cs" ? "Nezaplaceno" : "Unpaid")}</b></div></header>
        <div className="race-order-lines">{sale.items.map((item, index) => { const description = saleItemDescription(item, locale); return <div key={item.id ?? index}><span>{item.quantity}×</span><strong>{item.code || description}</strong>{item.code && description !== item.code && <small>{description}</small>}<span>{formatMoney(item.unitPriceCents, sale.currency, locale)} / ks</span><b>{formatMoney(item.quantity * item.unitPriceCents, sale.currency, locale)}</b></div>; })}</div>
        <footer><div><small>{formatDate(sale.saleDate, locale)} · {paymentMethodLabel(sale.paymentMethod, locale)}</small>{sale.notes && <p>{sale.notes}</p>}</div><strong><small>{locale === "cs" ? "Celkem" : "Total"}</small>{formatMoney(sale.totalCents, sale.currency, locale)}</strong>{canManage && <div className="race-order-actions no-print"><button type="button" onClick={() => setEditing(sale)}>{locale === "cs" ? "Upravit" : "Edit"}</button>{role === "superadmin" && <button className="delete" type="button" onClick={() => { void voidSale(sale); }}>{locale === "cs" ? "Stornovat" : "Void"}</button>}</div>}</footer>
      </article>)}</div>}

      <div className="race-order-print-blank"><strong>{locale === "cs" ? "Objednávka doplněná ručně" : "Order added by hand"}</strong><div>{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div><footer><span>{locale === "cs" ? "Předáno" : "Delivered"}: □</span><span>{locale === "cs" ? "Zaplaceno" : "Paid"}: □</span><strong>{locale === "cs" ? "Celkem" : "Total"}: __________</strong></footer></div>
    </section>
    {editing && <SaleForm locale={locale} sale={editing === "new" ? null : editing} engines={engines} catalog={catalog} raceId={race.id} raceLabel={`${race.name} · ${race.track}`} initialDate={race.startDate} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
  </>;
}

function formatMoney(cents: number, currency: "CZK" | "EUR", locale: Locale) {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency, minimumFractionDigits: currency === "CZK" ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function formatDate(value: string, locale: Locale) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB").format(new Date(year, month - 1, day));
}

function formatRaceDates(start: string, end: string, locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const parse = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
  return start === end ? formatter.format(parse(start)) : `${formatter.format(parse(start))} – ${formatter.format(parse(end))}`;
}
