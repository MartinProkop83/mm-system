"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { formatHours } from "./format-hours";
import type { CustomerRecord } from "./commerce-pages";

type Locale = "cs" | "en";

type CustomerEngine = {
  id: string; code: string; note: string; typeNameCs: string; typeNameEn: string;
  orderCount: number; lastReceivedAt: string | null; isActive: boolean;
};
type CustomerOrder = {
  id: string; number: string; currency: "CZK" | "EUR"; receivedAt: string; deadlineDate: string;
  engineCount: number; invoicedAt: number | null; cancelledAt: number | null;
  totalCzkCents: number; totalEurCents: number;
};
type HistoryWork = { id: string; codeSnapshot: string; nameCsSnapshot: string; nameEnSnapshot: string; quantity: number; totalCzkCents: number; totalEurCents: number; createdByName: string };
type HistoryMaterial = { id: string; code: string; name: string; quantity: number; source: "stock" | "customer"; totalCzkCents: number; totalEurCents: number };
type HistoryVisit = {
  orderEngineId: string; orderId: string; number: string; currency: "CZK" | "EUR"; receivedAt: string;
  status: string; engineMinutes: number | null; scope: string;
  completedByName: string; completedAt: number | null; handedOverAt: number | null; cancelledAt: number | null;
  works: HistoryWork[]; materials: HistoryMaterial[];
};
type EngineHistory = {
  engine: { id: string; code: string; note: string; customerName: string; typeNameCs: string; typeNameEn: string };
  visits: HistoryVisit[];
};

const content = {
  cs: {
    back: "← Zpět na zákazníky", backToCustomer: "← Zpět na kartu zákazníka",
    eyebrow: "MM CUSTOMER DIRECTORY",
    loading: "Načítám kartu zákazníka…", loadError: "Kartu se nepodařilo načíst.", retry: "Zkusit znovu",
    contact: "Kontakt", billing: "Fakturační údaje", discounts: "Výchozí slevy",
    discountWork: "Práce", discountMaterial: "Materiál", country: "Země", notes: "Poznámka",
    sales: "Prodeje", noValue: "—",
    engines: "Motory zákazníka",
    enginesEmpty: "Zákazník tu zatím nemá žádný motor",
    enginesEmptyHelp: "Motor se založí při první zakázce a zůstane tu i po vydání.",
    engineCode: "Motor", engineType: "Typ", engineOrders: "Zakázek", engineLast: "Naposledy",
    engineArchived: "Archivovaný",
    orders: "Poslední zakázky",
    ordersEmpty: "Zatím žádná zakázka",
    orderNumber: "Číslo", orderReceived: "Přijato", orderEngines: "Motory", orderTotal: "Celkem bez DPH",
    cancelled: "Stornováno", invoiced: "Vyfakturováno",
    historyTitle: (code: string) => `Historie motoru ${code}`,
    historyEmpty: "Tenhle motor tu zatím nebyl",
    visitScope: "Rozsah prací", visitWorks: "Provedené práce", visitMaterials: "Použitý materiál",
    visitNoWorks: "Žádná práce nezapsaná", visitNoMaterials: "Žádný materiál",
    visitDone: "Dokončil", visitHandedOver: "Vydáno", visitHours: "Motohodiny při příjmu",
    ownPart: "zákazníkův díl",
    openOrder: "Otevřít zakázku",
    statusLabels: { received: "Přijato", in_progress: "V práci", waiting_part: "Čeká na díl", done: "Hotovo", checked: "Zkontrolováno", handed_over: "Vydáno" } as Record<string, string>,
  },
  en: {
    back: "← Back to customers", backToCustomer: "← Back to the customer",
    eyebrow: "MM CUSTOMER DIRECTORY",
    loading: "Loading the customer…", loadError: "The customer could not be loaded.", retry: "Try again",
    contact: "Contact", billing: "Billing details", discounts: "Default discounts",
    discountWork: "Work", discountMaterial: "Material", country: "Country", notes: "Notes",
    sales: "Sales", noValue: "—",
    engines: "Customer's engines",
    enginesEmpty: "No engine for this customer yet",
    enginesEmptyHelp: "An engine is created with the first order and stays here after hand-over.",
    engineCode: "Engine", engineType: "Type", engineOrders: "Orders", engineLast: "Last visit",
    engineArchived: "Archived",
    orders: "Recent orders",
    ordersEmpty: "No order yet",
    orderNumber: "Number", orderReceived: "Received", orderEngines: "Engines", orderTotal: "Total excl. VAT",
    cancelled: "Cancelled", invoiced: "Invoiced",
    historyTitle: (code: string) => `History of engine ${code}`,
    historyEmpty: "This engine has not been here yet",
    visitScope: "Scope of work", visitWorks: "Work performed", visitMaterials: "Material used",
    visitNoWorks: "No work recorded", visitNoMaterials: "No material",
    visitDone: "Completed by", visitHandedOver: "Handed over", visitHours: "Engine hours at drop-off",
    ownPart: "customer's part",
    openOrder: "Open the order",
    statusLabels: { received: "Received", in_progress: "In progress", waiting_part: "Waiting for part", done: "Done", checked: "Checked", handed_over: "Handed over" } as Record<string, string>,
  },
} as const;

