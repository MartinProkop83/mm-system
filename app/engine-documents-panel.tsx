"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";

type Locale = "cs" | "en";

type DocumentType = { id: string; nameCs: string; nameEn: string };

type EngineDocument = {
  id: string; documentTypeId: string; typeNameCs: string; typeNameEn: string;
  fileName: string; contentType: string; sizeBytes: number; note: string;
  createdBy: string; createdAt: number; url: string;
};

const content = {
  cs: {
    heading: "Dokumenty",
    intro: "Faktury, homologace, fotodokumentace a další doklady k tomuto motoru.",
    loading: "Načítám dokumenty…",
    loadError: "Dokumenty se nepodařilo načíst.",
    retry: "Zkusit znovu",
    empty: "Zatím žádné dokumenty",
    emptyHelp: "Přidej první soubor — přetažením, nebo tlačítkem výš.",
    dropHere: "Přetáhni soubory sem",
    orBrowse: "nebo vyber z disku",
    formats: "PDF, PNG, JPG nebo WebP, maximálně 15 MB na soubor.",
    typeLabel: "Typ dokumentu",
    typeSelect: "Vyber typ",
    noteLabel: "Poznámka (nepovinné)",
    notePlaceholder: "Např. číslo faktury, k čemu se dokument vztahuje…",
    upload: "Nahrát",
    uploading: "Nahrávám…",
    selectedFiles: (count: number) => `${count} ${count === 1 ? "soubor" : count < 5 ? "soubory" : "souborů"} k nahrání`,
    typeRequired: "Vyber typ dokumentu.",
    uploadError: "Nahrání se nepodařilo.",
    tooManyFiles: "Motor už má maximální počet dokumentů (50).",
    download: "Stáhnout",
    delete: "Smazat",
    deleteConfirm: "Opravdu tento dokument smazat?",
    deleteError: "Dokument se nepodařilo smazat.",
    pdfLabel: "PDF",
  },
  en: {
    heading: "Documents",
    intro: "Invoices, homologation, photo documentation and other records for this engine.",
    loading: "Loading documents…",
    loadError: "The documents could not be loaded.",
    retry: "Try again",
    empty: "No documents yet",
    emptyHelp: "Add the first file — drag it in, or use the button above.",
    dropHere: "Drop files here",
    orBrowse: "or browse your disk",
    formats: "PDF, PNG, JPG or WebP, maximum 15 MB per file.",
    typeLabel: "Document type",
    typeSelect: "Pick a type",
    noteLabel: "Note (optional)",
    notePlaceholder: "E.g. invoice number, what the document relates to…",
    upload: "Upload",
    uploading: "Uploading…",
    selectedFiles: (count: number) => `${count} file${count === 1 ? "" : "s"} to upload`,
    typeRequired: "Pick a document type.",
    uploadError: "The upload failed.",
    tooManyFiles: "This engine already has the maximum number of documents (50).",
    download: "Download",
    delete: "Delete",
    deleteConfirm: "Delete this document?",
    deleteError: "The document could not be deleted.",
    pdfLabel: "PDF",
  },
} as const;

function formatFileSize(bytes: number, locale: Locale) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}

