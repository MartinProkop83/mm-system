"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";
import { formatCount, type PluralForms } from "./pluralize";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";

type FolderSummary = { id: string; name: string; itemCount: number; createdAt: number };
type FileSummary = { id: string; fileName: string; contentType: string; sizeBytes: number; createdAt: number; url: string };
type BreadcrumbEntry = { id: string; name: string };

const ITEM_FORMS: PluralForms = { cs: ["položka", "položky", "položek"], en: ["item", "items"] };
const SUBFOLDER_FORMS: PluralForms = { cs: ["podsložku", "podsložky", "podsložek"], en: ["subfolder", "subfolders"] };
const FILE_FORMS: PluralForms = { cs: ["soubor", "soubory", "souborů"], en: ["file", "files"] };

function formatFileSize(bytes: number, locale: Locale) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}
function formatDate(value: number, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function notEmptyMessage(subfolderCount: number, fileCount: number, locale: Locale) {
  const parts = [
    subfolderCount > 0 ? formatCount(subfolderCount, locale, SUBFOLDER_FORMS) : "",
    fileCount > 0 ? formatCount(fileCount, locale, FILE_FORMS) : "",
  ].filter(Boolean);
  const list = parts.join(locale === "cs" ? " a " : " and ");
  return locale === "cs" ? `Složku nejde smazat — obsahuje ${list}. Nejdřív ji vyprázdni.` : `The folder can't be deleted — it contains ${list}. Empty it first.`;
}
function localizeDocumentError(error: string, locale: Locale) {
  if (locale === "en") return error;
  const map: Record<string, string> = {
    duplicate_name: "Složka s tímto názvem už v této složce existuje.",
    max_depth: "Složky mohou být zanořené nejvýš 10 úrovní.",
    "Folder name is required": "Vyplň název složky.",
    "Parent folder not found": "Nadřazená složka nebyla nalezena.",
    "Folder not found": "Složka nebyla nalezena.",
    "Unsupported file type": "Tenhle typ souboru není podporovaný.",
    "One of the files is larger than 15 MB": "Některý soubor je větší než 15 MB.",
    "Select at least one file": "Vyber aspoň jeden soubor.",
  };
  return map[error] ?? error;
}

/**
 * Knihovna dokumentů — samostatný strom složek a souborů, nevázaný na motor, auto ani závod
 * (na rozdíl od `EngineDocumentsPanel`/`travel_attachments`). Jedna obrazovka pro všechny
 * úrovně; drobečková navigace se drží jako seznam na klientovi, žádné volání serveru navíc
 * při návratu na vyšší úroveň.
 */
export function DocumentLibraryPage({ locale, role }: { locale: Locale; role: Role }) {
  const canManage = role !== "mechanic";
  const [trail, setTrail] = useState<BreadcrumbEntry[]>([]);
  const currentFolderId = trail.length ? trail[trail.length - 1].id : "";
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sortByDate, setSortByDate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (folderId: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(`/api/document-folders?folderId=${encodeURIComponent(folderId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { folders: FolderSummary[]; files: FileSummary[] };
      setFolders(data.folders);
      setFiles(data.files);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(currentFolderId); }, [currentFolderId, load]);

  function openFolder(folder: FolderSummary) { setTrail((current) => [...current, { id: folder.id, name: folder.name }]); }
  function goToCrumb(index: number) { setTrail((current) => current.slice(0, index)); }

  async function createFolder(name: string) {
    const response = await fetch("/api/document-folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentId: currentFolderId, name }) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || "create failed");
    setCreatingFolder(false);
    await load(currentFolderId);
  }

  async function uploadFiles(selected: File[]) {
    if (!selected.length) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("folderId", currentFolderId);
      for (const file of selected) form.append("files", file);
      const response = await fetch("/api/document-files", { method: "POST", body: form });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "upload failed");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load(currentFolderId);
    } catch (uploadError) {
      setError(localizeDocumentError(uploadError instanceof Error ? uploadError.message : "upload failed", locale));
    } finally {
      setUploading(false);
    }
  }

  async function deleteFolder(folder: FolderSummary) {
    if (!window.confirm(locale === "cs" ? `Smazat složku "${folder.name}"?` : `Delete folder "${folder.name}"?`)) return;
    setError("");
    try {
      const response = await fetch("/api/document-folders", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: folder.id }) });
      const result = (await response.json()) as { error?: string; subfolderCount?: number; fileCount?: number };
      if (!response.ok) {
        if (result.error === "not_empty") { setError(notEmptyMessage(result.subfolderCount ?? 0, result.fileCount ?? 0, locale)); return; }
        throw new Error(result.error || "delete failed");
      }
      await load(currentFolderId);
    } catch { setError(locale === "cs" ? "Složku se nepodařilo smazat." : "The folder could not be deleted."); }
  }

  async function deleteFile(file: FileSummary) {
    if (!window.confirm(locale === "cs" ? `Smazat soubor "${file.fileName}"?` : `Delete file "${file.fileName}"?`)) return;
    try {
      const response = await fetch("/api/document-files", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: file.id }) });
      if (!response.ok) throw new Error();
      await load(currentFolderId);
    } catch { window.alert(locale === "cs" ? "Soubor se nepodařilo smazat." : "The file could not be deleted."); }
  }

  const sortedFolders = [...folders].sort((a, b) => sortByDate ? b.createdAt - a.createdAt : a.name.localeCompare(b.name, locale));
  const sortedFiles = [...files].sort((a, b) => sortByDate ? b.createdAt - a.createdAt : a.fileName.localeCompare(b.fileName, locale));
  const isEmpty = folders.length === 0 && files.length === 0;

  if (loading) return <section className="dash-panel tab-panel"><LoadingState size="inline" label={locale === "cs" ? "Načítám…" : "Loading…"} /></section>;
  if (loadError) {
    return (
      <section className="dash-panel tab-panel">
        <EmptyState variant="error" size="inline" icon="!" title={locale === "cs" ? "Obsah složky se nepodařilo načíst." : "Could not load the folder contents."}
          action={<button className="secondary-compact" type="button" onClick={() => { void load(currentFolderId); }}>{locale === "cs" ? "Zkusit znovu" : "Try again"}</button>} />
      </section>
    );
  }

  return (
    <section className="dash-panel tab-panel document-library">
      <div className="tab-panel-header"><div><span className="eyebrow">MM FILES</span><h2>{locale === "cs" ? "Dokumenty" : "Documents"}</h2><p>{locale === "cs" ? "Soubory a složky, nevázané na motor, auto ani závod." : "Files and folders, not tied to an engine, car or race."}</p></div></div>

      <nav className="document-breadcrumb" aria-label={locale === "cs" ? "Umístění" : "Location"}>
        <button type="button" onClick={() => setTrail([])} disabled={trail.length === 0}>{locale === "cs" ? "Dokumenty" : "Documents"}</button>
        {trail.map((entry, index) => (
          <span key={entry.id}>
            <span aria-hidden="true"> › </span>
            <button type="button" onClick={() => goToCrumb(index + 1)} disabled={index === trail.length - 1}>{entry.name}</button>
          </span>
        ))}
      </nav>

      {canManage && (
        <div className="document-toolbar">
          <button className="secondary-compact" type="button" onClick={() => setCreatingFolder(true)}>＋ {locale === "cs" ? "Nová složka" : "New folder"}</button>
          <button className="secondary-compact" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? (locale === "cs" ? "Nahrávám…" : "Uploading…") : `＋ ${locale === "cs" ? "Nahrát soubory" : "Upload files"}`}</button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => { if (event.target.files) void uploadFiles(Array.from(event.target.files)); }} />
          <div className="document-sort-toggle">
            <button type="button" className={!sortByDate ? "active" : ""} onClick={() => setSortByDate(false)}>{locale === "cs" ? "Podle názvu" : "By name"}</button>
            <button type="button" className={sortByDate ? "active" : ""} onClick={() => setSortByDate(true)}>{locale === "cs" ? "Podle data nahrání" : "By upload date"}</button>
          </div>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      {isEmpty ? (
        <div className="document-empty-row">
          <span>{locale === "cs" ? "Složka je prázdná." : "This folder is empty."}</span>
          {canManage && <button className="secondary-compact" type="button" onClick={() => fileInputRef.current?.click()}>{locale === "cs" ? "Nahrát první soubor" : "Upload the first file"}</button>}
        </div>
      ) : (
        <div className="document-listing">
          {sortedFolders.length > 0 && (
            <section className="document-group">
              <h3>{locale === "cs" ? "Složky" : "Folders"}</h3>
              <div className="document-rows">
                {sortedFolders.map((folder) => (
                  <div key={folder.id} className="document-row">
                    <button type="button" className="document-row-open" onClick={() => openFolder(folder)}>
                      <strong>{folder.name}</strong>
                      <small>{formatCount(folder.itemCount, locale, ITEM_FORMS)}</small>
                    </button>
                    {canManage && <button className="document-row-delete" type="button" onClick={() => { void deleteFolder(folder); }}>{locale === "cs" ? "Smazat" : "Delete"}</button>}
                  </div>
                ))}
              </div>
            </section>
          )}
          {sortedFiles.length > 0 && (
            <section className="document-group">
              <h3>{locale === "cs" ? "Soubory" : "Files"}</h3>
              <div className="document-rows">
                {sortedFiles.map((file) => (
                  <div key={file.id} className="document-row">
                    <a className="document-row-open" href={file.url} target="_blank" rel="noreferrer">
                      <strong>{file.fileName}</strong>
                      <small>{formatFileSize(file.sizeBytes, locale)} · {formatDate(file.createdAt, locale)}</small>
                    </a>
                    {canManage && <button className="document-row-delete" type="button" onClick={() => { void deleteFile(file); }}>{locale === "cs" ? "Smazat" : "Delete"}</button>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {creatingFolder && <NewFolderModal locale={locale} onClose={() => setCreatingFolder(false)} onCreate={createFolder} />}
    </section>
  );
}

function NewFolderModal({ locale, onClose, onCreate }: { locale: Locale; onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const dialogRef = useModalA11y(onClose);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onCreate(name.trim());
    } catch (createError) {
      setError(localizeDocumentError(createError instanceof Error ? createError.message : "create failed", locale));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal" role="dialog" aria-modal="true" aria-labelledby="new-folder-title" tabIndex={-1}>
        <div className="modal-header">
          <div><span className="eyebrow">MM FILES</span><h2 id="new-folder-title">{locale === "cs" ? "Nová složka" : "New folder"}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={locale === "cs" ? "Zavřít" : "Close"}>×</button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="full-field"><span>{locale === "cs" ? "Název složky" : "Folder name"} *</span><input value={name} onChange={(event) => setName(event.target.value)} required autoFocus maxLength={160} /></label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <span className="modal-actions-spacer" />
            <button className="secondary-compact" type="button" onClick={onClose} disabled={saving}>{locale === "cs" ? "Zrušit" : "Cancel"}</button>
            <button className="primary-button" type="submit" disabled={saving || !name.trim()}>{saving ? (locale === "cs" ? "Vytvářím…" : "Creating…") : (locale === "cs" ? "Vytvořit" : "Create")}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
