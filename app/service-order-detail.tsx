"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { ServiceOrderPrintButton } from "./service-order-print";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
type OrderStatus = "received" | "in_progress" | "waiting_part" | "done" | "checked" | "handed_over";

export type WorkLine = {
  id: string; orderEngineId: string; priceItemId: string | null; codeSnapshot: string;
  nameCsSnapshot: string; nameEnSnapshot: string; quantity: number;
  unitPriceCzkCents: number; unitPriceEurCents: number; discountPercent: number;
  totalCzkCents: number; totalEurCents: number; createdByName: string; createdAt: number;
};
export type MaterialLine = {
  id: string; orderEngineId: string; inventoryPartId: string | null; code: string; name: string; quantity: number;
  unitPriceCzkCents: number; unitPriceEurCents: number; discountPercent: number;
  totalCzkCents: number; totalEurCents: number; source: "stock" | "customer"; createdByName: string; createdAt: number;
};
type WaitingPart = {
  id: string; orderEngineId: string; code: string; name: string; priceCzkCents: number; priceEurCents: number;
  expectedDate: string; isOrdered: boolean; arrivedAt: number | null; createdAt: number;
};
export type OrderEngine = {
  id: string; orderId: string; customerEngineId: string; engineCode: string; engineNote: string;
  typeNameCs: string; typeNameEn: string; engineMinutes: number | null; scope: string;
  carbService: boolean; customerParts: boolean; customerPartsText: string; status: OrderStatus;
  takenByName: string; takenAt: number | null; completedByName: string; completedAt: number | null;
  checkedAt: number | null; handedOverAt: number | null; reopenedAt: number | null; reopenReason: string;
  works: WorkLine[]; materials: MaterialLine[]; waitingParts: WaitingPart[];
};
type Photo = { id: string; orderId: string; orderEngineId: string | null; fileName: string; contentType: string; note: string; createdAt: number; url: string };
export type OrderDetail = {
  id: string; number: string; customerId: string; customerName: string; customerPhone: string; customerEmail: string; customerCountryCode: string;
  currency: "CZK" | "EUR"; discountWorkPercent: number; discountMaterialPercent: number;
  receivedAt: string; deadlineDate: string; deadlineNote: string; customerNote: string; internalNote: string;
  handoverType: "personal" | "carrier" | "race"; carrier: string; trackingNumber: string;
  shippingPriceCzkCents: number; shippingPriceEurCents: number; shippedAt: string;
  invoicedAt: number | null; unlockedAt: number | null; cancelledAt: number | null; cancelledReason: string;
  deletedAt: number | null; deletedBy: string;
  locked: boolean; engines: OrderEngine[]; photos: Photo[];
};
type PriceItem = { id: string; code: string; nameCs: string; nameEn: string; priceCzkCents: number; priceEurCents: number; isActive: boolean };
type InventoryPart = { id: string; code: string; name: string; priceCzkCents: number; priceEurCents: number };
type EngineTypeOption = { id: string; nameCs: string; nameEn: string; isActive: boolean };
type CustomerEngineOption = { id: string; code: string; typeNameCs: string; typeNameEn: string; isActive: boolean };

const STATUS_ORDER: OrderStatus[] = ["received", "in_progress", "waiting_part", "done", "checked", "handed_over"];

