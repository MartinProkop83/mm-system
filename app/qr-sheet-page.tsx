"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { EngineQrCode, engineQrUrl, useQrBaseUrl } from "./engine-qr";

type Locale = "cs" | "en";
type Engine = { id: string; publicCode: string; code: string; family: string };

const content = {
  cs: {
    eyebrow: "SERVIS",
    title: "QR kódy motorů",
    intro: "Arch se štítky pro celou kategorii — vytiskne se přesně to, co je zrovna vyfiltrované.",
    loading: "Načítám motory…",
    loadError: "Motory se nepodařilo načíst.",
    retry: "Zkusit znovu",
    empty: "V téhle kategorii není žádný motor",
    category: "Kategorie",
    all: "Všechny",
    perRow: "Štítků na řádek",
    print: "Tisk",
    printHint: "Vytiskne jen mřížku štítků — bez menu, hlavičky a filtrů. Štítek má na papíře 40 × 45 mm, na A4 se jich vejde 20 a žádný se nerozřízne mezi stránkami.",
    printColumns: "Na papír se vejdou nejvýš čtyři štítky na řádek; vyšší volba platí jen pro obrazovku.",
    count: (count: number) => `${count} motorů na archu`,
    baseFallback: "Základní adresa není nastavená, použije se adresa prohlížeče. Nastavuje se v Nastavení → Obecné.",
  },
  en: {
    eyebrow: "SERVICE",
    title: "Engine QR codes",
    intro: "A label sheet for a whole category — what is filtered is what gets printed.",
    loading: "Loading engines…",
    loadError: "The engines could not be loaded.",
    retry: "Try again",
    empty: "No engine in this category",
    category: "Category",
    all: "All",
    perRow: "Labels per row",
    print: "Print",
    printHint: "Prints the label grid only — no menu, header or filters. A label is 40 × 45 mm on paper, 20 fit on A4 and none is cut across pages.",
    printColumns: "At most four labels per row fit on paper; a higher choice applies to the screen only.",
    count: (count: number) => `${count} engines on the sheet`,
    baseFallback: "No base address set, the browser address is used. Set it in Settings → General.",
  },
} as const;

const COLUMN_CHOICES = [2, 3, 4, 5, 6] as const;
/** Kolik štítků 40 mm se vedle sebe vejde na A4 s 10mm okraji — víc jich papír neunese. */
const PRINT_COLUMNS_MAX = 4;

/**
 * Hromadné generování QR štítků.
 *
 * Tisk bere to, co je zrovna vyfiltrované — mřížka v `.qr-print-area` je jediné, co se na papír
 * dostane; menu, hlavička i filtry se v tiskovém režimu schovají. Na papíře má štítek pevný
 * rozměr v milimetrech, protože se stříhá a lepí na motor.
 *
 * Pod každým kódem je číslo motoru a krátký identifikátor, aby šel štítek přiřadit k motoru
 * i bez čtečky.
 */
export function QrSheetPage({ locale }: { locale: Locale }) {
  const t = content[locale];
  const { baseUrl, configured } = useQrBaseUrl();
  const [engines, setEngines] = useState<Engine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [family, setFamily] = useState("");

  const [columns, setColumns] = useState(4);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await fetch("/api/engines", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { engines: Engine[] };
      setEngines(data.engines);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const families = useMemo(
    () => Array.from(new Set(engines.map((engine) => engine.family))).sort(),
    [engines],
  );
  const shown = useMemo(
    () => engines.filter((engine) => !family || engine.family === family),
    [engines, family],
  );

  if (loading) return <section className="dash-panel"><LoadingState label={t.loading} /></section>;
  if (loadError) {
    return (
      <section className="dash-panel">
        <EmptyState variant="error" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }

  return (
    <section className="qr-sheet">
      <article className="dash-panel queue-hero">
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h2>{t.title}</h2>
          <p>{t.intro}</p>
        </div>
        <div className="queue-hero-side">
          <button className="primary-button queue-add-button" type="button" onClick={() => window.print()}>⎙ {t.print}</button>
          <div className="queue-total">
            <strong>{shown.length}</strong>
            <small>{t.count(shown.length)}</small>
          </div>
        </div>
      </article>

      <div className="history-filters">
        <div className="history-filter-group">
          <label><span>{t.category}</span>
            <select value={family} onChange={(event) => setFamily(event.target.value)}>
              <option value="">{t.all}</option>
              {families.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <label><span>{t.perRow}</span>
            <select value={columns} onChange={(event) => setColumns(Number(event.target.value))}>
              {COLUMN_CHOICES.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
            </select>
          </label>
        </div>
      </div>

      <p className="form-hint">{configured ? `${configured}/m/…` : t.baseFallback}</p>
      <p className="form-hint">{t.printHint}</p>
      <p className="form-hint">{t.printColumns}</p>

      {shown.length === 0 ? (
        <section className="dash-panel"><EmptyState size="inline" variant="filtered" title={t.empty} /></section>
      ) : (
        <article className="dash-panel qr-print-area">
          {/* Na papíře má štítek pevný rozměr v milimetrech, takže se počet na řádek omezí tím,
              co se na A4 vejde; volba výš platí dál pro obrazovku. */}
          <div className="qr-sheet-grid" style={{
            "--qr-columns": columns,
            "--qr-print-columns": Math.min(columns, PRINT_COLUMNS_MAX),
          } as React.CSSProperties}>
            {shown.filter((engine) => engine.publicCode).map((engine) => (
              <figure key={engine.id} className="qr-sheet-label">
                <EngineQrCode value={engineQrUrl(baseUrl, engine.publicCode)} size={150} title={engine.code} />
                <figcaption>
                  <strong>{engine.code}</strong>
                  <small>{engine.family} · {engine.publicCode}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        </article>
      )}
    </section>
  );
}