function formatDate(value: number, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/**
 * Dokumenty motoru — nahrávání přetažením i výběrem z disku, náhled, stažení, smazání.
 *
 * Mechanik se sem nedostane vůbec: záložka Dokumenty existuje jen v plné aplikaci
 * (`mm-dashboard.tsx`), kterou mechanik nikdy nevykresluje — jeho domovská obrazovka je
 * `/servis-fronta` s jinou, menší kartou motoru. `/api/engine-documents` je navíc mimo jeho
 * seznam povolených endpointů, takže i přímý dotaz by dostal 403.
 */
export function EngineDocumentsPanel({ engineId, locale, canManage }: {
  engineId: string;
  locale: Locale;
  canManage: boolean;
}) {
  const t = content[locale];
  const [documents, setDocuments] = useState<EngineDocument[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [typeId, setTypeId] = useState("");
  const [note, setNote] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await fetch(`/api/engine-documents?engineId=${encodeURIComponent(engineId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { documents: EngineDocument[]; types: DocumentType[] };
      setDocuments(data.documents);
      setTypes(data.types);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [engineId]);

  useEffect(() => { void load(); }, [load]);

  function addFiles(incoming: FileList | File[]) {
    setFiles((current) => [...current, ...Array.from(incoming)]);
    setError("");
  }

  async function upload() {
    if (!typeId) { setError(t.typeRequired); return; }
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("engineId", engineId);
      form.set("documentTypeId", typeId);
      form.set("note", note);
      for (const file of files) form.append("files", file);
      const response = await fetch("/api/engine-documents", { method: "POST", body: form });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "upload failed");
      setFiles([]);
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "";
      setError(message === "An engine can have at most 50 documents" ? t.tooManyFiles : t.uploadError);
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(document: EngineDocument) {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      const response = await fetch("/api/engine-documents", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: document.id }),
      });
      if (!response.ok) throw new Error("delete failed");
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch {
      window.alert(t.deleteError);
    }
  }

  if (loading) return <section className="dash-panel tab-panel"><LoadingState size="inline" label={t.loading} /></section>;
  if (loadError) {
    return (
      <section className="dash-panel tab-panel">
        <EmptyState variant="error" size="inline" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }

  return (
    <section className="dash-panel tab-panel">
      <div className="tab-panel-header"><div><span className="eyebrow">FILES</span><h2>{t.heading}</h2><p>{t.intro}</p></div></div>

      {canManage && (
        <div className="engine-documents-upload">
          {/* Nativní drag & drop, žádná knihovna — stejný přístup jako přetahování pořadí jinde v projektu. */}
          <div
            className={`engine-documents-dropzone${dragOver ? " is-dragover" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(event) => { if (event.target.files) addFiles(event.target.files); }} hidden />
            <strong>⇪ {t.dropHere}</strong>
            <span>{t.orBrowse}</span>
            <small>{t.formats}</small>
          </div>

          {files.length > 0 && (
            <div className="engine-documents-selected">
              <span>{t.selectedFiles(files.length)}</span>
              <div className="engine-documents-selected-list">
                {files.map((file, index) => (
                  <b key={`${file.name}-${index}`}>
                    📎 {file.name}
                    <button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>×</button>
                  </b>
                ))}
              </div>
            </div>
          )}

          <div className="engine-documents-form-row">
            <label><span>{t.typeLabel} *</span>
              <select value={typeId} onChange={(event) => setTypeId(event.target.value)}>
                <option value="">{t.typeSelect}</option>
                {types.map((type) => <option key={type.id} value={type.id}>{locale === "cs" ? type.nameCs : type.nameEn}</option>)}
              </select>
            </label>
            <label className="engine-documents-note"><span>{t.noteLabel}</span>
              <input value={note} placeholder={t.notePlaceholder} maxLength={500} onChange={(event) => setNote(event.target.value)} />
            </label>
            <button className="primary-button" type="button" disabled={files.length === 0 || uploading} onClick={() => void upload()}>
              {uploading ? t.uploading : t.upload}
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      )}

      {documents.length === 0 ? (
        <EmptyState size="inline" title={t.empty} description={t.emptyHelp} />
      ) : (
        <div className="engine-documents-list">
          {documents.map((document) => (
            <article key={document.id} className="engine-documents-row">
              <a className="engine-documents-preview" href={document.url} target="_blank" rel="noreferrer">
                {document.contentType.startsWith("image/")
                  ? <img src={document.url} alt={document.fileName} />
                  : <span className="engine-documents-pdf">{t.pdfLabel}</span>}
              </a>
              <div className="engine-documents-meta">
                <span className="engine-documents-type">{locale === "cs" ? document.typeNameCs : document.typeNameEn}</span>
                <strong>{document.fileName}</strong>
                {document.note && <small className="engine-documents-note-text">{document.note}</small>}
                <small>{formatDate(document.createdAt, locale)} · {document.createdBy} · {formatFileSize(document.sizeBytes, locale)}</small>
              </div>
              <div className="engine-documents-actions">
                <a className="secondary-compact" href={document.url} target="_blank" rel="noreferrer">{t.download}</a>
                {canManage && <button className="danger-compact" type="button" onClick={() => void deleteDocument(document)}>{t.delete}</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