const t9n = {
  cs: {
    back: "← Zpět na zakázky", eyebrow: "MM CUSTOMER SERVICE",
    loading: "Načítám zakázku…", loadError: "Zakázku se nepodařilo načíst.", retry: "Zkusit znovu",
    cancelled: "Zakázka je stornovaná", invoiced: "Zakázka je vyfakturovaná a uzavřená pro úpravy",
    unlock: "Odemknout pro úpravu", cancel: "Stornovat zakázku", cancelConfirm: "Opravdu stornovat celou zakázku? Motory na ní zůstanou v historii, jen se zakázka označí jako stornovaná.",
    cancelReason: "Důvod stornování", invoice: "Vyfakturováno", invoiceButton: "Označit jako vyfakturováno", printButton: "Tisk",
    deleteOrder: "Smazat zakázku", inTrash: "Zakázka je v koši — smaže se navždy za 30 dní od smazání.",
    restoreFromTrash: "Obnovit z koše", restoreError: "Zakázku se nepodařilo obnovit.",
    deleteTitle: "Smazat zakázku?", deleteIntro: "Zakázka půjde do koše. Po 30 dnech zmizí navždy — do té doby ji superadmin může v koši obnovit.",
    deleteWillDisappear: "Co zmizí z běžného přehledu:", deleteEngines: (n: number) => `${n} ${n === 1 ? "motor" : n < 5 ? "motory" : "motorů"}`,
    deleteWorks: (n: number) => `${n} ${n === 1 ? "provedená práce" : n < 5 ? "provedené práce" : "provedených prací"}`,
    deleteMaterials: (n: number) => `${n} ${n === 1 ? "položka materiálu" : n < 5 ? "položky materiálu" : "položek materiálu"}`,
    deleteWaiting: (n: number) => `${n} ${n === 1 ? "čekající díl" : n < 5 ? "čekající díly" : "čekajících dílů"}`,
    deletePhotos: (n: number) => `${n} ${n === 1 ? "fotka" : n < 5 ? "fotky" : "fotek"}`,
    deleteConfirmButton: "Smazat do koše", deleteError: "Zakázku se nepodařilo smazat.",
    customer: "Zákazník", currency: "Měna", discountWork: "Sleva na práci", discountMaterial: "Sleva na materiál",
    received: "Přijato", deadline: "Termín", deadlineNote: "Poznámka k termínu", customerNote: "Co zákazník řekl", internalNote: "Interní poznámka",
    handover: "Předání", handoverPersonal: "Osobně", handoverCarrier: "Přeprava", handoverRace: "Na závod",
    carrier: "Dopravce", tracking: "Sledovací číslo", shipping: "Cena dopravy", shippedAt: "Odesláno",
    save: "Uložit", saving: "Ukládám…", saved: "Uloženo",
    engines: "Motory na zakázce", addEngine: "＋ Přidat motor",
    engineMinutes: "Motohodiny při příjmu", scope: "Rozsah prací", carbServiceFlag: "Servis karburátoru", customerPartsFlag: "Vlastní díly zákazníka",
    status: "Stav", takenBy: "Vzal si", completedBy: "Dokončil", reopenReason: "Důvod vrácení",
    works: "Provedené práce", materials: "Použitý materiál", waiting: "Čeká na díl",
    addWork: "＋ Práce", addMaterial: "＋ Materiál", addWaiting: "＋ Očekávaný díl",
    pickPriceItem: "Vyber z ceníku…", manualLine: "Vlastní řádek", workName: "Název práce", quantity: "Množství",
    priceCzk: "Cena CZK", priceEur: "Cena EUR", discountPercent: "Sleva %", lineTotal: "Celkem",
    delete: "Smazat", pickInventoryPart: "Vyber ze skladu…", manualMaterial: "Vlastní materiál", materialName: "Název materiálu",
    materialSource: "Zdroj", sourceStock: "Sklad", sourceCustomer: "Zákazníkův díl",
    waitingName: "Název dílu", waitingExpected: "Očekáváno", waitingOrdered: "Objednáno", waitingArrived: "Dorazilo",
    engineSubtotal: "Mezisoučet motoru", orderTotal: "Celkem zakázka bez DPH", vatNote: "Ceny jsou bez DPH.",
    mixedCurrencyNote: "Ne všechny řádky mají cenu i v druhé měně — druhý součet se proto nezobrazuje.",
    photos: "Fotky", uploadPhoto: "Přidat fotky", download: "Stáhnout",
    existingEngine: "Existující motor zákazníka", newEngine: "Nový motor", code: "Výrobní číslo", type: "Typ motoru",
    pickEngine: "Vyber motor…", pickType: "Vyber typ…", note: "Poznámka", cancelForm: "Zrušit", add: "Přidat",
  },
  en: {
    back: "← Back to orders", eyebrow: "MM CUSTOMER SERVICE",
    loading: "Loading order…", loadError: "The order could not be loaded.", retry: "Try again",
    cancelled: "This order is cancelled", invoiced: "This order is invoiced and locked for edits",
    unlock: "Unlock for editing", cancel: "Cancel order", cancelConfirm: "Cancel this whole order? Its engines stay in history, the order is just marked as cancelled.",
    cancelReason: "Cancellation reason", invoice: "Invoiced", invoiceButton: "Mark as invoiced", printButton: "Print",
    deleteOrder: "Delete order", inTrash: "This order is in trash — it disappears for good 30 days after deletion.",
    restoreFromTrash: "Restore from trash", restoreError: "Could not restore the order.",
    deleteTitle: "Delete this order?", deleteIntro: "The order goes to trash. It disappears for good after 30 days — until then a superadmin can restore it from trash.",
    deleteWillDisappear: "What disappears from the regular view:", deleteEngines: (n: number) => `${n} engine${n === 1 ? "" : "s"}`,
    deleteWorks: (n: number) => `${n} work item${n === 1 ? "" : "s"}`,
    deleteMaterials: (n: number) => `${n} material item${n === 1 ? "" : "s"}`,
    deleteWaiting: (n: number) => `${n} waiting part${n === 1 ? "" : "s"}`,
    deletePhotos: (n: number) => `${n} photo${n === 1 ? "" : "s"}`,
    deleteConfirmButton: "Delete to trash", deleteError: "Could not delete the order.",
    customer: "Customer", currency: "Currency", discountWork: "Work discount", discountMaterial: "Material discount",
    received: "Received", deadline: "Deadline", deadlineNote: "Deadline note", customerNote: "What the customer said", internalNote: "Internal note",
    handover: "Hand-over", handoverPersonal: "In person", handoverCarrier: "Carrier", handoverRace: "To a race",
    carrier: "Carrier", tracking: "Tracking number", shipping: "Shipping price", shippedAt: "Shipped",
    save: "Save", saving: "Saving…", saved: "Saved",
    engines: "Engines on the order", addEngine: "＋ Add engine",
    engineMinutes: "Engine hours at drop-off", scope: "Scope of work", carbServiceFlag: "Carburetor service", customerPartsFlag: "Customer's own parts",
    status: "Status", takenBy: "Taken by", completedBy: "Completed by", reopenReason: "Reopen reason",
    works: "Work performed", materials: "Material used", waiting: "Waiting for part",
    addWork: "＋ Work", addMaterial: "＋ Material", addWaiting: "＋ Expected part",
    pickPriceItem: "Pick from price list…", manualLine: "Custom line", workName: "Work name", quantity: "Quantity",
    priceCzk: "Price CZK", priceEur: "Price EUR", discountPercent: "Discount %", lineTotal: "Total",
    delete: "Delete", pickInventoryPart: "Pick from stock…", manualMaterial: "Custom material", materialName: "Material name",
    materialSource: "Source", sourceStock: "Stock", sourceCustomer: "Customer's part",
    waitingName: "Part name", waitingExpected: "Expected", waitingOrdered: "Ordered", waitingArrived: "Arrived",
    engineSubtotal: "Engine subtotal", orderTotal: "Order total excl. VAT", vatNote: "Prices exclude VAT.",
    mixedCurrencyNote: "Not every line has a price in the second currency, so its total is hidden.",
    photos: "Photos", uploadPhoto: "Add photos", download: "Download",
    existingEngine: "Customer's existing engine", newEngine: "New engine", code: "Serial number", type: "Engine type",
    pickEngine: "Pick an engine…", pickType: "Pick a type…", note: "Note", cancelForm: "Cancel", add: "Add",
  },
} as const;

type Copy = (typeof t9n)[Locale];

