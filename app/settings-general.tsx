"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadingState } from "./empty-state";

type Locale = "cs" | "en";
type AppRole = "superadmin" | "boss" | "mechanic";

const content = {
  cs: {
    kicker: "MM SYSTEM · OBECNÉ",
    title: "Obecné nastavení",
    intro: "Hodnoty, které platí pro celý systém.",
    qrTitle: "Základní adresa pro QR kódy",
    qrHint: "Adresa, na které systém běží. Lepí se před /m/<kód> v QR kódech motorů. Dokud je prázdná, použije se adresa, ze které se aplikace zrovna otevřela — což na localhostu stačí.",
    qrPlaceholder: "https://mm.machacmotors.cz",
    qrCurrent: (url: string) => `Teď se používá: ${url}`,
    qrFallback: (url: string) => `Nenastaveno, používá se adresa prohlížeče: ${url}`,
    save: "Uložit",
    saving: "Ukládám…",
    saved: "Nastavení uloženo. QR kódy se generují znovu při každém zobrazení, takže platí hned.",
    loadError: "Nastavení se nepodařilo načíst.",
    saveError: "Nastavení se nepodařilo uložit.",
    readOnly: "Obecné nastavení mění jen superadmin.",
  },
  en: {
    kicker: "MM SYSTEM · GENERAL",
    title: "General settings",
    intro: "Values that apply to the whole system.",
    qrTitle: "Base address for QR codes",
    qrHint: "The address the system runs on. It goes before /m/<code> in engine QR codes. While empty, the address the app was opened from is used — enough on localhost.",
    qrPlaceholder: "https://mm.machacmotors.cz",
    qrCurrent: (url: string) => `Currently used: ${url}`,
    qrFallback: (url: string) => `Not set, using the browser address: ${url}`,
    save: "Save",
    saving: "Saving…",
    saved: "Settings saved. QR codes are generated on every view, so this applies immediately.",
    loadError: "The settings could not be loaded.",
    saveError: "The settings could not be saved.",
    readOnly: "Only a superadmin can change general settings.",
  },
} as const;

/**
 * Obecné nastavení aplikace.
 *
 * Zatím jediná položka je základní adresa pro QR kódy, ale tabulka i routa jsou obecné —
 * další hodnota přibude sem, ne do nové sekce.
 */
export function GeneralSettings({ locale, role }: { locale: Locale; role: AppRole }) {
  const t = content[locale];
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/app-settings", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { settings?: Record<string, string> };
      setBaseUrl(data.settings?.qr_base_url ?? "");
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [t.loadError]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/app-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "qr_base_url", value: baseUrl }),
      });
      const data = (await response.json()) as { value?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "save failed");
      setBaseUrl(data.value ?? "");
      setMessage(t.saved);
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message !== "save failed" ? saveError.message : t.saveError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="dash-panel"><LoadingState size="inline" label="…" /></section>;

  const browserOrigin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <>
      <article className="dash-panel settings-hero">
        <div>
          <span className="settings-kicker">{t.kicker}</span>
          <h2>{t.title}</h2>
          <p>{t.intro}</p>
        </div>
      </article>

      <section className="dash-panel">
        <label className="settings-general-field">
          <span>{t.qrTitle}</span>
          <input type="url" value={baseUrl} placeholder={t.qrPlaceholder} disabled={role !== "superadmin"}
            onChange={(event) => { setBaseUrl(event.target.value); setMessage(""); }} />
          <small>{t.qrHint}</small>
        </label>
        <p className="form-hint">{baseUrl ? t.qrCurrent(baseUrl) : t.qrFallback(browserOrigin)}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-hint" role="status">{message}</p>}
        {role === "superadmin" ? (
          <footer className="modal-actions">
            <span className="modal-actions-spacer" />
            <button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>
              {saving ? t.saving : t.save}
            </button>
          </footer>
        ) : (
          <p className="form-hint">{t.readOnly}</p>
        )}
      </section>
    </>
  );
}
