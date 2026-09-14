"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";

type Locale = "cs" | "en";

/**
 * Mechanikova jediná obrazovka pro zákaznický motor: rozsah prací, zápis provedené práce
 * a materiálu, přepnutí na „čeká na díl" a tlačítko „hotovo". Nic jiného — žádný seznam
 * zakázek, žádné ceny za celou zakázku, žádná sleva. Data i zápis jdou přes úzkou routu
 * `/api/customer-service` (viz app/api-access.ts, MECHANIC_PAYLOADS).
 */

// Přesně to, co whitelist v api-access.ts propustí — žádné discountPercent, totalCzkCents
// ani totalEurCents. Typ tu funguje jako druhá pojistka: kdyby se whitelist rozjel s realitou,
// TypeScript nedovolí sáhnout na pole, které tu není.
type WorkLine = { id: string; codeSnapshot: string; nameCsSnapshot: string; nameEnSnapshot: string; quantity: number; unitPriceCzkCents: number; unitPriceEurCents: number };
type MaterialLine = { id: string; code: string; name: string; quantity: number; unitPriceCzkCents: number; unitPriceEurCents: number; source: "stock" | "customer" };
type WaitingPart = { id: string; code: string; name: string; priceCzkCents: number; priceEurCents: number; expectedDate: string; isOrdered: boolean; arrivedAt: number | null };
type EngineDetail = {
  orderEngineId: string; engineCode: string; typeNameCs: string; typeNameEn: string; customerName: string;
  scope: string; carbService: boolean; customerParts: boolean; customerPartsText: string;
  status: "received" | "in_progress" | "waiting_part" | "done";
  takenByName: string; takenAt: number | null;
  works: WorkLine[]; materials: MaterialLine[]; waitingParts: WaitingPart[];
};
type PriceItem = { id: string; code: string; nameCs: string; nameEn: string; priceCzkCents: number; priceEurCents: number };
type InventoryPart = { id: string; code: string; name: string; priceCzkCents: number; priceEurCents: number };

const content = {
  cs: {
    back: "Zpět na frontu", loading: "Načítám motor…", loadError: "Motor se nepodařilo načíst.", retry: "Zkusit znovu",
    customer: "Zákazník", scope: "Rozsah prací", noScope: "Rozsah prací nebyl zadán.",
    carbService: "Součástí je i servis karburátoru", customerParts: "Zákazník přivezl vlastní díly",
    works: "Provedené práce", materials: "Použitý materiál", waiting: "Čeká na díl",
    addWork: "＋ Práce z ceníku", addMaterial: "＋ Materiál", addWaiting: "＋ Očekávaný díl",
    pickPriceItem: "Vyber práci…", pickInventoryPart: "Vyber ze skladu…", ownPart: "Zákazníkův vlastní díl",
    materialName: "Název dílu", quantity: "Množství", priceCzk: "Cena CZK", priceEur: "Cena EUR",
    delete: "Smazat", add: "Přidat", cancelForm: "Zrušit",
    waitingName: "Název dílu", waitingExpected: "Očekáváno", waitingOrdered: "Objednáno", waitingArrived: "Dorazilo", code: "Kód",
    claim: "Vzít si motor do práce", markWaiting: "Přepnout na „čeká na díl“", markDone: "Hotovo",
    takenBy: "Na motoru dělá", statusReceived: "Přijato", statusInProgress: "V práci", statusWaiting: "Čeká na díl", statusDone: "Hotovo",
    doneConfirm: "Opravdu motor označit jako hotový? Dál ho uvidí jen vedení při kontrole.",
    genericError: "Akce se nepodařila. Zkus to znovu.",
  },
  en: {
    back: "Back to the queue", loading: "Loading the engine…", loadError: "The engine could not be loaded.", retry: "Try again",
    customer: "Customer", scope: "Scope of work", noScope: "No scope of work entered.",
    carbService: "Carburetor service included", customerParts: "Customer brought own parts",
    works: "Work performed", materials: "Material used", waiting: "Waiting for part",
    addWork: "＋ Work from price list", addMaterial: "＋ Material", addWaiting: "＋ Expected part",
    pickPriceItem: "Pick work…", pickInventoryPart: "Pick from stock…", ownPart: "Customer's own part",
    materialName: "Part name", quantity: "Quantity", priceCzk: "Price CZK", priceEur: "Price EUR",
    delete: "Delete", add: "Add", cancelForm: "Cancel",
    waitingName: "Part name", waitingExpected: "Expected", waitingOrdered: "Ordered", waitingArrived: "Arrived", code: "Code",
    claim: "Take the engine to work on", markWaiting: "Switch to \"waiting for part\"", markDone: "Done",
    takenBy: "Working on it", statusReceived: "Received", statusInProgress: "In progress", statusWaiting: "Waiting for part", statusDone: "Done",
    doneConfirm: "Mark the engine as done? Only management will see it from here, for checking.",
    genericError: "The action failed. Try again.",
  },
} as const;