function statusLabel(status: OrderStatus, locale: Locale) {
  const map = {
    cs: { received: "Přijato", in_progress: "V práci", waiting_part: "Čeká na díl", done: "Hotovo", checked: "Zkontrolováno", handed_over: "Vydáno" },
    en: { received: "Received", in_progress: "In progress", waiting_part: "Waiting for part", done: "Done", checked: "Checked", handed_over: "Handed over" },
  };
  return map[locale][status];
}
function statusTone(status: OrderStatus) {
  if (status === "done" || status === "checked" || status === "handed_over") return "success";
  if (status === "waiting_part") return "warning-pill";
  if (status === "in_progress") return "info-pill";
  return "neutral";
}
function formatMoney(cents: number, currency: "CZK" | "EUR", locale: Locale) {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}
function fromCents(cents: number) {
  return cents === 0 ? "" : (cents / 100).toFixed(2).replace(/\.00$/, "");
}
function toCents(value: string) {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : 0;
}
/** Součet v druhé měně se zobrazí jen tehdy, když ji mají všechny řádky — jinak by to byla tichá nula. */
function sumWithCurrencyCheck(lines: Array<{ totalCzkCents: number; totalEurCents: number }>) {
  const czk = lines.reduce((sum, line) => sum + line.totalCzkCents, 0);
  const eur = lines.reduce((sum, line) => sum + line.totalEurCents, 0);
  const allHaveEur = lines.every((line) => line.totalEurCents > 0);
  const allHaveCzk = lines.every((line) => line.totalCzkCents > 0);
  return { czk: allHaveCzk || lines.length === 0 ? czk : czk, eur, hasEur: lines.length === 0 || allHaveEur, hasCzk: lines.length === 0 || allHaveCzk };
}

async function api(path: string, method: string, body?: unknown) {
  const response = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || "request failed");
  return data;
}

export function ServiceOrderDetail({ orderId, locale, role, onClose }: { orderId: string; locale: Locale; role: Role; onClose: () => void }) {
  const t = t9n[locale];
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [inventoryParts, setInventoryParts] = useState<InventoryPart[]>([]);
  const [engineTypes, setEngineTypes] = useState<EngineTypeOption[]>([]);
  const [customerEngines, setCustomerEngines] = useState<CustomerEngineOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState("");
  const [addingEngine, setAddingEngine] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canManage = role === "superadmin" || role === "boss";
  const canUnlock = role === "superadmin";

  async function load() {
    setLoadError(false);
    try {
      const [orderResponse, priceResponse, inventoryResponse, typesResponse] = await Promise.all([
        fetch(`/api/service-orders?id=${encodeURIComponent(orderId)}`, { cache: "no-store" }),
        fetch("/api/service-price-items", { cache: "no-store" }),
        fetch("/api/inventory", { cache: "no-store" }),
        fetch("/api/service-engine-types", { cache: "no-store" }),
      ]);
      if (!orderResponse.ok || !priceResponse.ok || !inventoryResponse.ok || !typesResponse.ok) throw new Error("load failed");
      const orderData = (await orderResponse.json()) as { order: OrderDetail };
      const priceData = (await priceResponse.json()) as { items: PriceItem[] };
      const inventoryData = (await inventoryResponse.json()) as { parts: InventoryPart[] };
      const typesData = (await typesResponse.json()) as { types: EngineTypeOption[] };
      setOrder(orderData.order);
      setPriceItems(priceData.items.filter((item) => item.isActive));
      setInventoryParts(inventoryData.parts);
      setEngineTypes(typesData.types.filter((type) => type.isActive));
      const customerEnginesResponse = await fetch(`/api/customer-engines?customerId=${encodeURIComponent(orderData.order.customerId)}`, { cache: "no-store" });
      if (customerEnginesResponse.ok) {
        const data = (await customerEnginesResponse.json()) as { engines: CustomerEngineOption[] };
        setCustomerEngines(data.engines.filter((engine) => engine.isActive));
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [orderId]);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "error");
    }
  }

  if (loading) return <section className="dash-panel"><LoadingState label={t.loading} /></section>;
  if (loadError || !order) {
    return (
      <section className="dash-panel">
        <EmptyState variant="error" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }

  const engineTotals = order.engines.map((engine) => ({
    engineId: engine.id,
    works: sumWithCurrencyCheck(engine.works),
    materials: sumWithCurrencyCheck(engine.materials),
  }));
  const orderCzkTotal = engineTotals.reduce((sum, item) => sum + item.works.czk + item.materials.czk, 0);
  const orderEurTotal = engineTotals.reduce((sum, item) => sum + item.works.eur + item.materials.eur, 0);
  const allLines = order.engines.flatMap((engine) => [...engine.works, ...engine.materials]);
  const orderHasEur = allLines.length === 0 || allLines.every((line) => line.totalEurCents > 0);
  // V koši je zakázka jen zneviditelněná, ne fyzicky smazaná (viz purgeExpiredTrash na serveru) —
  // do skutečného smazání za 30 dní se ale nesmí dát editovat ani obnovovat kliknutím na nic jiného.
  const isTrashed = Boolean(order.deletedAt);

  return (
    <div className="service-order-detail">
      <button className="secondary-compact service-order-back" type="button" onClick={onClose}>{t.back}</button>

      <section className="dash-panel tab-panel-header">
        <div><span className="eyebrow">{t.eyebrow}</span><h2>{order.number}</h2><p>{order.customerName}</p></div>
        <div className="service-order-header-actions">
          {isTrashed && <span className="status-pill danger">🗑 {t.inTrash}</span>}
          {!isTrashed && order.cancelledAt && <span className="status-pill danger">{t.cancelled}</span>}
          {!isTrashed && !order.cancelledAt && order.invoicedAt && !order.locked && <span className="status-pill neutral">{t.invoice}</span>}
          {!isTrashed && !order.cancelledAt && order.locked && <span className="status-pill neutral">{t.invoiced}</span>}
          {!isTrashed && <ServiceOrderPrintButton order={order} locale={locale} label={t.printButton} />}
          {isTrashed && role === "superadmin" && (
            <button className="secondary-compact" type="button" onClick={() => void run(() => api("/api/service-orders", "PUT", { kind: "restore", orderId: order.id }))}>
              ↺ {t.restoreFromTrash}
            </button>
          )}
          {!isTrashed && order.locked && canUnlock && (
            <button className="secondary-compact" type="button" onClick={() => void run(() => api("/api/service-orders", "PUT", { kind: "unlock", orderId: order.id }))}>{t.unlock}</button>
          )}
          {!isTrashed && !order.cancelledAt && !order.invoicedAt && canManage && (
            <button className="secondary-compact" type="button" onClick={() => void run(() => api("/api/service-orders", "PUT", { kind: "invoice", orderId: order.id }))}>{t.invoiceButton}</button>
          )}
          {!isTrashed && !order.cancelledAt && role === "superadmin" && (
            <button className="danger-compact" type="button" onClick={() => {
              const reason = window.prompt(t.cancelReason) ?? "";
              if (window.confirm(t.cancelConfirm)) void run(() => api("/api/service-orders", "DELETE", { id: order.id, reason }));
            }}>{t.cancel}</button>
          )}
          {!isTrashed && role === "superadmin" && (
            <button className="danger-compact" type="button" onClick={() => setDeleting(true)}>🗑 {t.deleteOrder}</button>
          )}
        </div>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}

      <OrderHeaderForm order={order} locale={locale} canManage={canManage && !order.locked && !order.cancelledAt && !isTrashed} onSaved={() => void load()} onError={setError} />

      <section className="dash-panel">
        <header className="settings-section-heading">
          <h3>{t.engines}</h3>
          {canManage && !order.locked && !order.cancelledAt && !isTrashed && <button className="secondary-compact" type="button" onClick={() => setAddingEngine(true)}>{t.addEngine}</button>}
        </header>

        {order.engines.length === 0 && <EmptyState size="inline" title={locale === "cs" ? "Zatím žádný motor" : "No engine yet"} />}

        {order.engines.map((engine, index) => (
          <EngineCard key={engine.id} engine={engine} locale={locale} currency={order.currency} canManage={canManage} locked={order.locked || Boolean(order.cancelledAt) || isTrashed}
            priceItems={priceItems} inventoryParts={inventoryParts}
            subtotals={engineTotals[index]}
            onChanged={() => void load()} onError={setError} />
        ))}

        {order.engines.length > 0 && (
          <div className="service-order-grand-total">
            <span>{t.orderTotal}</span>
            <strong>{formatMoney(order.currency === "EUR" ? orderEurTotal : orderCzkTotal, order.currency, locale)}</strong>
            {order.currency === "CZK" && orderHasEur && <small>{formatMoney(orderEurTotal, "EUR", locale)}</small>}
            {order.currency === "EUR" && orderHasEur && <small>{formatMoney(orderCzkTotal, "CZK", locale)}</small>}
            {!orderHasEur && <small className="form-hint">{t.mixedCurrencyNote}</small>}
          </div>
        )}
      </section>

      <PhotosSection order={order} locale={locale} canManage={canManage && !isTrashed} onChanged={() => void load()} onError={setError} />

      {addingEngine && (
        <AddEngineModal locale={locale} orderId={order.id} customerEngines={customerEngines} engineTypes={engineTypes}
          onClose={() => setAddingEngine(false)} onAdded={() => { setAddingEngine(false); void load(); }} onError={setError} />
      )}

      {deleting && (
        <DeleteOrderModal t={t} order={order}
          onClose={() => setDeleting(false)}
          onDeleted={() => { setDeleting(false); onClose(); }}
          onError={setError} />
      )}
    </div>
  );
}

