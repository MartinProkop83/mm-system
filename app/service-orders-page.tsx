"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";
import { ServiceOrderDetail } from "./service-order-detail";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
type OrderStatus = "received" | "in_progress" | "waiting_part" | "done" | "checked" | "handed_over";

type CustomerOption = { id: string; name: string; discountWorkPercent: number; discountMaterialPercent: number };
type CustomerEngineOption = { id: string; customerId: string; code: string; serviceEngineTypeId: string; typeNameCs: string; typeNameEn: string; isActive: boolean };
type EngineTypeOption = { id: string; code: string; nameCs: string; nameEn: string; isActive: boolean };

type OrderListItem = {
  id: string; number: string; customerId: string; customerName: string; currency: "CZK" | "EUR";
  receivedAt: string; deadlineDate: string; deadlineNote: string;
  invoicedAt: number | null; cancelledAt: number | null; deletedAt: number | null; deletedBy: string;
  engineCount: number; receivedCount: number; inProgressCount: number; waitingPartCount: number;
  doneCount: number; checkedCount: number; handedOverCount: number;
  totalCzkCents: number; totalEurCents: number;
};

const STATUS_FILTERS: Array<{ value: OrderStatus | ""; cs: string; en: string }> = [
  { value: "", cs: "Všechny stavy", en: "All statuses" },
  { value: "received", cs: "Přijato", en: "Received" },
  { value: "in_progress", cs: "V práci", en: "In progress" },
  { value: "waiting_part", cs: "Čeká na díl", en: "Waiting for part" },
  { value: "done", cs: "Hotovo", en: "Done" },
  { value: "checked", cs: "Zkontrolováno", en: "Checked" },
  { value: "handed_over", cs: "Vydáno", en: "Handed over" },
];

const content = {
  cs: {
    eyebrow: "MM CUSTOMER SERVICE",
    heading: "Zakázky",
    subtitle: "Zakázkový servis pro zákaznické motory — od příjmu po vydání.",
    add: "＋ Nová zakázka",
    loading: "Načítám zakázky…",
    loadError: "Zakázky se nepodařilo načíst.",
    retry: "Zkusit znovu",
    empty: "Zatím žádné zakázky",
    emptyHelp: "Založ první zakázku, ať se motor objeví ve frontě na servis.",
    emptyFiltered: "Žádná zakázka neodpovídá filtru",
    filterStatus: "Stav",
    filterCustomer: "Zákazník",
    allCustomers: "Všichni zákazníci",
    filterFrom: "Přijato od",
    filterTo: "Přijato do",
    number: "Číslo",
    customer: "Zákazník",
    engines: "Motory",
    status: "Stav",
    deadline: "Termín",
    total: "Celkem bez DPH",
    cancelled: "Stornováno",
    invoiced: "Vyfakturováno",
    trashFilter: "Koš",
    trashOn: "Zobrazeny jsou zakázky v koši",
    deletedAt: "Smazáno",
    restore: "Obnovit",
    restoreConfirm: (number: string) => `Obnovit zakázku ${number} z koše?`,
    restoreError: "Zakázku se nepodařilo obnovit.",
    emptyTrash: "Koš je prázdný",
    emptyTrashHelp: "Smazané zakázky sem přibydou na 30 dní, než zmizí navždy.",
  },
  en: {
    eyebrow: "MM CUSTOMER SERVICE",
    heading: "Orders",
    subtitle: "Customer engine service — from drop-off to hand-over.",
    add: "＋ New order",
    loading: "Loading orders…",
    loadError: "The orders could not be loaded.",
    retry: "Try again",
    empty: "No orders yet",
    emptyHelp: "Create the first order so the engine shows up in the service queue.",
    emptyFiltered: "No order matches the filter",
    filterStatus: "Status",
    filterCustomer: "Customer",
    allCustomers: "All customers",
    filterFrom: "Received from",
    filterTo: "Received to",
    number: "Number",
    customer: "Customer",
    engines: "Engines",
    status: "Status",
    deadline: "Deadline",
    total: "Total excl. VAT",
    cancelled: "Cancelled",
    invoiced: "Invoiced",
    trashFilter: "Trash",
    trashOn: "Showing orders in trash",
    deletedAt: "Deleted",
    restore: "Restore",
    restoreConfirm: (number: string) => `Restore order ${number} from trash?`,
    restoreError: "Could not restore the order.",
    emptyTrash: "The trash is empty",
    emptyTrashHelp: "Deleted orders stay here for 30 days before they are gone for good.",
  },
} as const;

