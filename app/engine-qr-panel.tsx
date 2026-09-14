"use client";

import { EngineQrCode, downloadQrPng, engineQrUrl, qrModuleCount, useQrBaseUrl } from "./engine-qr";

type Locale = "cs" | "en";

const content = {
  cs: {
    heading: "QR kód motoru",
    intro: "Nalepí se na motor. Po naskenování se otevře jeho servisní karta — po přihlášení rovnou na tomhle motoru, ne na hlavní stránce.",
    modules: (count: number) => `${count} × ${count} modulů`,
    download: "Stáhnout PNG",
    print: "Vytisknout štítek",
    printNote: "Vytiskne jeden štítek 40 × 45 mm — bez menu a bez zbytku stránky.",
    readable: "Kdyby kód nešel naskenovat, motor se dá dohledat podle tohohle čísla.",
    baseHint: "Základní adresa se bere z Nastavení → Obecné. Teď se používá adresa, na které systém běží.",
    baseSet: (url: string) => `Základní adresa z nastavení: ${url}`,
  },
  en: {
    heading: "Engine QR code",
    intro: "Goes on the engine. Scanning it opens the service card — after signing in it lands on this engine, not the home page.",
    modules: (count: number) => `${count} × ${count} modules`,
    download: "Download PNG",
    print: "Print the label",
    printNote: "Prints one 40 × 45 mm label — without the menu and the rest of the page.",
    readable: "If the code will not scan, the engine can be found by this number.",
    baseHint: "The base address comes from Settings → General. Right now the address the system runs on is used.",
    baseSet: (url: string) => `Base address from settings: ${url}`,
  },
} as const;

/**
 * QR kód motoru na jeho kartě.
 *
 * Kód nese **krátký identifikátor**, ne id motoru: telefonem se z hrubší mřížky načte rychleji
 * a z větší dálky, což je v dílně jediné, na čem záleží. Varianta s plným id se po porovnání
 * na telefonu zahodila.
 */
export function EngineQrPanel({ engine, locale }: {
  engine: { id: string; code: string; family: string; publicCode: string };
  locale: Locale;
}) {
  const t = content[locale];
  const { baseUrl, configured } = useQrBaseUrl();
  if (!baseUrl || !engine.publicCode) return null;

  const url = engineQrUrl(baseUrl, engine.publicCode);

  return (
    <section className="dash-panel detail-card engine-qr-card">
      <div className="panel-heading"><span>{t.heading}</span></div>
      <p className="engine-qr-intro">{t.intro}</p>

      <div className="engine-qr-variants">
        <div className="engine-qr-variant">
          <EngineQrCode value={url} size={168} title={engine.code} />
          <small className="engine-qr-modules">{t.modules(qrModuleCount(url))}</small>
          <code>{url}</code>
          <div className="engine-qr-actions">
            <button className="secondary-compact" type="button"
              onClick={() => downloadQrPng(url, `qr-${engine.code.replace(/\s+/g, "-")}.png`)}>
              ⇩ {t.download}
            </button>
            <button className="secondary-compact" type="button" onClick={() => window.print()}>
              ⎙ {t.print}
            </button>
          </div>
          <small>{t.printNote}</small>
        </div>

        {/* Identifikátor čitelný okem — kvůli tomu je v abecedě bez znaků, co se pletou. */}
        <div className="engine-qr-readable">
          <b>{engine.publicCode}</b>
          <small>{t.readable}</small>
        </div>
      </div>

      <p className="form-hint">{configured ? t.baseSet(configured) : t.baseHint}</p>

      {/* Tisková podoba: jeden štítek v pevné velikosti, na obrazovce skrytý. */}
      <div className="qr-print-area qr-print-only">
        <div className="qr-sheet-grid" style={{ "--qr-print-columns": 1 } as React.CSSProperties}>
          <figure className="qr-sheet-label">
            <EngineQrCode value={url} size={150} title={engine.code} />
            <figcaption>
              <strong>{engine.code}</strong>
              <small>{engine.family} · {engine.publicCode}</small>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