function OrderHeaderForm({ order, locale, canManage, onSaved, onError }: {
  order: OrderDetail; locale: Locale; canManage: boolean; onSaved: () => void; onError: (message: string) => void;
}) {
  const t = t9n[locale];
  const [currency, setCurrency] = useState(order.currency);
  const [discountWorkPercent, setDiscountWorkPercent] = useState(order.discountWorkPercent);
  const [discountMaterialPercent, setDiscountMaterialPercent] = useState(order.discountMaterialPercent);
  const [deadlineDate, setDeadlineDate] = useState(order.deadlineDate);
  const [deadlineNote, setDeadlineNote] = useState(order.deadlineNote);
  const [customerNote, setCustomerNote] = useState(order.customerNote);
  const [internalNote, setInternalNote] = useState(order.internalNote);
  const [handoverType, setHandoverType] = useState(order.handoverType);
  const [carrier, setCarrier] = useState(order.carrier);
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber);
  const [shippingPriceCzk, setShippingPriceCzk] = useState(fromCents(order.shippingPriceCzkCents));
  const [shippingPriceEur, setShippingPriceEur] = useState(fromCents(order.shippingPriceEurCents));
  const [shippedAt, setShippedAt] = useState(order.shippedAt);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/service-orders", "PUT", {
        kind: "order", id: order.id, currency, discountWorkPercent, discountMaterialPercent,
        deadlineDate, deadlineNote, customerNote, internalNote, handoverType, carrier, trackingNumber,
        shippingPriceCzkCents: toCents(shippingPriceCzk), shippingPriceEurCents: toCents(shippingPriceEur), shippedAt,
      });
      setDirty(false);
      onSaved();
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dash-panel">
      <div className="form-grid">
        <label><span>{t.customer}</span><input value={order.customerName} disabled /></label>
        <label><span>{t.received}</span><input value={order.receivedAt} disabled /></label>
        <label><span>{t.currency}</span>
          <select value={currency} disabled={!canManage} onChange={(event) => { setCurrency(event.target.value as "CZK" | "EUR"); setDirty(true); }}>
            <option value="CZK">CZK</option><option value="EUR">EUR</option>
          </select>
        </label>
        <label><span>{t.discountWork} (%)</span><input type="number" min="0" max="100" disabled={!canManage} value={discountWorkPercent} onChange={(event) => { setDiscountWorkPercent(Number(event.target.value)); setDirty(true); }} /></label>
        <label><span>{t.discountMaterial} (%)</span><input type="number" min="0" max="100" disabled={!canManage} value={discountMaterialPercent} onChange={(event) => { setDiscountMaterialPercent(Number(event.target.value)); setDirty(true); }} /></label>
        <label><span>{t.deadline}</span><input type="date" disabled={!canManage} value={deadlineDate} onChange={(event) => { setDeadlineDate(event.target.value); setDirty(true); }} /></label>
        <label className="full-field"><span>{t.deadlineNote}</span><input disabled={!canManage} value={deadlineNote} onChange={(event) => { setDeadlineNote(event.target.value); setDirty(true); }} maxLength={500} /></label>
        <label className="full-field"><span>{t.customerNote}</span><textarea rows={2} disabled={!canManage} value={customerNote} onChange={(event) => { setCustomerNote(event.target.value); setDirty(true); }} maxLength={2000} /></label>
        <label className="full-field"><span>{t.internalNote}</span><textarea rows={2} disabled={!canManage} value={internalNote} onChange={(event) => { setInternalNote(event.target.value); setDirty(true); }} maxLength={2000} /></label>
        <label><span>{t.handover}</span>
          <select disabled={!canManage} value={handoverType} onChange={(event) => { setHandoverType(event.target.value as OrderDetail["handoverType"]); setDirty(true); }}>
            <option value="personal">{t.handoverPersonal}</option><option value="carrier">{t.handoverCarrier}</option><option value="race">{t.handoverRace}</option>
          </select>
        </label>
        {handoverType === "carrier" && <>
          <label><span>{t.carrier}</span><input disabled={!canManage} value={carrier} onChange={(event) => { setCarrier(event.target.value); setDirty(true); }} maxLength={160} /></label>
          <label><span>{t.tracking}</span><input disabled={!canManage} value={trackingNumber} onChange={(event) => { setTrackingNumber(event.target.value); setDirty(true); }} maxLength={160} /></label>
          <label><span>{t.shipping} CZK</span><input disabled={!canManage} value={shippingPriceCzk} onChange={(event) => { setShippingPriceCzk(event.target.value); setDirty(true); }} /></label>
          <label><span>{t.shipping} EUR</span><input disabled={!canManage} value={shippingPriceEur} onChange={(event) => { setShippingPriceEur(event.target.value); setDirty(true); }} /></label>
          <label><span>{t.shippedAt}</span><input type="date" disabled={!canManage} value={shippedAt} onChange={(event) => { setShippedAt(event.target.value); setDirty(true); }} /></label>
        </>}
      </div>
      {canManage && dirty && (
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? t.saving : t.save}</button>
        </footer>
      )}
    </section>
  );
}

