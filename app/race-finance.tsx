"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { countryFlag } from "./countries";
import { RaceLogoBadge } from "./race-logo-badge";
import { NativeImage } from "./native-image";

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

export function RaceFinancePanel({ race, locale }: { race: RaceInfo; locale: Locale }) {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [salesTotals, setSalesTotals] = useState<RaceSalesTotal[]>([]);
  const [raceSales, setRaceSales] = useState<RaceFinanceSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
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
  }, [race.id]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

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
    const grandTotal = raceFees + salesTotal;
    const paidRaceFees = currencyEntries.filter((entry) => entry.isPaid).reduce((sum, entry) => sum + entry.finalPriceCents, 0);
    const paid = paidRaceFees + (sales?.paidCents ?? 0);
    return { currency, count: currencyEntries.length, saleCount: sales?.saleCount ?? 0, base, discount: base - raceFees, raceFees, salesTotal, grandTotal, paid, unpaid: grandTotal - paid };
  }).filter((summary) => summary.count > 0 || summary.saleCount > 0), [entries, salesTotals]);

  return <section className="panel race-finance-panel">
    <header className="race-finance-heading">
      <div className="race-finance-title"><RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="large" /><div><span className="eyebrow">MM FINANCE</span><h2>{locale === "cs" ? "Finance závodu" : "Race finance"}</h2><p>{race.name} · {formatDateRange(race.startDate, race.endDate, locale)} · {countryFlag(race.countryCode)} {race.track}</p></div></div>
      <NativeImage className="race-finance-logo" src="/machac-motors-logo.jpg" alt="Macháč Motors" loading="eager" />
      <button className="secondary-compact no-print" type="button" onClick={printFinance}>⌁ {locale === "cs" ? "Vytisknout finance" : "Print finance"}</button>
    </header>

    <p className="race-finance-vat-note">{locale === "cs" ? "Všechny ceny jsou bez DPH. Prodeje přidané k tomuto závodu jsou započítané do celku; stornované prodeje se nepočítají. EUR a CZK zůstávají odděleně." : "All prices exclude VAT. Sales linked to this race are included in the total; voided sales are excluded. EUR and CZK remain separate."}</p>

    <div className="race-finance-summaries">
      {summaries.map((summary) => <article key={summary.currency}>
        <header><strong>{summary.currency}</strong><span>{summary.count} {locale === "cs" ? "pilotů" : "drivers"} · {summary.saleCount} {locale === "cs" ? "prodejů" : "sales"}</span></header>
        <div><span>{locale === "cs" ? "Před slevou" : "Before discount"}</span><b>{formatMoney(summary.base, summary.currency, locale)}</b></div>
        <div><span>{locale === "cs" ? "Slevy" : "Discounts"}</span><b>− {formatMoney(summary.discount, summary.currency, locale)}</b></div>
        <div><span>{locale === "cs" ? "Piloti po slevě" : "Drivers after discount"}</span><b>{formatMoney(summary.raceFees, summary.currency, locale)}</b></div>
        <div className="finance-summary-sales"><span>{locale === "cs" ? "Prodej" : "Sales"}</span><b>{formatMoney(summary.salesTotal, summary.currency, locale)}</b></div>
        <div className="finance-summary-total"><span>{locale === "cs" ? "Celkem závod" : "Race total"}</span><b>{formatMoney(summary.grandTotal, summary.currency, locale)}</b></div>
        <div className="finance-summary-paid"><span>{locale === "cs" ? "Zaplaceno" : "Paid"}</span><b>{formatMoney(summary.paid, summary.currency, locale)}</b></div>
        <div className="finance-summary-unpaid"><span>{locale === "cs" ? "Zbývá" : "Outstanding"}</span><b>{formatMoney(summary.unpaid, summary.currency, locale)}</b></div>
      </article>)}
      {!loading && summaries.length === 0 && <p>{locale === "cs" ? "Zatím nejsou zadané žádné ceny." : "No prices entered yet."}</p>}
    </div>

    {loading && <div className="empty-state"><span className="spinner" /><p>{locale === "cs" ? "Načítám finance…" : "Loading finance…"}</p></div>}
    {loadError && <div className="empty-state error-state"><b>!</b><p>{financeError(loadError, locale)}</p><button className="secondary-compact" type="button" onClick={() => { void load(); }}>{locale === "cs" ? "Zkusit znovu" : "Try again"}</button></div>}
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
        <div><span className="eyebrow">MM SALES</span><h3>{locale === "cs" ? "Prodej dílů a servis" : "Parts and service sales"}</h3><p>{locale === "cs" ? "Kdo co koupil, kolik zaplatil a zda bylo zboží předáno." : "Who bought what, how much they paid and whether it was delivered."}</p></div>
        <span>{raceSales.length} {locale === "cs" ? "objednávek" : "orders"}</span>
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
      </div> : <p className="finance-sales-empty">{locale === "cs" ? "K tomuto závodu zatím není přiřazen žádný prodej ani servis." : "No sales or services are linked to this race yet."}</p>}
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
