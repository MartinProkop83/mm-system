"use client";

import { useEffect, useMemo, useState } from "react";
import { countryFlag } from "./countries";
import { RaceLogoBadge } from "./race-logo-badge";
import { formatCount, type PluralForms } from "./pluralize";
import { EmptyState, LoadingState } from "./empty-state";

const DRIVER_FORMS: PluralForms = { cs: ["pilot", "piloti", "pilotů"], en: ["driver", "drivers"] };
const SALE_FORMS: PluralForms = { cs: ["prodej", "prodeje", "prodejů"], en: ["sale", "sales"] };
const DELIVERY_FORMS: PluralForms = { cs: ["předávka", "předávky", "předávek"], en: ["delivery", "deliveries"] };
const RECORD_FORMS: PluralForms = { cs: ["záznam", "záznamy", "záznamů"], en: ["record", "records"] };
const ORDER_FORMS: PluralForms = { cs: ["objednávka", "objednávky", "objednávek"], en: ["order", "orders"] };

type Locale = "cs" | "en";
type Currency = "CZK" | "EUR";
type PaymentMethod = "" | "cash" | "card" | "bank_transfer";

type RaceInfo = {
  id: string;
  name: string;
  logoUrl: string;
  track: string;
  countryCode: string;
  startDate: string;
  endDate: string;
};

type FinanceEntry = {
  raceEntryId: string;
  raceId: string;
  category: string;
  driverId: string;
  driverName: string;
  teamName: string;
  basePriceCents: number;
  basePriceInput: string;
  currency: Currency;
  discountBasisPoints: number;
  discountInput: string;
  finalPriceCents: number;
  paymentMethod: PaymentMethod;
  isPaid: boolean;
  notes: string;
  updatedBy: string;
  updatedAt: number | null;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string;
};

type FinanceApiEntry = Omit<FinanceEntry, "basePriceInput" | "discountInput" | "dirty" | "saving" | "saved" | "error">;

type RaceSalesTotal = {
  currency: Currency;
  saleCount: number;
  totalCents: number;
  paidCents: number;
};

