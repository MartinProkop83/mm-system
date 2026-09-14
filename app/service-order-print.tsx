"use client";

import { useState } from "react";
import { useModalA11y } from "./use-modal-a11y";
import type { MaterialLine, OrderDetail, OrderEngine, WorkLine } from "./service-order-detail";

type Locale = "cs" | "en";
type DocumentKind = "receipt" | "worksheet";

const modalCopy = {
  cs: {
    title: "Tisk dokumentu",
    document: "Dokument",
    receipt: "Příjemka",
    receiptHint: "Při převzetí motoru — rozsah prací ještě nemusí být hotový.",
    worksheet: "Zakázkový list",
    worksheetHint: "Do boxu k motoru a při výdeji — rozsah prací, provedená práce, materiál a součet.",
    language: "Jazyk dokumentu",
    print: "Tisknout",
    cancel: "Zrušit",
  },
  en: {
    title: "Print document",
    document: "Document",
    receipt: "Drop-off receipt",
    receiptHint: "Printed when the engine is dropped off — the scope of work may not be final yet.",
    worksheet: "Work order sheet",
    worksheetHint: "For the engine's box and at hand-over — scope, work performed, material and total.",
    language: "Document language",
    print: "Print",
    cancel: "Cancel",
  },
} as const;

/** Obsah listu se vždycky sestaví v jazyce zvoleném při tisku — nezávisle na jazyku obrazovky. */
const print9n = {
  cs: {
    receiptTitle: "PŘÍJEMKA", worksheetTitle: "ZAKÁZKOVÝ LIST",
    orderNumber: "Číslo zakázky", receivedAt: "Datum příjmu", deadline: "Termín", noDeadline: "Bez termínu",
    customer: "Zákazník", contact: "Kontakt", customerSaid: "Co zákazník řekl", noCustomerNote: "—",
    engines: "Motory", engineCode: "Motor", engineType: "Typ", engineHours: "Motohodiny při příjmu", noHours: "Nezadáno",
    scope: "Rozsah prací", noScope: "Rozsah prací nebyl zadán.",
    works: "Provedené práce", materials: "Použitý materiál", noWorks: "Žádné provedené práce.", noMaterials: "Žádný materiál.",
    quantity: "Ks", price: "Cena", discount: "Sleva", total: "Celkem",
    ownParts: "Vlastní díly zákazníka",
    subtotal: "Mezisoučet motoru", grandTotal: "CELKEM ZA ZAKÁZKU BEZ DPH",
    vatNote: "Všechny ceny jsou bez DPH. Podklad pro fakturaci.",
    signatureNote: "Podpis se u příjemky neřeší, tiskne se pro pořádek.",
    printedAt: "Vytištěno",
  },
  en: {
    receiptTitle: "DROP-OFF RECEIPT", worksheetTitle: "WORK ORDER SHEET",
    orderNumber: "Order number", receivedAt: "Received", deadline: "Deadline", noDeadline: "No deadline",
    customer: "Customer", contact: "Contact", customerSaid: "What the customer said", noCustomerNote: "—",
    engines: "Engines", engineCode: "Engine", engineType: "Type", engineHours: "Engine hours at drop-off", noHours: "Not entered",
    scope: "Scope of work", noScope: "No scope of work entered.",
    works: "Work performed", materials: "Material used", noWorks: "No work performed.", noMaterials: "No material.",
    quantity: "Qty", price: "Price", discount: "Discount", total: "Total",
    ownParts: "Customer's own parts",
    subtotal: "Engine subtotal", grandTotal: "ORDER TOTAL EXCL. VAT",
    vatNote: "All prices exclude VAT. For invoicing reference.",
    signatureNote: "No signature — printed for the record.",
    printedAt: "Printed",
  },
} as const;