function EngineCard({ engine, locale, currency, canManage, locked, priceItems, inventoryParts, subtotals, onChanged, onError }: {
  engine: OrderEngine; locale: Locale; currency: "CZK" | "EUR"; canManage: boolean; locked: boolean;
  priceItems: PriceItem[]; inventoryParts: InventoryPart[];
  subtotals: { works: ReturnType<typeof sumWithCurrencyCheck>; materials: ReturnType<typeof sumWithCurrencyCheck> };
  onChanged: () => void; onError: (message: string) => void;
}) {
  const t = t9n[locale];
  const subtotalCzk = subtotals.works.czk + subtotals.materials.czk;
  const subtotalEur = subtotals.works.eur + subtotals.materials.eur;
  const hasEur = subtotals.works.hasEur && subtotals.materials.hasEur;

  async function setStatus(status: OrderStatus) {
    try {
      let reason: string | undefined;
      if (status === "in_progress" && (engine.status === "done" || engine.status === "checked")) {
        reason = window.prompt(t.reopenReason) ?? "";
      }
      await api("/api/service-orders", "PUT", { kind: "engineStatus", orderEngineId: engine.id, status, reason });
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "error");
    }
  }

  return (
    <article className="service-order-engine-card">
      <header className="service-order-engine-header">
        <div>
          <strong>{engine.engineCode}</strong>
          <span className="service-order-engine-type">{locale === "cs" ? engine.typeNameCs : engine.typeNameEn}</span>
        </div>
        <div className="service-order-engine-status">
          <span className={`status-pill ${statusTone(engine.status)}`}>{statusLabel(engine.status, locale)}</span>
          {canManage && !locked && (
            <select value={engine.status} onChange={(event) => void setStatus(event.target.value as OrderStatus)}>
              {STATUS_ORDER.map((status) => <option key={status} value={status}>{statusLabel(status, locale)}</option>)}
            </select>
          )}
        </div>
      </header>

      {engine.takenByName && <p className="service-order-engine-meta">{t.takenBy}: {engine.takenByName}</p>}
      {engine.completedByName && <p className="service-order-engine-meta">{t.completedBy}: {engine.completedByName}</p>}
      {engine.reopenReason && <p className="form-hint">{t.reopenReason}: {engine.reopenReason}</p>}

      {engine.scope && <p className="service-order-engine-scope"><strong>{t.scope}:</strong> {engine.scope}</p>}
      <p className="service-order-engine-flags">
        {engine.engineMinutes !== null && <span>{t.engineMinutes}: {engine.engineMinutes} min</span>}
        {engine.carbService && <span className="status-pill neutral">{t.carbServiceFlag}</span>}
        {engine.customerParts && <span className="status-pill neutral">{t.customerPartsFlag}: {engine.customerPartsText || "—"}</span>}
      </p>

      <LinesTable kind="work" engine={engine} locale={locale} canManage={canManage} locked={locked} priceItems={priceItems} onChanged={onChanged} onError={onError} />
      <LinesTable kind="material" engine={engine} locale={locale} canManage={canManage} locked={locked} inventoryParts={inventoryParts} onChanged={onChanged} onError={onError} />
      <WaitingPartsTable engine={engine} locale={locale} canManage={canManage} locked={locked} onChanged={onChanged} onError={onError} />

      <footer className="service-order-engine-subtotal">
        <span>{t.engineSubtotal}</span>
        <strong>{formatMoney(currency === "EUR" ? subtotalEur : subtotalCzk, currency, locale)}</strong>
        {hasEur && (currency === "CZK" ? <small>{formatMoney(subtotalEur, "EUR", locale)}</small> : <small>{formatMoney(subtotalCzk, "CZK", locale)}</small>)}
      </footer>
    </article>
  );
}