type RaceFinanceSaleItem = {
  id: string;
  saleId: string;
  itemType: string;
  code: string;
  description: string;
  descriptionEn?: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

type RaceFinanceVisit = {
  id: string;
  teamName: string;
  driverName: string;
  itemType: string;
  description: string;
  visitDate: string;
  mechanicName: string;
  currency: Currency;
  amountCents: number | null;
  isPaid: boolean;
  notes: string;
};

type RaceFinanceDelivery = {
  id: string;
  customerName: string;
  description: string;
  quantity: number;
  currency: Currency;
  amountCents: number;
  isPaid: boolean;
  isDelivered: boolean;
};

type RaceFinanceSale = {
  id: string;
  saleNumber: string;
  saleDate: string;
  customerName: string;
  documentNumber: string;
  currency: Currency;
  totalCents: number;
  paymentMethod: string;
  isPaid: boolean;
  isDelivered: boolean;
  notes: string;
  items: RaceFinanceSaleItem[];
};

export function RaceFinancePanel({ race, locale, onOpenSales, onOpenVisits }: { race: RaceInfo; locale: Locale; onOpenSales?: () => void; onOpenVisits?: () => void }) {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [salesTotals, setSalesTotals] = useState<RaceSalesTotal[]>([]);
  const [raceSales, setRaceSales] = useState<RaceFinanceSale[]>([]);
  const [travelCosts, setTravelCosts] = useState<Array<{ currency: Currency; cents: number }>>([]);
  const [visits, setVisits] = useState<RaceFinanceVisit[]>([]);
  const [deliveries, setDeliveries] = useState<RaceFinanceDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/race-finance?raceId=${encodeURIComponent(race.id)}`, { cache: "no-store" });
      const result = await response.json() as { entries?: FinanceApiEntry[]; salesTotals?: RaceSalesTotal[]; sales?: RaceFinanceSale[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Load failed");
      setEntries((result.entries ?? []).map(toEditableEntry));
      setSalesTotals((result.salesTotals ?? []).map((total) => ({
        currency: total.currency,
        saleCount: Number(total.saleCount),
        totalCents: Number(total.totalCents),
        paidCents: Number(total.paidCents),
      })));
      setRaceSales((result.sales ?? []).map((sale) => ({
        ...sale,
        currency: sale.currency === "EUR" ? "EUR" : "CZK",
        totalCents: Number(sale.totalCents),
        isPaid: Boolean(sale.isPaid),
        isDelivered: Boolean(sale.isDelivered),
        items: (sale.items ?? []).map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitPriceCents: Number(item.unitPriceCents),
          lineTotalCents: Number(item.lineTotalCents),
        })),
      })));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadTravelCosts() {
    try {
      const response = await fetch(`/api/logistics?raceId=${encodeURIComponent(race.id)}`, { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as { accommodations?: Array<{ currency: Currency; totalCents: number; status: string }>; flights?: Array<{ currency: Currency; totalCents: number; status: string }>; rentals?: Array<{ currency: Currency; totalCents: number; status: string }> };
      const records = [...(result.accommodations ?? []), ...(result.flights ?? []), ...(result.rentals ?? [])].filter((item) => item.status !== "cancelled");
      const totals = new Map<Currency, number>();
      for (const record of records) totals.set(record.currency, (totals.get(record.currency) ?? 0) + Number(record.totalCents));
      setTravelCosts([...totals].map(([currency, cents]) => ({ currency, cents })));
    } catch {
      setTravelCosts([]);
    }
  }

  async function loadVisits() {
    try {
      const response = await fetch(`/api/race-team-visits?raceId=${encodeURIComponent(race.id)}`, { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as { visits?: RaceFinanceVisit[] };
      setVisits((result.visits ?? []).map((visit) => ({ ...visit, amountCents: visit.amountCents === null ? null : Number(visit.amountCents), isPaid: Boolean(visit.isPaid) })));
    } catch {
      setVisits([]);
    }
  }

  async function loadDeliveries() {
    try {
      const response = await fetch(`/api/race-deliveries?raceId=${encodeURIComponent(race.id)}`, { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as { deliveries?: RaceFinanceDelivery[] };
      setDeliveries((result.deliveries ?? []).map((delivery) => ({ ...delivery, amountCents: Number(delivery.amountCents), isPaid: Boolean(delivery.isPaid), isDelivered: Boolean(delivery.isDelivered) })));
    } catch {
      setDeliveries([]);
    }
  }

  useEffect(() => { void load(); void loadTravelCosts(); void loadVisits(); void loadDeliveries(); }, [race.id]);

  const visitTotals = useMemo(() => {
    const totals = new Map<Currency, { cents: number; paidCents: number; count: number }>();
    for (const visit of visits) {
      if (visit.amountCents === null) continue;
      const current = totals.get(visit.currency) ?? { cents: 0, paidCents: 0, count: 0 };
      totals.set(visit.currency, { cents: current.cents + visit.amountCents, paidCents: current.paidCents + (visit.isPaid ? visit.amountCents : 0), count: current.count + 1 });
    }
    return [...totals].map(([currency, value]) => ({ currency, ...value }));
  }, [visits]);

  const deliveryTotals = useMemo(() => {
    const totals = new Map<Currency, { cents: number; paidCents: number; count: number }>();
    for (const delivery of deliveries) {
      const current = totals.get(delivery.currency) ?? { cents: 0, paidCents: 0, count: 0 };
      totals.set(delivery.currency, { cents: current.cents + delivery.amountCents, paidCents: current.paidCents + (delivery.isPaid ? delivery.amountCents : 0), count: current.count + 1 });
    }
    return [...totals].map(([currency, value]) => ({ currency, ...value }));
  }, [deliveries]);

  function update(entryId: string, change: Partial<FinanceEntry>) {
    setEntries((current) => current.map((entry) => {
      if (entry.raceEntryId !== entryId) return entry;
      const next = { ...entry, ...change, dirty: true, saved: false, error: "" };
      const basePriceCents = parseMoney(next.basePriceInput);
      const discountBasisPoints = parseDiscount(next.discountInput);
      return {
        ...next,
        basePriceCents: basePriceCents ?? 0,
        discountBasisPoints: discountBasisPoints ?? 0,
        finalPriceCents: calculateFinal(basePriceCents ?? 0, discountBasisPoints ?? 0),
      };
    }));
  }

  async function save(entry: FinanceEntry) {
    const basePriceCents = parseMoney(entry.basePriceInput);
    const discountBasisPoints = parseDiscount(entry.discountInput);
    if (basePriceCents === null || discountBasisPoints === null) {
      setEntries((current) => current.map((item) => item.raceEntryId === entry.raceEntryId ? { ...item, error: locale === "cs" ? "Zkontroluj cenu a slevu 0–100 %." : "Check the price and 0–100% discount." } : item));
      return;
    }
    setEntries((current) => current.map((item) => item.raceEntryId === entry.raceEntryId ? { ...item, saving: true, error: "" } : item));
    try {
      const response = await fetch("/api/race-finance", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raceId: race.id, raceEntryId: entry.raceEntryId, basePriceCents, currency: entry.currency, discountBasisPoints, paymentMethod: entry.paymentMethod, isPaid: entry.isPaid, notes: entry.notes }),
      });
      const result = await response.json() as Partial<FinanceApiEntry> & { error?: string };
      if (!response.ok) throw new Error(result.error || "Save failed");
      setEntries((current) => current.map((item) => item.raceEntryId === entry.raceEntryId ? {
        ...item,
        basePriceCents: Number(result.basePriceCents ?? basePriceCents),
        discountBasisPoints: Number(result.discountBasisPoints ?? discountBasisPoints),
        finalPriceCents: Number(result.finalPriceCents ?? calculateFinal(basePriceCents, discountBasisPoints)),
        updatedBy: String(result.updatedBy ?? item.updatedBy),
        updatedAt: Number(result.updatedAt ?? Date.now()),
        dirty: false,
        saving: false,
        saved: true,
      } : item));
      window.setTimeout(() => setEntries((current) => current.map((item) => item.raceEntryId === entry.raceEntryId ? { ...item, saved: false } : item)), 2200);
    } catch (error) {
      setEntries((current) => current.map((item) => item.raceEntryId === entry.raceEntryId ? { ...item, saving: false, error: financeError(error instanceof Error ? error.message : "Save failed", locale) } : item));
    }
  }

  function printFinance() {
    const previousTitle = document.title;
    document.body.dataset.printMode = "finance";
    document.title = financePrintTitle(race);
    window.print();
    window.setTimeout(() => {
      delete document.body.dataset.printMode;
      document.title = previousTitle;
    }, 500);
  }

  const summaries = useMemo(() => (["EUR", "CZK"] as const).map((currency) => {
    const currencyEntries = entries.filter((entry) => entry.currency === currency);
    const sales = salesTotals.find((total) => total.currency === currency);
    const base = currencyEntries.reduce((sum, entry) => sum + entry.basePriceCents, 0);
    const raceFees = currencyEntries.reduce((sum, entry) => sum + entry.finalPriceCents, 0);
    const salesTotal = sales?.totalCents ?? 0;
    const visits = visitTotals.find((item) => item.currency === currency);
    const visitsTotal = visits?.cents ?? 0;
    const deliveriesEntry = deliveryTotals.find((item) => item.currency === currency);
    const deliveriesTotal = deliveriesEntry?.cents ?? 0;
    const grandTotal = raceFees + salesTotal + visitsTotal + deliveriesTotal;
    const paidRaceFees = currencyEntries.filter((entry) => entry.isPaid).reduce((sum, entry) => sum + entry.finalPriceCents, 0);
    const paid = paidRaceFees + (sales?.paidCents ?? 0) + (visits?.paidCents ?? 0) + (deliveriesEntry?.paidCents ?? 0);
    const costs = travelCosts.find((item) => item.currency === currency)?.cents ?? 0;
    return { currency, count: currencyEntries.length, saleCount: sales?.saleCount ?? 0, visitCount: visits?.count ?? 0, deliveryCount: deliveriesEntry?.count ?? 0, base, discount: base - raceFees, raceFees, salesTotal, visitsTotal, deliveriesTotal, grandTotal, paid, unpaid: grandTotal - paid, costs, net: grandTotal - costs };
  }).filter((summary) => summary.count > 0 || summary.saleCount > 0 || summary.visitCount > 0 || summary.deliveryCount > 0 || summary.costs > 0), [entries, salesTotals, travelCosts, visitTotals, deliveryTotals]);

  return <section className="dash-panel race-finance-panel">
    <header className="race-finance-heading">
      <div className="race-finance-title"><RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="large" /><div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM FINANCE</span><h2>{locale === "cs" ? "Finance závodu" : "Race finance"}</h2><p>{race.name} · {formatDateRange(race.startDate, race.endDate, locale)} · {countryFlag(race.countryCode)} {race.track}</p></div></div>
      <img className="race-finance-logo" src="/machac-motors-logo.jpg" alt="Macháč Motors" />
      <button className="secondary-compact no-print" type="button" onClick={printFinance}>⌁ {locale === "cs" ? "Vytisknout finance" : "Print finance"}</button>
    </header>

    <p className="race-finance-vat-note">{locale === "cs" ? "Všechny ceny jsou bez DPH. Prodeje přidané k tomuto závodu jsou započítané do celku; stornované prodeje se nepočítají. EUR a CZK zůstávají odděleně." : "All prices exclude VAT. Sales linked to this race are included in the total; voided sales are excluded. EUR and CZK remain separate."}</p>

    <div className="race-finance-summaries">
      {summaries.map((summary) => <article key={summary.currency}>
        <header><strong>{summary.currency}</strong><span>{formatCount(summary.count, locale, DRIVER_FORMS)} · {formatCount(summary.saleCount, locale, SALE_FORMS)} · {formatCount(summary.deliveryCount, locale, DELIVERY_FORMS)}</span></header>
        <div><span>{locale === "cs" ? "Před slevou" : "Before discount"}</span><b>{formatMoney(summary.base, summary.currency, locale)}</b></div>
        <div><span>{locale === "cs" ? "Slevy" : "Discounts"}</span><b>− {formatMoney(summary.discount, summary.currency, locale)}</b></div>
        <div><span>{locale === "cs" ? "Piloti po slevě" : "Drivers after discount"}</span><b>{formatMoney(summary.raceFees, summary.currency, locale)}</b></div>
        <div className="finance-summary-sales"><span>{locale === "cs" ? "Prodej" : "Sales"}</span><b>{formatMoney(summary.salesTotal, summary.currency, locale)}</b></div>
        <div className="finance-summary-visits"><span>{locale === "cs" ? "Jiné týmy" : "Other teams"}</span><b>{formatMoney(summary.visitsTotal, summary.currency, locale)}</b></div>
        <div className="finance-summary-deliveries"><span>{locale === "cs" ? "Předávky" : "Deliveries"}</span><b>{formatMoney(summary.deliveriesTotal, summary.currency, locale)}</b></div>
        <div className="finance-summary-total"><span>{locale === "cs" ? "Celkem závod" : "Race total"}</span><b>{formatMoney(summary.grandTotal, summary.currency, locale)}</b></div>
        <div className="finance-summary-paid"><span>{locale === "cs" ? "Zaplaceno" : "Paid"}</span><b>{formatMoney(summary.paid, summary.currency, locale)}</b></div>
        <div className={`finance-summary-unpaid ${summary.unpaid > 0 ? "has-outstanding" : "all-clear"}`}><span>{locale === "cs" ? "Zbývá" : "Outstanding"}</span><b>{formatMoney(summary.unpaid, summary.currency, locale)}</b></div>
        <div className="finance-summary-costs"><span>{locale === "cs" ? "Náklady (cesta)" : "Costs (travel)"}</span><b>− {formatMoney(summary.costs, summary.currency, locale)}</b></div>
        <div className={`finance-summary-net ${summary.net < 0 ? "is-loss" : ""}`}><span>{locale === "cs" ? "Čistý zisk" : "Net profit"}</span><b>{formatMoney(summary.net, summary.currency, locale)}</b></div>
      </article>)}
      {!loading && summaries.length === 0 && <EmptyState size="compact" title={locale === "cs" ? "Zatím nejsou zadané žádné ceny." : "No prices entered yet."} />}
    </div>

    {loading && <LoadingState label={locale === "cs" ? "Načítám finance…" : "Loading finance…"} />}
    {loadError && <EmptyState variant="error" icon="!" title={financeError(loadError, locale)} action={<button className="secondary-compact" type="button" onClick={() => { void load(); }}>{locale === "cs" ? "Zkusit znovu" : "Try again"}</button>} />}
    {!loading && !loadError && <div className="race-finance-table-wrap">
      <table className="race-finance-table">
        <thead><tr><th>{locale === "cs" ? "Pilot" : "Driver"}</th><th>{locale === "cs" ? "Cena bez DPH" : "Price excl. VAT"}</th><th>{locale === "cs" ? "Sleva" : "Discount"}</th><th>{locale === "cs" ? "Konečná cena" : "Final price"}</th><th>{locale === "cs" ? "Platba" : "Payment"}</th><th>{locale === "cs" ? "Zaplaceno" : "Paid"}</th><th>{locale === "cs" ? "Poznámka" : "Note"}</th><th className="no-print">{locale === "cs" ? "Uložit" : "Save"}</th></tr></thead>
        <tbody>{entries.map((entry) => <tr key={entry.raceEntryId} className={entry.isPaid ? "finance-paid-row" : ""}>
          <td data-label={locale === "cs" ? "Pilot" : "Driver"}><span className="finance-category">{entry.category}</span><strong>{entry.driverName}</strong><small>{entry.teamName || "—"}</small></td>
          <td data-label={locale === "cs" ? "Cena bez DPH" : "Price excl. VAT"}><div className="finance-price-input"><input aria-label={`${entry.driverName} price`} inputMode="decimal" value={entry.basePriceInput} onChange={(event) => update(entry.raceEntryId, { basePriceInput: event.target.value })} /><select aria-label={`${entry.driverName} currency`} value={entry.currency} onChange={(event) => update(entry.raceEntryId, { currency: event.target.value as Currency })}><option value="EUR">EUR</option><option value="CZK">CZK</option></select></div><span className="finance-print-value">{formatMoney(entry.basePriceCents, entry.currency, locale)}</span></td>
          <td data-label={locale === "cs" ? "Sleva" : "Discount"}><div className="finance-discount-input"><input aria-label={`${entry.driverName} discount`} inputMode="decimal" value={entry.discountInput} onChange={(event) => update(entry.raceEntryId, { discountInput: event.target.value })} /><span>%</span></div><span className="finance-print-value">{formatPercent(entry.discountBasisPoints, locale)}</span></td>
          <td data-label={locale === "cs" ? "Konečná cena" : "Final price"}><strong className="finance-final-price">{formatMoney(entry.finalPriceCents, entry.currency, locale)}</strong></td>
          <td data-label={locale === "cs" ? "Platba" : "Payment"}><select className="finance-payment-select" aria-label={`${entry.driverName} payment`} value={entry.paymentMethod} onChange={(event) => update(entry.raceEntryId, { paymentMethod: event.target.value as PaymentMethod })}><option value="">—</option><option value="cash">{locale === "cs" ? "Hotově" : "Cash"}</option><option value="card">{locale === "cs" ? "Kartou" : "Card"}</option><option value="bank_transfer">{locale === "cs" ? "Převodem" : "Transfer"}</option></select><span className="finance-print-value">{paymentLabel(entry.paymentMethod, locale)}</span></td>
          <td data-label={locale === "cs" ? "Zaplaceno" : "Paid"}><button className={`finance-paid-toggle no-print ${entry.isPaid ? "paid" : "unpaid"}`} type="button" onClick={() => update(entry.raceEntryId, { isPaid: !entry.isPaid })}>{entry.isPaid ? "✓" : "○"} {entry.isPaid ? (locale === "cs" ? "Ano" : "Yes") : (locale === "cs" ? "Ne" : "No")}</button><span className={`finance-print-paid ${entry.isPaid ? "paid" : "unpaid"}`}>{entry.isPaid ? "✓ Ano" : "□ Ne"}</span></td>
          <td data-label={locale === "cs" ? "Poznámka" : "Note"}><input className="finance-note-input" aria-label={`${entry.driverName} note`} value={entry.notes} onChange={(event) => update(entry.raceEntryId, { notes: event.target.value })} placeholder={locale === "cs" ? "Volitelná poznámka" : "Optional note"} /><span className="finance-print-value">{entry.notes || "—"}</span></td>
          <td className="finance-save-cell no-print"><button className={`secondary-compact ${entry.saved ? "saved" : ""}`} type="button" disabled={!entry.dirty || entry.saving} onClick={() => { void save(entry); }}>{entry.saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : entry.saved ? "✓" : (locale === "cs" ? "Uložit" : "Save")}</button>{entry.error && <small>{entry.error}</small>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {!loading && !loadError && <section className="race-finance-sales">
      <header>
        <div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM SALES</span><h3>{locale === "cs" ? "Prodej dílů a servis" : "Parts and service sales"}</h3><p>{locale === "cs" ? "Kdo co koupil, kolik zaplatil a zda bylo zboží předáno." : "Who bought what, how much they paid and whether it was delivered."}</p></div>
        <span>{formatCount(raceSales.length, locale, ORDER_FORMS)}</span>
      </header>
      {raceSales.length > 0 ? <div className="race-finance-sales-table-wrap">
        <table className="race-finance-sales-table">
          <thead><tr><th>{locale === "cs" ? "Zákazník" : "Customer"}</th><th>{locale === "cs" ? "Díly / servis" : "Parts / service"}</th><th>{locale === "cs" ? "Celkem bez DPH" : "Total excl. VAT"}</th><th>{locale === "cs" ? "Platba" : "Payment"}</th><th>{locale === "cs" ? "Zaplaceno" : "Paid"}</th><th>{locale === "cs" ? "Předáno" : "Delivered"}</th><th>{locale === "cs" ? "Poznámka" : "Note"}</th></tr></thead>
          <tbody>{raceSales.map((sale) => <tr key={sale.id} className={sale.isPaid ? "finance-paid-row" : ""}>
            <td data-label={locale === "cs" ? "Zákazník" : "Customer"}><strong>{sale.customerName}</strong><small>{sale.saleNumber} · {formatSaleDate(sale.saleDate, locale)}</small>{sale.documentNumber && <small>{locale === "cs" ? "Doklad" : "Document"}: {sale.documentNumber}</small>}</td>
            <td data-label={locale === "cs" ? "Díly / servis" : "Parts / service"}><div className="finance-sale-items">{sale.items.map((item) => { const description = locale === "en" ? item.descriptionEn || item.description : item.description; return <div key={item.id}><span className={`finance-sale-kind kind-${item.itemType}`}>{saleItemTypeLabel(item.itemType, locale)}</span><span className="finance-sale-item-name"><b>{item.quantity}× {item.code || description}</b>{item.code && description && description !== item.code && <small>{description}</small>}</span><strong>{formatMoney(item.lineTotalCents, sale.currency, locale)}</strong></div>; })}</div></td>
            <td data-label={locale === "cs" ? "Celkem bez DPH" : "Total excl. VAT"}><strong className="finance-sale-total">{formatMoney(sale.totalCents, sale.currency, locale)}</strong></td>
            <td data-label={locale === "cs" ? "Platba" : "Payment"}>{salePaymentLabel(sale.paymentMethod, locale)}</td>
            <td data-label={locale === "cs" ? "Zaplaceno" : "Paid"}><span className={`finance-sale-status ${sale.isPaid ? "yes" : "no"}`}>{sale.isPaid ? "✓ " + (locale === "cs" ? "Ano" : "Yes") : "○ " + (locale === "cs" ? "Ne" : "No")}</span></td>
            <td data-label={locale === "cs" ? "Předáno" : "Delivered"}><span className={`finance-sale-status ${sale.isDelivered ? "yes" : "no"}`}>{sale.isDelivered ? "✓ " + (locale === "cs" ? "Ano" : "Yes") : "○ " + (locale === "cs" ? "Ne" : "No")}</span></td>
            <td data-label={locale === "cs" ? "Poznámka" : "Note"}>{sale.notes || "—"}</td>
          </tr>)}</tbody>
        </table>
      </div> : <EmptyState size="inline" title={locale === "cs" ? "K tomuto závodu zatím není přiřazen žádný prodej ani servis." : "No sales or services are linked to this race yet."} action={onOpenSales && <button className="secondary-compact no-print" type="button" onClick={onOpenSales}>{locale === "cs" ? "Prodej a servis →" : "Sales and service →"}</button>} />}
    </section>}
    {!loading && !loadError && <section className="race-finance-sales race-finance-visits">
      <header>
        <div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM RACE CONTROL</span><h3>{locale === "cs" ? "Jiné týmy" : "Other teams"}</h3><p>{locale === "cs" ? "Prodej a servis pro týmy, které si k nám přišly pro díl, servis nebo něco ze skladu." : "Sales and service for teams that stopped by our pit for a part, service, or stock item."}</p></div>
        <span>{formatCount(visits.length, locale, RECORD_FORMS)}</span>
      </header>
      {visits.length > 0 ? <div className="race-finance-sales-table-wrap">
        <table className="race-finance-sales-table">
          <thead><tr><th>{locale === "cs" ? "Tým" : "Team"}</th><th>{locale === "cs" ? "Položka" : "Item"}</th><th>{locale === "cs" ? "Datum" : "Date"}</th><th>{locale === "cs" ? "Zapsal" : "Logged by"}</th><th>{locale === "cs" ? "Cena" : "Price"}</th></tr></thead>
          <tbody>{visits.map((visit) => <tr key={visit.id}>
            <td data-label={locale === "cs" ? "Tým" : "Team"}><strong>{visit.teamName}</strong>{visit.driverName && <small>{locale === "cs" ? "Pilot" : "Driver"}: {visit.driverName}</small>}</td>
            <td data-label={locale === "cs" ? "Položka" : "Item"}><span className={`finance-sale-kind kind-${visit.itemType}`}>{visitItemTypeLabel(visit.itemType, locale)}</span><span className="finance-sale-item-name"><b>{visit.description}</b>{visit.notes && <small>{visit.notes}</small>}</span></td>
            <td data-label={locale === "cs" ? "Datum" : "Date"}>{formatSaleDate(visit.visitDate, locale)}</td>
            <td data-label={locale === "cs" ? "Zapsal" : "Logged by"}>{visit.mechanicName || "—"}</td>
            <td data-label={locale === "cs" ? "Cena" : "Price"}><strong className="finance-sale-total">{visit.amountCents !== null ? formatMoney(visit.amountCents, visit.currency, locale) : "—"}</strong></td>
          </tr>)}</tbody>
        </table>
      </div> : <EmptyState size="inline" title={locale === "cs" ? "K tomuto závodu zatím nejsou zadané žádné návštěvy jiných týmů." : "No visits from other teams are recorded for this race yet."} action={onOpenVisits && <button className="secondary-compact no-print" type="button" onClick={onOpenVisits}>{locale === "cs" ? "Jiné týmy →" : "Other teams →"}</button>} />}
    </section>}
    <footer className="race-finance-print-footer"><span>Macháč Motors · MM System</span><span>{locale === "cs" ? "Ceny bez DPH" : "Prices exclude VAT"}</span></footer>
  </section>;
}

function toEditableEntry(entry: FinanceApiEntry): FinanceEntry {
  return {
    ...entry,
    basePriceInput: editableNumber(entry.basePriceCents / 100),
    discountInput: editableNumber(entry.discountBasisPoints / 100),
    updatedAt: entry.updatedAt ? Number(entry.updatedAt) : null,
    dirty: false,
    saving: false,
    saved: false,
    error: "",
  };
}

function editableNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function parseDecimal(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseMoney(value: string) {
  const number = parseDecimal(value);
  if (number === null || number < 0 || number > 10_000_000) return null;
  return Math.round(number * 100);
}

function parseDiscount(value: string) {
  const number = parseDecimal(value);
  if (number === null || number < 0 || number > 100) return null;
  return Math.round(number * 100);
}

function calculateFinal(basePriceCents: number, discountBasisPoints: number) {
  return Math.round(basePriceCents * (10_000 - discountBasisPoints) / 10_000);
}

function formatMoney(cents: number, currency: Currency, locale: Locale) {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100);
}

function formatPercent(basisPoints: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { maximumFractionDigits: 2 }).format(basisPoints / 100) + " %";
}

function paymentLabel(method: PaymentMethod, locale: Locale) {
  const labels: Record<PaymentMethod, [string, string]> = { "": ["—", "—"], cash: ["Hotově", "Cash"], card: ["Kartou", "Card"], bank_transfer: ["Převodem", "Transfer"] };
  return labels[method][locale === "cs" ? 0 : 1];
}

function salePaymentLabel(method: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    cash: ["Hotově", "Cash"],
    card: ["Kartou", "Card"],
    bank_transfer: ["Převodem", "Transfer"],
    invoice: ["Faktura", "Invoice"],
    other: ["Jiná", "Other"],
  };
  return (labels[method] ?? ["—", "—"])[locale === "cs" ? 0 : 1];
}

function saleItemTypeLabel(type: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    engine: ["Motor", "Engine"],
    carburetor: ["Karburátor", "Carburetor"],
    part: ["Díl", "Part"],
    service: ["Servis", "Service"],
    other: ["Ostatní", "Other"],
  };
  return (labels[type] ?? labels.other)[locale === "cs" ? 0 : 1];
}

function visitItemTypeLabel(type: string, locale: Locale) {
  const labels: Record<string, [string, string]> = { part: ["Díl", "Part"], service: ["Servis", "Service"], stock: ["Sklad", "Stock"], oil: ["Olej", "Oil"], other: ["Ostatní", "Other"] };
  return (labels[type] ?? labels.other)[locale === "cs" ? 0 : 1];
}

function formatSaleDate(value: string, locale: Locale) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}

function formatDateRange(start: string, end: string, locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const parse = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
  return `${formatter.format(parse(start))} – ${formatter.format(parse(end))}`;
}

function financePrintTitle(race: RaceInfo) {
  return `Finance_${race.name}_${race.startDate}_${race.endDate}`.replace(/[^a-zA-Z0-9À-ž_-]+/g, "_");
}

function financeError(message: string, locale: Locale) {
  if (locale === "en") return message;
  const translations: Record<string, string> = { Forbidden: "K financím má přístup pouze superadmin a šéf.", "Race entry not found": "Pilot už není v tomto závodě.", "Invalid base price": "Cena není platná.", "Invalid discount": "Sleva musí být od 0 do 100 %." };
  return translations[message] ?? "Finance se nepodařilo uložit. Zkus to prosím znovu.";
}