function formatMoney(cents: number, currency: "CZK" | "EUR", locale: Locale) {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

/** Nejvýraznější stav zakázky pro přehled — čeká na díl a v práci jsou vidět nejdřív. */
function summaryStatus(order: OrderListItem): OrderStatus | "empty" {
  if (order.engineCount === 0) return "empty";
  if (order.waitingPartCount > 0) return "waiting_part";
  if (order.inProgressCount > 0) return "in_progress";
  if (order.receivedCount > 0) return "received";
  if (order.doneCount > 0) return "done";
  if (order.checkedCount > 0) return "checked";
  return "handed_over";
}

function statusLabel(status: OrderStatus | "empty", locale: Locale) {
  if (status === "empty") return locale === "cs" ? "Bez motoru" : "No engine";
  const found = STATUS_FILTERS.find((item) => item.value === status);
  return found ? (locale === "cs" ? found.cs : found.en) : status;
}

function statusTone(status: OrderStatus | "empty") {
  if (status === "done" || status === "checked" || status === "handed_over") return "success";
  if (status === "waiting_part") return "warning-pill";
  if (status === "in_progress") return "info-pill";
  return "neutral";
}

export function ServiceOrdersPage({ locale, role, initialOpenOrderId, onInitialOpenOrderIdConsumed }: {
  locale: Locale; role: Role;
  /** Deep-link z fronty (zákaznická deska) — otevře detail rovnou po přechodu do sekce. */
  initialOpenOrderId?: string | null;
  onInitialOpenOrderIdConsumed?: () => void;
}) {
  const t = content[locale];
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [engineTypes, setEngineTypes] = useState<EngineTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [openOrderId, setOpenOrderId] = useState<string | null>(initialOpenOrderId ?? null);
  const [trashView, setTrashView] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const canManage = role === "superadmin" || role === "boss";

  useEffect(() => {
    if (initialOpenOrderId) {
      setOpenOrderId(initialOpenOrderId);
      onInitialOpenOrderIdConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenOrderId]);

  async function load() {
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      if (trashView) {
        params.set("trash", "1");
      } else {
        if (statusFilter) params.set("status", statusFilter);
        if (customerFilter) params.set("customerId", customerFilter);
        if (fromFilter) params.set("receivedFrom", fromFilter);
        if (toFilter) params.set("receivedTo", toFilter);
      }
      const [ordersResponse, customersResponse, typesResponse] = await Promise.all([
        fetch(`/api/service-orders?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/customers", { cache: "no-store" }),
        fetch("/api/service-engine-types", { cache: "no-store" }),
      ]);
      if (!ordersResponse.ok || !customersResponse.ok || !typesResponse.ok) throw new Error("load failed");
      const ordersData = (await ordersResponse.json()) as { orders: OrderListItem[] };
      const customersData = (await customersResponse.json()) as { customers: CustomerOption[] };
      const typesData = (await typesResponse.json()) as { types: EngineTypeOption[] };
      setOrders(ordersData.orders);
      setCustomers(customersData.customers);
      setEngineTypes(typesData.types);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [statusFilter, customerFilter, fromFilter, toFilter, trashView]);

  async function restore(order: OrderListItem) {
    if (!window.confirm(t.restoreConfirm(order.number))) return;
    setRestoring(true);
    try {
      const response = await fetch("/api/service-orders", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "restore", orderId: order.id }) });
      if (!response.ok) throw new Error("restore failed");
      await load();
    } catch {
      window.alert(t.restoreError);
    } finally {
      setRestoring(false);
    }
  }

  const customerOptions = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name, "cs")), [customers]);

  if (openOrderId) {
    return (
      <ServiceOrderDetail
        orderId={openOrderId}
        locale={locale}
        role={role}
        onClose={() => { setOpenOrderId(null); void load(); }}
      />
    );
  }

  return (
    <div className="service-orders-page">
      <section className="dash-panel tab-panel-header">
        <div><span className="eyebrow">{t.eyebrow}</span><h2>{t.heading}</h2><p>{t.subtitle}</p></div>
        <div className="service-orders-header-actions">
          {role === "superadmin" && (
            <button className={trashView ? "secondary-compact active" : "secondary-compact"} type="button" onClick={() => setTrashView((current) => !current)}>
              🗑 {t.trashFilter}
            </button>
          )}
          {canManage && !trashView && <button className="primary-button" type="button" onClick={() => setCreating(true)}>{t.add}</button>}
        </div>
      </section>

      {trashView ? (
        <p className="form-hint">{t.trashOn}</p>
      ) : (
        <section className="dash-panel service-orders-filters">
          <label><span>{t.filterStatus}</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OrderStatus | "")}>
              {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{locale === "cs" ? item.cs : item.en}</option>)}
            </select>
          </label>
          <label><span>{t.filterCustomer}</span>
            <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
              <option value="">{t.allCustomers}</option>
              {customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label><span>{t.filterFrom}</span><input type="date" value={fromFilter} onChange={(event) => setFromFilter(event.target.value)} /></label>
          <label><span>{t.filterTo}</span><input type="date" value={toFilter} onChange={(event) => setToFilter(event.target.value)} /></label>
        </section>
      )}

      <section className="dash-panel data-panel">
        {loading && <LoadingState label={t.loading} />}
        {!loading && loadError && (
          <EmptyState variant="error" icon="!" title={t.loadError}
            action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
        )}
        {!loading && !loadError && orders.length === 0 && (
          trashView ? <EmptyState icon="🗑" title={t.emptyTrash} description={t.emptyTrashHelp} />
          : (statusFilter || customerFilter || fromFilter || toFilter
            ? <EmptyState variant="filtered" title={t.emptyFiltered} />
            : <EmptyState icon="＋" title={t.empty} description={t.emptyHelp} />)
        )}
        {!loading && !loadError && orders.length > 0 && (
          <div className="table-wrap">
            <table className="engine-table zebra service-orders-table">
              <thead><tr>
                <th>{t.number}</th><th>{t.customer}</th><th>{t.engines}</th>
                {trashView ? <th>{t.deletedAt}</th> : <><th>{t.status}</th><th>{t.deadline}</th></>}
                <th>{t.total}</th>
                {trashView && <th className="action-column">{t.restore}</th>}
              </tr></thead>
              <tbody>
                {orders.map((order) => {
                  const status = summaryStatus(order);
                  return (
                    <tr key={order.id} className={trashView ? "" : "clickable-row"} onClick={trashView ? undefined : () => setOpenOrderId(order.id)}>
                      <td>
                        <strong>{order.number}</strong>
                        {order.cancelledAt && <span className="status-pill danger service-orders-inline-flag">{t.cancelled}</span>}
                        {!order.cancelledAt && order.invoicedAt && <span className="status-pill neutral service-orders-inline-flag">{t.invoiced}</span>}
                      </td>
                      <td>{order.customerName}</td>
                      <td>{order.engineCount}</td>
                      {trashView ? (
                        <td>{order.deletedAt ? new Date(order.deletedAt).toLocaleDateString(locale === "cs" ? "cs-CZ" : "en-GB") : "—"}</td>
                      ) : (<>
                        <td><span className={`status-pill ${statusTone(status)}`}>{statusLabel(status, locale)}</span></td>
                        <td>{order.deadlineDate || "—"}</td>
                      </>)}
                      <td className="price-cell">{formatMoney(order.currency === "EUR" ? order.totalEurCents : order.totalCzkCents, order.currency, locale)}</td>
                      {trashView && (
                        <td className="action-column">
                          <button className="secondary-compact" type="button" disabled={restoring} onClick={(event) => { event.stopPropagation(); void restore(order); }}>{t.restore}</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <NewOrderModal
          locale={locale}
          customers={customerOptions}
          engineTypes={engineTypes.filter((type) => type.isActive)}
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); void load(); setOpenOrderId(id); }}
        />
      )}
    </div>
  );
}

type NewEngineDraft = { key: string; mode: "existing" | "new"; customerEngineId: string; code: string; serviceEngineTypeId: string; note: string; scope: string; carbService: boolean; customerParts: boolean; customerPartsText: string; engineMinutesText: string };

function emptyEngineDraft(): NewEngineDraft {
  return { key: crypto.randomUUID(), mode: "new", customerEngineId: "", code: "", serviceEngineTypeId: "", note: "", scope: "", carbService: false, customerParts: false, customerPartsText: "", engineMinutesText: "" };
}

function NewOrderModal({ locale, customers, engineTypes, onClose, onCreated }: {
  locale: Locale; customers: CustomerOption[]; engineTypes: EngineTypeOption[];
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const [customerId, setCustomerId] = useState("");
  const [customerEngines, setCustomerEngines] = useState<CustomerEngineOption[]>([]);
  const [currency, setCurrency] = useState<"CZK" | "EUR">("CZK");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineNote, setDeadlineNote] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [engines, setEngines] = useState<NewEngineDraft[]>([emptyEngineDraft()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!customerId) { setCustomerEngines([]); return; }
    let cancelled = false;
    void fetch(`/api/customer-engines?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { engines: CustomerEngineOption[] }) => { if (!cancelled) setCustomerEngines(data.engines.filter((engine) => engine.isActive)); })
      .catch(() => { if (!cancelled) setCustomerEngines([]); });
    return () => { cancelled = true; };
  }, [customerId]);

  const t = {
    cs: {
      title: "Nová zakázka", customer: "Zákazník", customerRequired: "Vyber zákazníka.",
      currency: "Měna", received: "Datum příjmu", deadline: "Termín", deadlineNote: "Poznámka k termínu",
      customerNote: "Co zákazník řekl", engines: "Motory", addEngine: "＋ Přidat motor", removeEngine: "Odebrat",
      existingEngine: "Existující motor zákazníka", newEngine: "Nový motor", pickEngine: "Vyber motor…",
      code: "Výrobní číslo", type: "Typ motoru", pickType: "Vyber typ…", note: "Poznámka",
      engineMinutes: "Motohodiny při příjmu", engineMinutesHint: "Nepovinné, ve formátu HH:MM.",
      engineMinutesError: "Motohodiny zapiš ve formátu HH:MM, například 06:48.",
      scope: "Rozsah prací", carbService: "Součástí je i servis karburátoru", customerParts: "Zákazník přivezl vlastní díly",
      customerPartsText: "Jaké díly", save: "Založit zakázku", saving: "Ukládám…", cancel: "Zrušit",
      codeRequired: "Vyplň výrobní číslo motoru.", typeRequired: "Vyber typ motoru.", saveError: "Zakázku se nepodařilo založit.",
      noEngineNotice: "Zakázku lze založit i bez motoru — přidáš ho později.",
    },
    en: {
      title: "New order", customer: "Customer", customerRequired: "Pick a customer.",
      currency: "Currency", received: "Received date", deadline: "Deadline", deadlineNote: "Deadline note",
      customerNote: "What the customer said", engines: "Engines", addEngine: "＋ Add engine", removeEngine: "Remove",
      existingEngine: "Customer's existing engine", newEngine: "New engine", pickEngine: "Pick an engine…",
      code: "Serial number", type: "Engine type", pickType: "Pick a type…", note: "Note",
      engineMinutes: "Engine hours at drop-off", engineMinutesHint: "Optional, in HH:MM format.",
      engineMinutesError: "Enter engine hours as HH:MM, for example 06:48.",
      scope: "Scope of work", carbService: "Carburetor service included", customerParts: "Customer brought own parts",
      customerPartsText: "Which parts", save: "Create order", saving: "Saving…", cancel: "Cancel",
      codeRequired: "Fill in the engine serial number.", typeRequired: "Pick an engine type.", saveError: "Could not create the order.",
      noEngineNotice: "An order can be created without an engine — add it later.",
    },
  }[locale];

  async function submit() {
    if (!customerId) { setError(t.customerRequired); return; }
    for (const engine of engines) {
      if (engine.mode === "existing" && !engine.customerEngineId) { setError(t.pickEngine); return; }
      if (engine.mode === "new" && !engine.code.trim()) { setError(t.codeRequired); return; }
      if (engine.mode === "new" && !engine.serviceEngineTypeId) { setError(t.typeRequired); return; }
      if (engine.engineMinutesText.trim() && !/^\d{1,4}:[0-5]\d$/.test(engine.engineMinutesText.trim())) { setError(t.engineMinutesError); return; }
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/service-orders", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId, currency, receivedAt, deadlineDate, deadlineNote, customerNote,
          engines: engines
            .filter((engine) => engine.mode === "existing" ? engine.customerEngineId : engine.code.trim())
            .map((engine) => ({
              customerEngineId: engine.mode === "existing" ? engine.customerEngineId : undefined,
              newEngine: engine.mode === "new" ? { code: engine.code.trim(), serviceEngineTypeId: engine.serviceEngineTypeId, note: engine.note } : undefined,
              engineMinutes: engine.engineMinutesText.trim() || null,
              scope: engine.scope, carbService: engine.carbService, customerParts: engine.customerParts, customerPartsText: engine.customerPartsText,
            })),
        }),
      });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "failed");
      onCreated(result.id);
    } catch {
      setError(t.saveError);
      setSaving(false);
    }
  }

  function updateEngine(key: string, patch: Partial<NewEngineDraft>) {
    setEngines((current) => current.map((engine) => engine.key === key ? { ...engine, ...patch } : engine));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal service-order-new-modal" role="dialog" aria-modal="true" aria-labelledby="new-order-title" tabIndex={-1}>
        <header className="modal-header">
          <div><h2 id="new-order-title">{t.title}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>

        <div className="form-grid">
          <label><span>{t.customer} *</span>
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} autoFocus>
              <option value="">{locale === "cs" ? "Vyber zákazníka…" : "Pick a customer…"}</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label><span>{t.currency}</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value as "CZK" | "EUR")}>
              <option value="CZK">CZK</option><option value="EUR">EUR</option>
            </select>
          </label>
          <label><span>{t.received} *</span><input type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} /></label>
          <label><span>{t.deadline}</span><input type="date" value={deadlineDate} onChange={(event) => setDeadlineDate(event.target.value)} /></label>
          <label className="full-field"><span>{t.deadlineNote}</span><input value={deadlineNote} onChange={(event) => setDeadlineNote(event.target.value)} placeholder="MČR Cheb" maxLength={500} /></label>
          <label className="full-field"><span>{t.customerNote}</span><textarea rows={2} value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} maxLength={2000} /></label>
        </div>

        <div className="service-order-engines-editor">
          <h3>{t.engines}</h3>
          {engines.map((engine) => (
            <fieldset className="service-order-engine-draft" key={engine.key}>
              <div className="service-order-engine-draft-mode">
                <label><input type="radio" checked={engine.mode === "existing"} disabled={customerEngines.length === 0} onChange={() => updateEngine(engine.key, { mode: "existing" })} /> {t.existingEngine}</label>
                <label><input type="radio" checked={engine.mode === "new"} onChange={() => updateEngine(engine.key, { mode: "new" })} /> {t.newEngine}</label>
                {engines.length > 1 && <button type="button" className="danger-compact" onClick={() => setEngines((current) => current.filter((item) => item.key !== engine.key))}>{t.removeEngine}</button>}
              </div>
              {engine.mode === "existing" ? (
                <select value={engine.customerEngineId} onChange={(event) => updateEngine(engine.key, { customerEngineId: event.target.value })}>
                  <option value="">{t.pickEngine}</option>
                  {customerEngines.map((option) => <option key={option.id} value={option.id}>{option.code} · {locale === "cs" ? option.typeNameCs : option.typeNameEn}</option>)}
                </select>
              ) : (
                <div className="form-grid">
                  <label><span>{t.code} *</span><input value={engine.code} onChange={(event) => updateEngine(engine.key, { code: event.target.value })} maxLength={120} /></label>
                  <label><span>{t.type} *</span>
                    <select value={engine.serviceEngineTypeId} onChange={(event) => updateEngine(engine.key, { serviceEngineTypeId: event.target.value })}>
                      <option value="">{t.pickType}</option>
                      {engineTypes.map((type) => <option key={type.id} value={type.id}>{locale === "cs" ? type.nameCs : type.nameEn}</option>)}
                    </select>
                  </label>
                  <label className="full-field"><span>{t.note}</span><input value={engine.note} onChange={(event) => updateEngine(engine.key, { note: event.target.value })} maxLength={1500} /></label>
                </div>
              )}
              <div className="form-grid">
                <label><span>{t.engineMinutes}</span><input value={engine.engineMinutesText} onChange={(event) => updateEngine(engine.key, { engineMinutesText: event.target.value })} inputMode="numeric" pattern="[0-9]{1,4}:[0-5][0-9]" placeholder="06:48" /><small>{t.engineMinutesHint}</small></label>
                <label className="full-field"><span>{t.scope}</span><textarea rows={2} value={engine.scope} onChange={(event) => updateEngine(engine.key, { scope: event.target.value })} maxLength={2000} /></label>
              </div>
              <label className="settings-checkbox-row"><input type="checkbox" checked={engine.carbService} onChange={(event) => updateEngine(engine.key, { carbService: event.target.checked })} /><span>{t.carbService}</span></label>
              <label className="settings-checkbox-row"><input type="checkbox" checked={engine.customerParts} onChange={(event) => updateEngine(engine.key, { customerParts: event.target.checked })} /><span>{t.customerParts}</span></label>
              {engine.customerParts && <label className="full-field"><span>{t.customerPartsText}</span><input value={engine.customerPartsText} onChange={(event) => updateEngine(engine.key, { customerPartsText: event.target.value })} maxLength={2000} /></label>}
            </fieldset>
          ))}
          <button type="button" className="secondary-compact" onClick={() => setEngines((current) => [...current, emptyEngineDraft()])}>{t.addEngine}</button>
          <p className="form-hint">{t.noEngineNotice}</p>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="button" disabled={saving} onClick={() => void submit()}>{saving ? t.saving : t.save}</button>
        </footer>
      </section>
    </div>
  );
}