function LinesTable({ kind, engine, locale, canManage, locked, priceItems, inventoryParts, onChanged, onError }: {
  kind: "work" | "material"; engine: OrderEngine; locale: Locale; canManage: boolean; locked: boolean;
  priceItems?: PriceItem[]; inventoryParts?: InventoryPart[]; onChanged: () => void; onError: (message: string) => void;
}) {
  const t = t9n[locale];
  const [adding, setAdding] = useState(false);
  const lines = kind === "work" ? engine.works : engine.materials;

  async function remove(id: string) {
    try {
      await api("/api/service-orders", "PUT", { kind, action: "delete", id });
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "error");
    }
  }

  return (
    <div className="service-order-lines">
      <div className="service-order-lines-head">
        <h4>{kind === "work" ? t.works : t.materials}</h4>
        {canManage && !locked && <button className="secondary-compact" type="button" onClick={() => setAdding(true)}>{kind === "work" ? t.addWork : t.addMaterial}</button>}
      </div>
      {lines.length === 0 ? <p className="form-hint">—</p> : (
        <div className="table-wrap">
          <table className="settings-table service-order-lines-table">
            <thead><tr>
              <th>{kind === "work" ? t.workName : t.materialName}</th><th>{t.quantity}</th>
              <th className="price-cell">{t.priceCzk}</th><th className="price-cell">{t.priceEur}</th>
              <th>{t.discountPercent}</th><th className="price-cell">{t.lineTotal}</th>
              {kind === "material" && <th>{t.materialSource}</th>}
              {canManage && !locked && <th className="action-column">{t.delete}</th>}
            </tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{kind === "work" ? (line as WorkLine).nameCsSnapshot : (line as MaterialLine).name}</td>
                  <td>{line.quantity}</td>
                  <td className="price-cell">{formatMoney(line.unitPriceCzkCents, "CZK", locale)}</td>
                  <td className="price-cell">{formatMoney(line.unitPriceEurCents, "EUR", locale)}</td>
                  <td>{line.discountPercent}%</td>
                  <td className="price-cell">{formatMoney(line.totalCzkCents, "CZK", locale)}</td>
                  {kind === "material" && <td>{(line as MaterialLine).source === "customer" ? t.sourceCustomer : t.sourceStock}</td>}
                  {canManage && !locked && <td className="action-column"><button className="delete" type="button" onClick={() => void remove(line.id)}>🗑</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && (
        <AddLineForm kind={kind} orderEngineId={engine.id} locale={locale} priceItems={priceItems} inventoryParts={inventoryParts}
          onClose={() => setAdding(false)} onAdded={() => { setAdding(false); onChanged(); }} onError={onError} />
      )}
    </div>
  );
}

function AddLineForm({ kind, orderEngineId, locale, priceItems, inventoryParts, onClose, onAdded, onError }: {
  kind: "work" | "material"; orderEngineId: string; locale: Locale; priceItems?: PriceItem[]; inventoryParts?: InventoryPart[];
  onClose: () => void; onAdded: () => void; onError: (message: string) => void;
}) {
  const t = t9n[locale];
  const [pickedId, setPickedId] = useState("");
  const [manual, setManual] = useState(false);
  const [name, setName] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [priceCzk, setPriceCzk] = useState("");
  const [priceEur, setPriceEur] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [source, setSource] = useState<"stock" | "customer">("stock");
  const [saving, setSaving] = useState(false);

  const options = kind === "work" ? priceItems ?? [] : (inventoryParts ?? []).map((part) => ({ id: part.id, code: part.code, nameCs: part.name, nameEn: part.name, priceCzkCents: part.priceCzkCents, priceEurCents: part.priceEurCents }));

  async function submit() {
    if (!manual && !pickedId) { onError(kind === "work" ? t.pickPriceItem : t.pickInventoryPart); return; }
    if (manual && !name.trim()) { onError(kind === "work" ? t.workName : t.materialName); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        kind, action: "create", orderEngineId,
        quantity: Number(quantityText) || 1,
        discountPercent: discountPercent.trim() ? Number(discountPercent) : undefined,
      };
      if (kind === "work") {
        if (manual) { body.nameCsSnapshot = name.trim(); body.unitPriceCzkCents = toCents(priceCzk); body.unitPriceEurCents = toCents(priceEur); }
        else body.priceItemId = pickedId;
      } else {
        if (manual) { body.name = name.trim(); body.unitPriceCzkCents = toCents(priceCzk); body.unitPriceEurCents = toCents(priceEur); body.source = source; }
        else { body.inventoryPartId = pickedId; body.source = source; }
      }
      await api("/api/service-orders", "PUT", body);
      onAdded();
    } catch (error) {
      onError(error instanceof Error ? error.message : "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="service-order-add-line">
      <div className="form-grid">
        {!manual && (
          <label className="full-field"><span>{kind === "work" ? t.pickPriceItem : t.pickInventoryPart}</span>
            <select value={pickedId} onChange={(event) => setPickedId(event.target.value)}>
              <option value="">{kind === "work" ? t.pickPriceItem : t.pickInventoryPart}</option>
              {options.map((option) => <option key={option.id} value={option.id}>{option.code} · {locale === "cs" ? option.nameCs : option.nameEn}</option>)}
            </select>
          </label>
        )}
        <label><input type="checkbox" checked={manual} onChange={(event) => setManual(event.target.checked)} /> {t.manualLine}</label>
        {manual && (<>
          <label className="full-field"><span>{kind === "work" ? t.workName : t.materialName}</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} autoFocus /></label>
          <label><span>{t.priceCzk}</span><input value={priceCzk} onChange={(event) => setPriceCzk(event.target.value)} inputMode="decimal" /></label>
          <label><span>{t.priceEur}</span><input value={priceEur} onChange={(event) => setPriceEur(event.target.value)} inputMode="decimal" /></label>
        </>)}
        <label><span>{t.quantity}</span><input type="number" min="1" value={quantityText} onChange={(event) => setQuantityText(event.target.value)} /></label>
        <label><span>{t.discountPercent}</span><input type="number" min="0" max="100" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} /></label>
        {kind === "material" && (
          <label><span>{t.materialSource}</span>
            <select value={source} onChange={(event) => setSource(event.target.value as "stock" | "customer")}>
              <option value="stock">{t.sourceStock}</option><option value="customer">{t.sourceCustomer}</option>
            </select>
          </label>
        )}
      </div>
      <footer className="modal-actions">
        <span className="modal-actions-spacer" />
        <button className="secondary-compact" type="button" onClick={onClose}>{t.cancelForm}</button>
        <button className="primary-button" type="button" disabled={saving} onClick={() => void submit()}>{t.add}</button>
      </footer>
    </div>
  );
}