function formatMoney(cents: number, currency: "CZK" | "EUR", locale: Locale) {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}
function formatDate(value: string | null, locale: Locale) {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}
function localized(locale: Locale, cs: string, en: string) {
  return locale === "cs" ? cs : en || cs;
}

/**
 * Karta zákazníka se servisní částí.
 *
 * Skládá se ze tří dotazů, které už existují: zákazník z `/api/customers`, jeho motory
 * z `/api/customer-engines?customerId=`, jeho zakázky z `/api/service-orders?customerId=`.
 * Historie konkrétního motoru se dotahuje až po kliknutí (`?customerEngineId=`), aby se
 * u zákazníka se šesti motory netahalo šest historií zbytečně dopředu.
 */
export function CustomerDetail({ customerId, locale, onClose, onOpenOrder, initialEngineId }: {
  customerId: string;
  locale: Locale;
  onClose: () => void;
  /** Proklik do sekce Zakázky na konkrétní zakázku. */
  onOpenOrder?: (orderId: string) => void;
  /** Z hledání: otevřít rovnou historii tohohle motoru, ne jen kartu zákazníka. */
  initialEngineId?: string | null;
}) {
  const t = content[locale];
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [engines, setEngines] = useState<CustomerEngine[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [historyEngineId, setHistoryEngineId] = useState<string | null>(initialEngineId ?? null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [customersResponse, enginesResponse, ordersResponse] = await Promise.all([
        fetch("/api/customers", { cache: "no-store" }),
        fetch(`/api/customer-engines?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }),
        fetch(`/api/service-orders?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }),
      ]);
      if (!customersResponse.ok || !enginesResponse.ok || !ordersResponse.ok) throw new Error("load failed");
      const customersData = (await customersResponse.json()) as { customers: CustomerRecord[] };
      const found = customersData.customers.find((item) => item.id === customerId) ?? null;
      if (!found) throw new Error("customer not found");
      setCustomer(found);
      setEngines(((await enginesResponse.json()) as { engines: CustomerEngine[] }).engines);
      setOrders(((await ordersResponse.json()) as { orders: CustomerOrder[] }).orders);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <section className="dash-panel"><LoadingState label={t.loading} /></section>;
  if (loadError || !customer) {
    return (
      <section className="dash-panel">
        <EmptyState variant="error" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }

  if (historyEngineId) {
    return (
      <EngineHistoryView engineId={historyEngineId} locale={locale}
        onClose={() => setHistoryEngineId(null)} onOpenOrder={onOpenOrder} />
    );
  }

  return (
    <div className="customer-detail">
      <button className="secondary-compact service-order-back" type="button" onClick={onClose}>{t.back}</button>

      <section className="dash-panel tab-panel-header">
        <div><span className="eyebrow">{t.eyebrow}</span><h2>{customer.name}</h2>
          <p>{[customer.phone, customer.email].filter(Boolean).join(" · ") || t.noValue}</p>
        </div>
      </section>

      <section className="dash-panel customer-detail-facts">
        <div><small>{t.billing}</small><strong>{[customer.companyId, customer.vatId].filter(Boolean).join(" / ") || t.noValue}</strong></div>
        <div><small>{t.country}</small><strong>{customer.countryCode || t.noValue}</strong></div>
        <div><small>{t.discounts}</small><strong>{t.discountWork} {customer.discountWorkPercent}% · {t.discountMaterial} {customer.discountMaterialPercent}%</strong></div>
        <div><small>{t.sales}</small><strong>{customer.saleCount ?? 0}</strong></div>
        {customer.notes && <div className="customer-detail-notes"><small>{t.notes}</small><strong>{customer.notes}</strong></div>}
      </section>

      <section className="dash-panel">
        <header className="settings-section-heading"><h3>{t.engines}</h3></header>
        {engines.length === 0 ? (
          <EmptyState size="inline" title={t.enginesEmpty} description={t.enginesEmptyHelp} />
        ) : (
          <div className="table-wrap">
            <table className="settings-table">
              <thead><tr><th>{t.engineCode}</th><th>{t.engineType}</th><th>{t.engineOrders}</th><th>{t.engineLast}</th></tr></thead>
              <tbody>
                {engines.map((engine) => (
                  <tr key={engine.id} className="clickable-row" onClick={() => setHistoryEngineId(engine.id)}>
                    <td>
                      <strong>{engine.code}</strong>
                      {!engine.isActive && <span className="status-pill neutral service-orders-inline-flag">{t.engineArchived}</span>}
                    </td>
                    <td>{localized(locale, engine.typeNameCs, engine.typeNameEn)}</td>
                    <td>{engine.orderCount}</td>
                    <td>{formatDate(engine.lastReceivedAt, locale) ?? t.noValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dash-panel">
        <header className="settings-section-heading"><h3>{t.orders}</h3></header>
        {orders.length === 0 ? (
          <EmptyState size="inline" title={t.ordersEmpty} />
        ) : (
          <div className="table-wrap">
            <table className="settings-table">
              <thead><tr><th>{t.orderNumber}</th><th>{t.orderReceived}</th><th>{t.orderEngines}</th><th className="price-cell">{t.orderTotal}</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className={onOpenOrder ? "clickable-row" : ""} onClick={onOpenOrder ? () => onOpenOrder(order.id) : undefined}>
                    <td>
                      <strong>{order.number}</strong>
                      {order.cancelledAt && <span className="status-pill danger service-orders-inline-flag">{t.cancelled}</span>}
                      {!order.cancelledAt && order.invoicedAt && <span className="status-pill neutral service-orders-inline-flag">{t.invoiced}</span>}
                    </td>
                    <td>{formatDate(order.receivedAt, locale)}</td>
                    <td>{order.engineCount}</td>
                    <td className="price-cell">{formatMoney(order.currency === "EUR" ? order.totalEurCents : order.totalCzkCents, order.currency, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Historie jednoho motoru — co se kdy dělalo, kdo to dělal a co se použilo. */
function EngineHistoryView({ engineId, locale, onClose, onOpenOrder }: {
  engineId: string; locale: Locale; onClose: () => void; onOpenOrder?: (orderId: string) => void;
}) {
  const t = content[locale];
  const [history, setHistory] = useState<EngineHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await fetch(`/api/service-orders?customerEngineId=${encodeURIComponent(engineId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      setHistory((await response.json()) as EngineHistory);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [engineId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <section className="dash-panel"><LoadingState label={t.loading} /></section>;
  if (loadError || !history) {
    return (
      <section className="dash-panel">
        <EmptyState variant="error" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }

  return (
    <div className="customer-detail">
      <button className="secondary-compact service-order-back" type="button" onClick={onClose}>{t.backToCustomer}</button>

      <section className="dash-panel tab-panel-header">
        <div><span className="eyebrow">{t.eyebrow}</span><h2>{t.historyTitle(history.engine.code)}</h2>
          <p>{history.engine.customerName} · {localized(locale, history.engine.typeNameCs, history.engine.typeNameEn)}</p>
        </div>
      </section>

      {history.visits.length === 0 ? (
        <section className="dash-panel"><EmptyState size="inline" title={t.historyEmpty} /></section>
      ) : history.visits.map((visit) => (
        <article key={visit.orderEngineId} className="dash-panel customer-history-visit">
          <header className="customer-history-head">
            <div>
              <strong>{visit.number}</strong>
              <span>{formatDate(visit.receivedAt, locale)}</span>
            </div>
            <div className="customer-history-head-right">
              <span className="status-pill neutral">{t.statusLabels[visit.status] ?? visit.status}</span>
              {onOpenOrder && (
                <button className="secondary-compact" type="button" onClick={() => onOpenOrder(visit.orderId)}>{t.openOrder}</button>
              )}
            </div>
          </header>

          {visit.engineMinutes !== null && <p className="service-order-engine-meta">{t.visitHours}: {formatHours(visit.engineMinutes)}</p>}
          {visit.scope && <p className="service-order-engine-scope"><strong>{t.visitScope}:</strong> {visit.scope}</p>}
          {visit.completedByName && <p className="service-order-engine-meta">{t.visitDone}: {visit.completedByName}</p>}

          <div className="customer-history-lines">
            <div>
              <h4>{t.visitWorks}</h4>
              {visit.works.length === 0 ? <p className="form-hint">{t.visitNoWorks}</p> : (
                <ul className="customer-history-list">
                  {visit.works.map((work) => (
                    <li key={work.id}>
                      <span>{work.quantity}× {localized(locale, work.nameCsSnapshot, work.nameEnSnapshot)}</span>
                      <b>{formatMoney(visit.currency === "EUR" ? work.totalEurCents : work.totalCzkCents, visit.currency, locale)}</b>
                      {work.createdByName && <small>{work.createdByName}</small>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4>{t.visitMaterials}</h4>
              {visit.materials.length === 0 ? <p className="form-hint">{t.visitNoMaterials}</p> : (
                <ul className="customer-history-list">
                  {visit.materials.map((material) => (
                    <li key={material.id}>
                      <span>{material.quantity}× {material.name}{material.source === "customer" ? ` (${t.ownPart})` : ""}</span>
                      <b>{formatMoney(visit.currency === "EUR" ? material.totalEurCents : material.totalCzkCents, visit.currency, locale)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
