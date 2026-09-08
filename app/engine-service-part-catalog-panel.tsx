"use client";

import { useEffect, useState } from "react";
import { useModalA11y } from "./use-modal-a11y";

type Locale = "cs" | "en";

type CatalogPart = {
  id: string;
  family: string;
  partKey: string;
  labelCs: string;
  labelEn: string;
  sortOrder: number;
  archivedAt: number | null;
};

export function EngineServicePartCatalogPanel({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const dialogRef = useModalA11y(onClose);
  const [parts, setParts] = useState<CatalogPart[]>([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [activeFamily, setActiveFamily] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLabelCs, setNewLabelCs] = useState("");
  const [newLabelEn, setNewLabelEn] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; labelCs: string; labelEn: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/engine-service-part-catalog", { cache: "no-store" });
      const data = (await response.json()) as { parts?: CatalogPart[]; families?: string[]; error?: string };
      if (!response.ok || !data.parts || !data.families) throw new Error(data.error || "Load failed");
      setParts(data.parts);
      setFamilies(data.families);
      setActiveFamily((current) => current || data.families![0] || "");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const familyParts = parts
    .filter((part) => part.family === activeFamily)
    .sort((left, right) => (left.archivedAt ? 1 : 0) - (right.archivedAt ? 1 : 0) || left.sortOrder - right.sortOrder);
  const activeParts = familyParts.filter((part) => !part.archivedAt);
  const archivedParts = familyParts.filter((part) => part.archivedAt);

  async function createPart(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newLabelCs.trim() || !newLabelEn.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/engine-service-part-catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ family: activeFamily, labelCs: newLabelCs.trim(), labelEn: newLabelEn.trim() }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Save failed");
      setNewLabelCs("");
      setNewLabelEn("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const response = await fetch("/api/engine-service-part-catalog", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editing.id, labelCs: editing.labelCs, labelEn: editing.labelEn }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Save failed");
      setEditing(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function move(part: CatalogPart, direction: "up" | "down") {
    const index = activeParts.findIndex((item) => item.id === part.id);
    const neighborIndex = direction === "up" ? index - 1 : index + 1;
    const neighbor = activeParts[neighborIndex];
    if (!neighbor) return;
    setSaving(true);
    try {
      await Promise.all([
        fetch("/api/engine-service-part-catalog", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: part.id, sortOrder: neighbor.sortOrder }) }),
        fetch("/api/engine-service-part-catalog", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: neighbor.id, sortOrder: part.sortOrder }) }),
      ]);
      await load();
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function archive(part: CatalogPart) {
    const question = locale === "cs"
      ? `Archivovat díl „${part.labelCs}“? Zmizí z formuláře servisu, ale staré záznamy zůstanou čitelné.`
      : `Archive "${part.labelEn}"? It disappears from the service form, but old records stay readable.`;
    if (!window.confirm(question)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/engine-service-part-catalog", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: part.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Archive failed");
      await load();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Archive failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal service-modal" role="dialog" aria-modal="true" aria-labelledby="part-catalog-title" tabIndex={-1}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">SERVICE CARD</span>
            <h2 id="part-catalog-title">{locale === "cs" ? "Sada dílů podle rodiny" : "Parts catalog by family"}</h2>
            <p>{locale === "cs" ? "Díly, které mechanik zaškrtává na servisní kartě. Změna se projeví hned ve formuláři." : "Parts a mechanic checks off on the service card. Changes apply to the form immediately."}</p>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label={locale === "cs" ? "Zavřít" : "Close"}>×</button>
        </div>

        {loading && <p className="form-hint">{locale === "cs" ? "Načítám…" : "Loading…"}</p>}
        {error && <p className="form-error">{error}</p>}

        {!loading && families.length > 1 && (
          <div className="parts-fieldset" style={{ marginBottom: "var(--wrc-space-16)" }}>
            <div className="parts-grid">
              {families.map((family) => (
                <label key={family} className={family === activeFamily ? "selected" : ""}>
                  <input type="radio" name="family" checked={family === activeFamily} onChange={() => setActiveFamily(family)} />
                  <span>✓</span>
                  <strong>{family}</strong>
                </label>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="table-wrap">
              <table className="records-table zebra">
                <thead>
                  <tr>
                    <th>{locale === "cs" ? "Pořadí" : "Order"}</th>
                    <th>{locale === "cs" ? "Název (CZ)" : "Name (CZ)"}</th>
                    <th>{locale === "cs" ? "Název (EN)" : "Name (EN)"}</th>
                    <th>{locale === "cs" ? "Akce" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeParts.map((part, index) => (
                    <tr key={part.id}>
                      <td>
                        <div className="record-actions">
                          <button type="button" disabled={saving || index === 0} onClick={() => move(part, "up")} aria-label={locale === "cs" ? "Posunout nahoru" : "Move up"}>↑</button>
                          <button type="button" disabled={saving || index === activeParts.length - 1} onClick={() => move(part, "down")} aria-label={locale === "cs" ? "Posunout dolů" : "Move down"}>↓</button>
                        </div>
                      </td>
                      {editing?.id === part.id ? (
                        <td colSpan={2}>
                          <form className="form-grid" onSubmit={saveRename} style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
                            <label><span>CZ *</span><input value={editing.labelCs} onChange={(event) => setEditing({ ...editing, labelCs: event.target.value })} required /></label>
                            <label><span>EN *</span><input value={editing.labelEn} onChange={(event) => setEditing({ ...editing, labelEn: event.target.value })} required /></label>
                            <div className="record-actions">
                              <button type="submit" disabled={saving}>{locale === "cs" ? "Uložit" : "Save"}</button>
                              <button type="button" onClick={() => setEditing(null)}>{locale === "cs" ? "Zrušit" : "Cancel"}</button>
                            </div>
                          </form>
                        </td>
                      ) : (
                        <>
                          <td><strong>{part.labelCs}</strong></td>
                          <td>{part.labelEn}</td>
                        </>
                      )}
                      {editing?.id !== part.id && (
                        <td>
                          <div className="record-actions">
                            <button type="button" onClick={() => setEditing({ id: part.id, labelCs: part.labelCs, labelEn: part.labelEn })}>{locale === "cs" ? "Přejmenovat" : "Rename"}</button>
                            <button className="delete" type="button" disabled={saving} onClick={() => archive(part)}>{locale === "cs" ? "Archivovat" : "Archive"}</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {activeParts.length === 0 && (
                    <tr><td colSpan={4}>{locale === "cs" ? "Zatím žádné díly." : "No parts yet."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <form className="form-grid" onSubmit={createPart} style={{ marginTop: "var(--wrc-space-16)" }}>
              <label><span>{locale === "cs" ? "Nový díl — název (CZ)" : "New part — name (CZ)"} *</span><input value={newLabelCs} onChange={(event) => setNewLabelCs(event.target.value)} required /></label>
              <label><span>{locale === "cs" ? "Nový díl — název (EN)" : "New part — name (EN)"} *</span><input value={newLabelEn} onChange={(event) => setNewLabelEn(event.target.value)} required /></label>
              <div className="modal-actions"><span className="modal-actions-spacer" /><button className="primary-button" type="submit" disabled={saving}>＋ {locale === "cs" ? "Přidat díl" : "Add part"}</button></div>
            </form>

            {archivedParts.length > 0 && (
              <>
                <div className="tab-panel-header audit-subsection"><div><span className="eyebrow">ARCHIVE</span><h3>{locale === "cs" ? "Archivované díly" : "Archived parts"}</h3></div></div>
                <div className="history-list">
                  {archivedParts.map((part) => (
                    <div key={part.id}><i /><span><strong>{part.labelCs}</strong><small>{part.labelEn}</small></span></div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