function WaitingPartsTable({ engine, locale, canManage, locked, onChanged, onError }: {
  engine: OrderEngine; locale: Locale; canManage: boolean; locked: boolean; onChanged: () => void; onError: (message: string) => void;
}) {
  const t = t9n[locale];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [isOrdered, setIsOrdered] = useState(false);
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!name.trim()) { onError(t.waitingName); return; }
    setSaving(true);
    try {
      await api("/api/service-orders", "PUT", { kind: "waitingPart", action: "create", orderEngineId: engine.id, name: name.trim(), code, expectedDate, isOrdered });
      // „Čeká na díl“ je stav motoru, ne jen záznam čekajícího dílu — přepnout ho ručně.
      if (engine.status !== "waiting_part") await api("/api/service-orders", "PUT", { kind: "engineStatus", orderEngineId: engine.id, status: "waiting_part" });
      setName(""); setCode(""); setExpectedDate(""); setIsOrdered(false); setAdding(false);
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "error");
    } finally {
      setSaving(false);
    }
  }
  async function markArrived(id: string) {
    try { await api("/api/service-orders", "PUT", { kind: "waitingPart", action: "arrived", id }); onChanged(); }
    catch (error) { onError(error instanceof Error ? error.message : "error"); }
  }
  async function remove(id: string) {
    try { await api("/api/service-orders", "PUT", { kind: "waitingPart", action: "delete", id }); onChanged(); }
    catch (error) { onError(error instanceof Error ? error.message : "error"); }
  }

  return (
    <div className="service-order-lines">
      <div className="service-order-lines-head">
        <h4>{t.waiting}</h4>
        {canManage && !locked && <button className="secondary-compact" type="button" onClick={() => setAdding(true)}>{t.addWaiting}</button>}
      </div>
      {engine.waitingParts.length === 0 ? <p className="form-hint">—</p> : (
        <div className="table-wrap">
          <table className="settings-table">
            <thead><tr><th>{t.waitingName}</th><th>{t.waitingExpected}</th><th>{t.waitingOrdered}</th><th>{t.waitingArrived}</th>{canManage && !locked && <th className="action-column">{t.delete}</th>}</tr></thead>
            <tbody>
              {engine.waitingParts.map((part) => (
                <tr key={part.id}>
                  <td>{part.name}{part.code ? ` (${part.code})` : ""}</td>
                  <td>{part.expectedDate || "—"}</td>
                  <td><span className={`status-pill ${part.isOrdered ? "success" : "neutral"}`}>{part.isOrdered ? "✓" : "—"}</span></td>
                  <td>
                    {part.arrivedAt
                      ? <span className="status-pill success">✓</span>
                      : (canManage && !locked && <button className="secondary-compact" type="button" onClick={() => void markArrived(part.id)}>{t.waitingArrived}</button>)}
                  </td>
                  {canManage && !locked && <td className="action-column"><button className="delete" type="button" onClick={() => void remove(part.id)}>🗑</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && (
        <div className="service-order-add-line">
          <div className="form-grid">
            <label className="full-field"><span>{t.waitingName}</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={200} /></label>
            <label><span>{t.code}</span><input value={code} onChange={(event) => setCode(event.target.value)} maxLength={60} /></label>
            <label><span>{t.waitingExpected}</span><input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></label>
            <label><input type="checkbox" checked={isOrdered} onChange={(event) => setIsOrdered(event.target.checked)} /> {t.waitingOrdered}</label>
          </div>
          <footer className="modal-actions">
            <span className="modal-actions-spacer" />
            <button className="secondary-compact" type="button" onClick={() => setAdding(false)}>{t.cancelForm}</button>
            <button className="primary-button" type="button" disabled={saving} onClick={() => void add()}>{t.add}</button>
          </footer>
        </div>
      )}
    </div>
  );
}

function PhotosSection({ order, locale, canManage, onChanged, onError }: {
  order: OrderDetail; locale: Locale; canManage: boolean; onChanged: () => void; onError: (message: string) => void;
}) {
  const t = t9n[locale];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(files: FileList) {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("orderId", order.id);
      for (const file of Array.from(files)) form.append("files", file);
      const response = await fetch("/api/service-order-photos", { method: "POST", body: form });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "upload failed");
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
  async function remove(id: string) {
    try {
      await api("/api/service-order-photos", "DELETE", { id });
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "error");
    }
  }

  return (
    <section className="dash-panel">
      <header className="settings-section-heading">
        <h3>{t.photos}</h3>
        {canManage && (
          <label className="secondary-compact service-order-photo-upload">
            <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden
              onChange={(event) => { if (event.target.files?.length) void upload(event.target.files); }} />
            {uploading ? t.saving : t.uploadPhoto}
          </label>
        )}
      </header>
      {order.photos.length === 0 ? <p className="form-hint">—</p> : (
        <div className="engine-documents-list">
          {order.photos.map((photo) => (
            <article key={photo.id} className="engine-documents-row">
              <a className="engine-documents-preview" href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.fileName} /></a>
              <div className="engine-documents-meta"><strong>{photo.fileName}</strong></div>
              <div className="engine-documents-actions">
                <a className="secondary-compact" href={photo.url} target="_blank" rel="noreferrer">{t.download}</a>
                {canManage && <button className="danger-compact" type="button" onClick={() => void remove(photo.id)}>{t.delete}</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Potvrzení smazání zakázky — počty se čtou z už načteného `order`, žádný nový dotaz na
 * server. Ukazuje přesně to, co po odkliknutí zmizí z běžného přehledu (do koše, ne navždy).
 */
function DeleteOrderModal({ t, order, onClose, onDeleted, onError }: {
  t: Copy; order: OrderDetail; onClose: () => void; onDeleted: () => void; onError: (message: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const engineCount = order.engines.length;
  const workCount = order.engines.reduce((sum, engine) => sum + engine.works.length, 0);
  const materialCount = order.engines.reduce((sum, engine) => sum + engine.materials.length, 0);
  const waitingCount = order.engines.reduce((sum, engine) => sum + engine.waitingParts.length, 0);
  const photoCount = order.photos.length;

  async function submit() {
    setDeleting(true);
    try {
      await api("/api/service-orders", "PUT", { kind: "trash", orderId: order.id });
      onDeleted();
    } catch (error) {
      onError(error instanceof Error ? error.message : "error");
      setDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-order-title">
        <header className="modal-header">
          <div><h2 id="delete-order-title">{t.deleteTitle}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancelForm}>×</button>
        </header>
        <p>{t.deleteIntro}</p>
        <p><strong>{t.deleteWillDisappear}</strong></p>
        <ul className="service-order-delete-summary">
          <li>{t.deleteEngines(engineCount)}</li>
          {workCount > 0 && <li>{t.deleteWorks(workCount)}</li>}
          {materialCount > 0 && <li>{t.deleteMaterials(materialCount)}</li>}
          {waitingCount > 0 && <li>{t.deleteWaiting(waitingCount)}</li>}
          {photoCount > 0 && <li>{t.deletePhotos(photoCount)}</li>}
        </ul>
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancelForm}</button>
          <button className="danger-compact" type="button" disabled={deleting} onClick={() => void submit()}>{t.deleteConfirmButton}</button>
        </footer>
      </section>
    </div>
  );
}

function AddEngineModal({ locale, orderId, customerEngines, engineTypes, onClose, onAdded, onError }: {
  locale: Locale; orderId: string; customerEngines: CustomerEngineOption[]; engineTypes: EngineTypeOption[];
  onClose: () => void; onAdded: () => void; onError: (message: string) => void;
}) {
  const t = t9n[locale];
  const [mode, setMode] = useState<"existing" | "new">(customerEngines.length ? "existing" : "new");
  const [customerEngineId, setCustomerEngineId] = useState("");
  const [code, setCode] = useState("");
  const [serviceEngineTypeId, setServiceEngineTypeId] = useState("");
  const [scope, setScope] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (mode === "existing" && !customerEngineId) { onError(t.pickEngine); return; }
    if (mode === "new" && (!code.trim() || !serviceEngineTypeId)) { onError(t.code); return; }
    setSaving(true);
    try {
      await api("/api/service-orders", "PUT", {
        kind: "engine", orderId,
        customerEngineId: mode === "existing" ? customerEngineId : undefined,
        newEngine: mode === "new" ? { code: code.trim(), serviceEngineTypeId } : undefined,
        scope,
      });
      onAdded();
    } catch (error) {
      onError(error instanceof Error ? error.message : "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true">
        <header className="modal-header"><div><h2>{t.addEngine}</h2></div><button className="close-button" type="button" onClick={onClose}>×</button></header>
        <div className="form-grid">
          <label><input type="radio" checked={mode === "existing"} disabled={customerEngines.length === 0} onChange={() => setMode("existing")} /> {t.existingEngine}</label>
          <label><input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> {t.newEngine}</label>
          {mode === "existing" ? (
            <label className="full-field"><span>{t.pickEngine}</span>
              <select value={customerEngineId} onChange={(event) => setCustomerEngineId(event.target.value)}>
                <option value="">{t.pickEngine}</option>
                {customerEngines.map((engine) => <option key={engine.id} value={engine.id}>{engine.code} · {locale === "cs" ? engine.typeNameCs : engine.typeNameEn}</option>)}
              </select>
            </label>
          ) : (<>
            <label><span>{t.code}</span><input value={code} onChange={(event) => setCode(event.target.value)} maxLength={120} autoFocus /></label>
            <label><span>{t.type}</span>
              <select value={serviceEngineTypeId} onChange={(event) => setServiceEngineTypeId(event.target.value)}>
                <option value="">{t.pickType}</option>
                {engineTypes.map((type) => <option key={type.id} value={type.id}>{locale === "cs" ? type.nameCs : type.nameEn}</option>)}
              </select>
            </label>
          </>)}
          <label className="full-field"><span>{t.scope}</span><textarea rows={2} value={scope} onChange={(event) => setScope(event.target.value)} maxLength={2000} /></label>
        </div>
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancelForm}</button>
          <button className="primary-button" type="button" disabled={saving} onClick={() => void submit()}>{t.add}</button>
        </footer>
      </section>
    </div>
  );
}