function formatMoney(cents: number, currency: "CZK" | "EUR", printLocale: Locale) {
  return new Intl.NumberFormat(printLocale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
}
function formatEngineHours(minutes: number | null) {
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const rest = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${rest}`;
}
function formatDate(value: string, printLocale: Locale) {
  if (!value) return "";
  return new Intl.DateTimeFormat(printLocale === "cs" ? "cs-CZ" : "en-GB", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}
function localized(printLocale: Locale, cs: string, en: string) {
  return printLocale === "cs" ? cs : en || cs;
}
/** Součet v druhé měně se tiskne jen tehdy, když ji mají všechny řádky — jinak by to byla tichá nula. */
function sumLines(lines: Array<{ totalCzkCents: number; totalEurCents: number }>) {
  const czk = lines.reduce((sum, line) => sum + line.totalCzkCents, 0);
  const eur = lines.reduce((sum, line) => sum + line.totalEurCents, 0);
  return { czk, eur };
}

/**
 * Tlačítko „Tisk" + modal na výběr dokumentu a jazyka + samotný tiskový list.
 *
 * Jazyk dokumentu se vybírá až tady, nezávisle na jazyku, ve kterém superadmin/vedení
 * zrovna vidí aplikaci — zákazník dostane list v jazyce, který si zvolí obsluha při tisku,
 * ne v tom, v jakém má app zrovna přepnutou.
 */
export function ServiceOrderPrintButton({ order, locale, label }: { order: OrderDetail; locale: Locale; label: string }) {
  const [picking, setPicking] = useState(false);
  const [printJob, setPrintJob] = useState<{ kind: DocumentKind; printLocale: Locale } | null>(null);

  function runPrint(kind: DocumentKind, printLocale: Locale) {
    setPicking(false);
    setPrintJob({ kind, printLocale });
    const previousTitle = document.title;
    document.body.dataset.printMode = "service-order";
    document.title = `${order.number}_${kind === "receipt" ? "prijemka" : "zakazkovy-list"}_${printLocale}`;
    // Vlastní render doběhne dřív, než se stránka reálně vytiskne — prohlížeč tiskne po dalším frame.
    window.requestAnimationFrame(() => {
      window.print();
      window.setTimeout(() => {
        delete document.body.dataset.printMode;
        document.title = previousTitle;
        setPrintJob(null);
      }, 500);
    });
  }

  return (
    <>
      <button className="secondary-compact" type="button" onClick={() => setPicking(true)}>🖶 {label}</button>
      {picking && <PrintPickerModal locale={locale} onClose={() => setPicking(false)} onPick={runPrint} />}
      {printJob && <ServiceOrderPrintSheet order={order} kind={printJob.kind} printLocale={printJob.printLocale} />}
    </>
  );
}

function PrintPickerModal({ locale, onClose, onPick }: { locale: Locale; onClose: () => void; onPick: (kind: DocumentKind, printLocale: Locale) => void }) {
  const t = modalCopy[locale];
  const dialogRef = useModalA11y(onClose);
  const [kind, setKind] = useState<DocumentKind>("worksheet");
  const [printLocale, setPrintLocale] = useState<Locale>(locale);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal" role="dialog" aria-modal="true" aria-labelledby="print-picker-title" tabIndex={-1}>
        <header className="modal-header">
          <div><h2 id="print-picker-title">{t.title}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <fieldset className="print-picker-options">
          <legend>{t.document}</legend>
          <label className="print-picker-option">
            <input type="radio" checked={kind === "worksheet"} onChange={() => setKind("worksheet")} />
            <span><strong>{t.worksheet}</strong><small>{t.worksheetHint}</small></span>
          </label>
          <label className="print-picker-option">
            <input type="radio" checked={kind === "receipt"} onChange={() => setKind("receipt")} />
            <span><strong>{t.receipt}</strong><small>{t.receiptHint}</small></span>
          </label>
        </fieldset>
        <label className="print-picker-language"><span>{t.language}</span>
          <select value={printLocale} onChange={(event) => setPrintLocale(event.target.value as Locale)}>
            <option value="cs">Čeština</option>
            <option value="en">English</option>
          </select>
        </label>
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="button" onClick={() => onPick(kind, printLocale)}>🖶 {t.print}</button>
        </footer>
      </section>
    </div>
  );
}

function EnginePrintBlock({ engine, kind, printLocale, currency }: { engine: OrderEngine; kind: DocumentKind; printLocale: Locale; currency: "CZK" | "EUR" }) {
  const t = print9n[printLocale];
  const hours = formatEngineHours(engine.engineMinutes);
  const worksTotal = sumLines(engine.works);
  const materialsTotal = sumLines(engine.materials);
  const subtotalCzk = worksTotal.czk + materialsTotal.czk;
  const subtotalEur = worksTotal.eur + materialsTotal.eur;

  return (
    <article className="print-engine-block">
      <h3>{engine.engineCode} <small>· {localized(printLocale, engine.typeNameCs, engine.typeNameEn)}</small></h3>
      <p className="print-fact-row"><span>{t.engineHours}</span><strong>{hours ?? t.noHours}</strong></p>

      {kind === "worksheet" && (
        <div className="print-scope-block">
          <span className="print-scope-label">{t.scope}</span>
          <p className="print-scope-text">{engine.scope || t.noScope}</p>
        </div>
      )}

      {kind === "worksheet" && (
        <>
          <table className="print-line-table">
            <thead><tr><th>{t.works}</th><th>{t.quantity}</th><th>{t.price}</th><th>{t.discount}</th><th>{t.total}</th></tr></thead>
            <tbody>
              {engine.works.length === 0 ? (
                <tr><td colSpan={5}>{t.noWorks}</td></tr>
              ) : engine.works.map((line: WorkLine) => (
                <tr key={line.id}>
                  <td>{localized(printLocale, line.nameCsSnapshot, line.nameEnSnapshot)}</td>
                  <td>{line.quantity}</td>
                  <td>{formatMoney(currency === "EUR" ? line.unitPriceEurCents : line.unitPriceCzkCents, currency, printLocale)}</td>
                  <td>{line.discountPercent}%</td>
                  <td>{formatMoney(currency === "EUR" ? line.totalEurCents : line.totalCzkCents, currency, printLocale)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="print-line-table">
            <thead><tr><th>{t.materials}</th><th>{t.quantity}</th><th>{t.price}</th><th>{t.discount}</th><th>{t.total}</th></tr></thead>
            <tbody>
              {engine.materials.length === 0 ? (
                <tr><td colSpan={5}>{t.noMaterials}</td></tr>
              ) : engine.materials.map((line: MaterialLine) => (
                <tr key={line.id}>
                  <td>{line.name}</td>
                  <td>{line.quantity}</td>
                  <td>{formatMoney(currency === "EUR" ? line.unitPriceEurCents : line.unitPriceCzkCents, currency, printLocale)}</td>
                  <td>{line.discountPercent}%</td>
                  <td>{formatMoney(currency === "EUR" ? line.totalEurCents : line.totalCzkCents, currency, printLocale)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Vlastní díly zákazníka se tisknou jen se zaškrtnutým příznakem — jinak na listu vůbec nejsou. */}
          {engine.customerParts && (
            <p className="print-fact-row"><span>{t.ownParts}</span><strong>{engine.customerPartsText || "—"}</strong></p>
          )}

          <p className="print-engine-subtotal"><span>{t.subtotal}</span><strong>{formatMoney(currency === "EUR" ? subtotalEur : subtotalCzk, currency, printLocale)}</strong></p>
        </>
      )}
    </article>
  );
}

/**
 * Samotný tiskový list. `data-print-mode="service-order"` v globals.css schová menu,
 * hlavičku i zbytek stránky a nechá viditelnou jen tuhle oblast — na papír jde jen ona.
 *
 * Zakázkový list dá každému motoru vlastní stránku (`page-break-after`), aby šel po
 * vytištění rozstříhat a každá stránka šla do boxu k jinému motoru.
 */
function ServiceOrderPrintSheet({ order, kind, printLocale }: { order: OrderDetail; kind: DocumentKind; printLocale: Locale }) {
  const t = print9n[printLocale];
  const allWorks = order.engines.flatMap((engine) => engine.works);
  const allMaterials = order.engines.flatMap((engine) => engine.materials);
  const grandCzk = sumLines(allWorks).czk + sumLines(allMaterials).czk;
  const grandEur = sumLines(allWorks).eur + sumLines(allMaterials).eur;

  return (
    <div className="service-order-print-area">
      {order.engines.map((engine, index) => (
        <section key={engine.id} className="print-page">
          <header className="print-header">
            <strong>MACHÁČ MOTORS</strong>
            <h1>{kind === "receipt" ? t.receiptTitle : t.worksheetTitle}</h1>
          </header>

          <div className="print-fact-grid">
            <p className="print-fact-row"><span>{t.orderNumber}</span><strong>{order.number}</strong></p>
            <p className="print-fact-row"><span>{t.receivedAt}</span><strong>{formatDate(order.receivedAt, printLocale)}</strong></p>
            <p className="print-fact-row"><span>{t.deadline}</span><strong>{order.deadlineDate ? `${formatDate(order.deadlineDate, printLocale)}${order.deadlineNote ? ` — ${order.deadlineNote}` : ""}` : t.noDeadline}</strong></p>
          </div>

          <div className="print-fact-grid">
            <p className="print-fact-row"><span>{t.customer}</span><strong>{order.customerName}</strong></p>
            <p className="print-fact-row"><span>{t.contact}</span><strong>{[order.customerPhone, order.customerEmail].filter(Boolean).join(" · ") || "—"}</strong></p>
          </div>

          <p className="print-scope-block"><span className="print-scope-label">{t.customerSaid}</span><span>{order.customerNote || t.noCustomerNote}</span></p>

          <EnginePrintBlock engine={engine} kind={kind} printLocale={printLocale} currency={order.currency} />

          {kind === "worksheet" && index === order.engines.length - 1 && (
            <p className="print-grand-total"><span>{t.grandTotal}</span><strong>{formatMoney(order.currency === "EUR" ? grandEur : grandCzk, order.currency, printLocale)}</strong></p>
          )}

          <footer className="print-footer">
            <p>{t.vatNote}</p>
            {kind === "receipt" && <p>{t.signatureNote}</p>}
            <p className="print-footer-meta">{t.printedAt}: {new Intl.DateTimeFormat(printLocale === "cs" ? "cs-CZ" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}</p>
          </footer>
        </section>
      ))}
      {order.engines.length === 0 && (
        <section className="print-page">
          <header className="print-header"><strong>MACHÁČ MOTORS</strong><h1>{kind === "receipt" ? t.receiptTitle : t.worksheetTitle}</h1></header>
          <div className="print-fact-grid">
            <p className="print-fact-row"><span>{t.orderNumber}</span><strong>{order.number}</strong></p>
            <p className="print-fact-row"><span>{t.customer}</span><strong>{order.customerName}</strong></p>
          </div>
          <footer className="print-footer"><p>{t.vatNote}</p></footer>
        </section>
      )}
    </div>
  );
}