function formatMoney(cents: number, currency: "CZK" | "EUR", locale: Locale) {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

async function api(path: string, method: string, body?: unknown) {
  const response = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || "request failed");
  return data;
}

export function CustomerServiceScreen({ locale, orderEngineId, onDone }: { locale: Locale; orderEngineId: string; onDone: () => void }) {
  const t = content[locale];
  const [engine, setEngine] = useState<EngineDetail | null>(null);
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [inventoryParts, setInventoryParts] = useState<InventoryPart[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState("");
  const [addingWork, setAddingWork] = useState(false);
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [addingWaiting, setAddingWaiting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await fetch(`/api/customer-service?orderEngineId=${encodeURIComponent(orderEngineId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { engine: EngineDetail; priceItems: PriceItem[]; inventoryParts: InventoryPart[] };
      setEngine(data.engine);
      setPriceItems(data.priceItems);
      setInventoryParts(data.inventoryParts);
    } catch {
      setLoadError(true);
    }
  }, [orderEngineId]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t.genericError);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="queue-screen">
        <div className="queue-screen-body">
          <section className="dash-panel">
            <EmptyState variant="error" icon="!" title={t.loadError}
              action={<button className="secondary-compact" type="button" onClick={onDone}>← {t.back}</button>} />
          </section>
        </div>
      </main>
    );
  }
  if (!engine) {
    return <main className="queue-screen"><div className="queue-screen-body"><section className="dash-panel"><LoadingState label={t.loading} /></section></div></main>;
  }

  const statusLabel = { received: t.statusReceived, in_progress: t.statusInProgress, waiting_part: t.statusWaiting, done: t.statusDone }[engine.status];

  return (
    <main className="queue-screen">
      <header className="queue-screen-bar">
        <button className="secondary-compact" type="button" onClick={onDone}>← {t.back}</button>
        <strong className="queue-screen-engine">{engine.engineCode}</strong>
        <span className="queue-screen-user">{engine.customerName}</span>
      </header>
      <div className="queue-screen-body">
        {error && <p className="form-error" role="alert">{error}</p>}

        <section className="dash-panel">
          <p><strong>{t.customer}:</strong> {engine.customerName} · {locale === "cs" ? engine.typeNameCs : engine.typeNameEn}</p>
          <p><strong>{t.scope}:</strong> {engine.scope || t.noScope}</p>
          {engine.carbService && <span className="status-pill neutral">{t.carbService}</span>}
          {engine.customerParts && <span className="status-pill neutral">{t.customerParts}: {engine.customerPartsText || "—"}</span>}

          <div className="service-order-engine-status">
            <span className={`status-pill ${engine.status === "done" ? "success" : engine.status === "waiting_part" ? "warning-pill" : engine.status === "in_progress" ? "info-pill" : "neutral"}`}>{statusLabel}</span>
            {engine.takenByName && <small>{t.takenBy}: {engine.takenByName}</small>}
          </div>

          <div className="customer-service-actions">
            {engine.status === "received" && (
              <button className="primary-button" type="button" disabled={busy} onClick={() => void run(() => api("/api/customer-service", "PUT", { kind: "status", orderEngineId, status: "in_progress" }))}>{t.claim}</button>
            )}
            {engine.status !== "waiting_part" && engine.status !== "done" && (
              <button className="secondary-compact" type="button" disabled={busy} onClick={() => void run(() => api("/api/customer-service", "PUT", { kind: "status", orderEngineId, status: "waiting_part" }))}>{t.markWaiting}</button>
            )}
            {engine.status !== "done" && (
              <button className="primary-button" type="button" disabled={busy} onClick={() => { if (window.confirm(t.doneConfirm)) void run(() => api("/api/customer-service", "PUT", { kind: "status", orderEngineId, status: "done" })); }}>{t.markDone}</button>
            )}
          </div>
        </section>

        <section className="dash-panel">
          <div className="service-order-lines-head">
            <h4>{t.works}</h4>
            <button className="secondary-compact" type="button" onClick={() => setAddingWork(true)}>{t.addWork}</button>
          </div>
          {engine.works.length === 0 ? <p className="form-hint">—</p> : (
            <div className="table-wrap">
              <table className="settings-table">
                <thead><tr><th>{t.materialName}</th><th>{t.quantity}</th><th className="price-cell">{t.priceCzk}</th><th className="price-cell">{t.priceEur}</th><th className="action-column">{t.delete}</th></tr></thead>
                <tbody>
                  {engine.works.map((line) => (
                    <tr key={line.id}>
                      <td>{line.nameCsSnapshot}</td><td>{line.quantity}</td>
                      <td className="price-cell">{formatMoney(line.unitPriceCzkCents, "CZK", locale)}</td>
                      <td className="price-cell">{formatMoney(line.unitPriceEurCents, "EUR", locale)}</td>
                      <td className="action-column"><button className="delete" type="button" onClick={() => void run(() => api("/api/customer-service", "PUT", { kind: "work", action: "delete", id: line.id }))}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {addingWork && (
            <AddWorkForm priceItems={priceItems} locale={locale} orderEngineId={orderEngineId}
              onClose={() => setAddingWork(false)} onAdded={() => { setAddingWork(false); void load(); }} onError={setError} />
          )}
        </section>

        <section className="dash-panel">
          <div className="service-order-lines-head">
            <h4>{t.materials}</h4>
            <button className="secondary-compact" type="button" onClick={() => setAddingMaterial(true)}>{t.addMaterial}</button>
          </div>
          {engine.materials.length === 0 ? <p className="form-hint">—</p> : (
            <div className="table-wrap">
              <table className="settings-table">
                <thead><tr><th>{t.materialName}</th><th>{t.quantity}</th><th className="price-cell">{t.priceCzk}</th><th className="price-cell">{t.priceEur}</th><th className="action-column">{t.delete}</th></tr></thead>
                <tbody>
                  {engine.materials.map((line) => (
                    <tr key={line.id}>
                      <td>{line.name}{line.source === "customer" ? ` (${t.ownPart})` : ""}</td><td>{line.quantity}</td>
                      <td className="price-cell">{formatMoney(line.unitPriceCzkCents, "CZK", locale)}</td>
                      <td className="price-cell">{formatMoney(line.unitPriceEurCents, "EUR", locale)}</td>
                      <td className="action-column"><button className="delete" type="button" onClick={() => void run(() => api("/api/customer-service", "PUT", { kind: "material", action: "delete", id: line.id }))}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {addingMaterial && (
            <AddMaterialForm inventoryParts={inventoryParts} locale={locale} orderEngineId={orderEngineId}
              onClose={() => setAddingMaterial(false)} onAdded={() => { setAddingMaterial(false); void load(); }} onError={setError} />
          )}
        </section>

        <section className="dash-panel">
          <div className="service-order-lines-head">
            <h4>{t.waiting}</h4>
            <button className="secondary-compact" type="button" onClick={() => setAddingWaiting(true)}>{t.addWaiting}</button>
          </div>
          {engine.waitingParts.length === 0 ? <p className="form-hint">—</p> : (
            <div className="table-wrap">
              <table className="settings-table">
                <thead><tr><th>{t.waitingName}</th><th>{t.waitingExpected}</th><th>{t.waitingOrdered}</th><th>{t.waitingArrived}</th><th className="action-column">{t.delete}</th></tr></thead>
                <tbody>
                  {engine.waitingParts.map((part) => (
                    <tr key={part.id}>
                      <td>{part.name}{part.code ? ` (${part.code})` : ""}</td>
                      <td>{part.expectedDate || "—"}</td>
                      <td><span className={`status-pill ${part.isOrdered ? "success" : "neutral"}`}>{part.isOrdered ? "✓" : "—"}</span></td>
                      <td>{part.arrivedAt
                        ? <span className="status-pill success">✓</span>
                        : <button className="secondary-compact" type="button" onClick={() => void run(() => api("/api/customer-service", "PUT", { kind: "waitingPart", action: "arrived", id: part.id }))}>{t.waitingArrived}</button>}
                      </td>
                      <td className="action-column"><button className="delete" type="button" onClick={() => void run(() => api("/api/customer-service", "PUT", { kind: "waitingPart", action: "delete", id: part.id }))}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {addingWaiting && (
            <AddWaitingForm locale={locale} orderEngineId={orderEngineId}
              onClose={() => setAddingWaiting(false)} onAdded={() => { setAddingWaiting(false); void load(); }} onError={setError} />
          )}
        </section>
      </div>
    </main>
  );
}

function AddWorkForm({ priceItems, locale, orderEngineId, onClose, onAdded, onError }: {
  priceItems: PriceItem[]; locale: Locale; orderEngineId: string; onClose: () => void; onAdded: () => void; onError: (message: string) => void;
}) {
  const t = content[locale];
  const [priceItemId, setPriceItemId] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!priceItemId) { onError(t.pickPriceItem); return; }
    setSaving(true);
    try {
      await api("/api/customer-service", "PUT", { kind: "work", action: "create", orderEngineId, priceItemId, quantity: Number(quantityText) || 1 });
      onAdded();
    } catch (error) {
      onError(error instanceof Error ? error.message : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="service-order-add-line">
      <div className="form-grid">
        <label className="full-field"><span>{t.pickPriceItem}</span>
          <select value={priceItemId} onChange={(event) => setPriceItemId(event.target.value)} autoFocus>
            <option value="">{t.pickPriceItem}</option>
            {priceItems.map((item) => <option key={item.id} value={item.id}>{item.code} · {locale === "cs" ? item.nameCs : item.nameEn}</option>)}
          </select>
        </label>
        <label><span>{t.quantity}</span><input type="number" min="1" value={quantityText} onChange={(event) => setQuantityText(event.target.value)} /></label>
      </div>
      <footer className="modal-actions">
        <span className="modal-actions-spacer" />
        <button className="secondary-compact" type="button" onClick={onClose}>{t.cancelForm}</button>
        <button className="primary-button" type="button" disabled={saving} onClick={() => void submit()}>{t.add}</button>
      </footer>
    </div>
  );
}

function AddMaterialForm({ inventoryParts, locale, orderEngineId, onClose, onAdded, onError }: {
  inventoryParts: InventoryPart[]; locale: Locale; orderEngineId: string; onClose: () => void; onAdded: () => void; onError: (message: string) => void;
}) {
  const t = content[locale];
  const [ownPart, setOwnPart] = useState(false);
  const [inventoryPartId, setInventoryPartId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!ownPart && !inventoryPartId) { onError(t.pickInventoryPart); return; }
    if (ownPart && !name.trim()) { onError(t.materialName); return; }
    setSaving(true);
    try {
      await api("/api/customer-service", "PUT", {
        kind: "material", action: "create", orderEngineId, quantity: Number(quantityText) || 1,
        source: ownPart ? "customer" : "stock",
        inventoryPartId: ownPart ? undefined : inventoryPartId,
        name: ownPart ? name.trim() : undefined,
        code: ownPart ? code.trim() : undefined,
      });
      onAdded();
    } catch (error) {
      onError(error instanceof Error ? error.message : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="service-order-add-line">
      <div className="form-grid">
        <label><input type="checkbox" checked={ownPart} onChange={(event) => setOwnPart(event.target.checked)} /> {t.ownPart}</label>
        {ownPart ? (
          <>
            <label className="full-field"><span>{t.materialName}</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} autoFocus /></label>
            <label><span>{t.code}</span><input value={code} onChange={(event) => setCode(event.target.value)} maxLength={60} /></label>
          </>
        ) : (
          <label className="full-field"><span>{t.pickInventoryPart}</span>
            <select value={inventoryPartId} onChange={(event) => setInventoryPartId(event.target.value)}>
              <option value="">{t.pickInventoryPart}</option>
              {inventoryParts.map((part) => <option key={part.id} value={part.id}>{part.code} · {part.name}</option>)}
            </select>
          </label>
        )}
        <label><span>{t.quantity}</span><input type="number" min="1" value={quantityText} onChange={(event) => setQuantityText(event.target.value)} /></label>
      </div>
      <footer className="modal-actions">
        <span className="modal-actions-spacer" />
        <button className="secondary-compact" type="button" onClick={onClose}>{t.cancelForm}</button>
        <button className="primary-button" type="button" disabled={saving} onClick={() => void submit()}>{t.add}</button>
      </footer>
    </div>
  );
}

function AddWaitingForm({ locale, orderEngineId, onClose, onAdded, onError }: {
  locale: Locale; orderEngineId: string; onClose: () => void; onAdded: () => void; onError: (message: string) => void;
}) {
  const t = content[locale];
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [isOrdered, setIsOrdered] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) { onError(t.waitingName); return; }
    setSaving(true);
    try {
      await api("/api/customer-service", "PUT", { kind: "waitingPart", action: "create", orderEngineId, name: name.trim(), code, expectedDate, isOrdered });
      onAdded();
    } catch (error) {
      onError(error instanceof Error ? error.message : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="service-order-add-line">
      <div className="form-grid">
        <label className="full-field"><span>{t.waitingName}</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={200} /></label>
        <label><span>{t.code}</span><input value={code} onChange={(event) => setCode(event.target.value)} maxLength={60} /></label>
        <label><span>{t.waitingExpected}</span><input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></label>
        <label><input type="checkbox" checked={isOrdered} onChange={(event) => setIsOrdered(event.target.checked)} /> {t.waitingOrdered}</label>
      </div>
      <footer className="modal-actions">
        <span className="modal-actions-spacer" />
        <button className="secondary-compact" type="button" onClick={onClose}>{t.cancelForm}</button>
        <button className="primary-button" type="button" disabled={saving} onClick={() => void submit()}>{t.add}</button>
      </footer>
    </div>
  );
}
