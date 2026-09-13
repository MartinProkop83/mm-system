"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { EngineServiceCard } from "./engine-service-card";

type Locale = "cs" | "en";

/**
 * Zápis servisu v režimu bez menu.
 *
 * Fronta sem pošle jeden motor, mechanik zapíše servis a vrátí se zpátky. Načítá se vlastním
 * dotazem, protože tenhle režim nemá seznam motorů z dashboardu.
 *
 * Kategorie, která ještě jede po staré servisní kartě, se tu zapsat nedá — starý formulář je
 * navázaný na dashboard. Místo prázdné obrazovky je tu vysvětlení a cesta zpět.
 */
export function EngineServiceEntryScreen({ locale, engineId, currentUserName, onDone }: {
  locale: Locale;
  engineId: string;
  currentUserName: string;
  onDone: () => void;
}) {
  const [engine, setEngine] = useState<{ id: string; code: string; family: string } | null>(null);
  const [migrated, setMigrated] = useState<boolean | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/service-records?engineId=${encodeURIComponent(engineId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as {
        engine: { id: string; code: string; family: string };
        category: { serviceCardMigrated: boolean };
      };
      setEngine(data.engine);
      setMigrated(data.category.serviceCardMigrated);
    } catch {
      setError(true);
    }
  }, [engineId]);

  useEffect(() => { void load(); }, [load]);

  const back = locale === "cs" ? "Zpět na frontu" : "Back to the queue";

  if (error) {
    return (
      <main className="queue-screen">
        <div className="queue-screen-body">
          <section className="dash-panel">
            <EmptyState variant="error" icon="!" title={locale === "cs" ? "Motor se nepodařilo načíst." : "The engine could not be loaded."}
              action={<button className="secondary-compact" type="button" onClick={onDone}>{back}</button>} />
          </section>
        </div>
      </main>
    );
  }

  if (!engine || migrated === null) {
    return <main className="queue-screen"><div className="queue-screen-body"><section className="dash-panel"><LoadingState label={locale === "cs" ? "Načítám motor…" : "Loading the engine…"} /></section></div></main>;
  }

  return (
    <main className="queue-screen">
      <header className="queue-screen-bar">
        <button className="secondary-compact" type="button" onClick={onDone}>← {back}</button>
        <strong className="queue-screen-engine">{engine.code}</strong>
        <span className="queue-screen-user">{engine.family}</span>
      </header>
      <div className="queue-screen-body">
        {migrated ? (
          <EngineServiceCard
            engine={engine}
            locale={locale}
            currentUserName={currentUserName}
            openEntryOnMount
            onEntryClosed={onDone}
            onSaved={onDone}
            onOpenHours={() => { /* motohodiny se v režimu bez menu neupravují */ }}
            renderLegacy={() => null}
          />
        ) : (
          <section className="dash-panel">
            <EmptyState
              icon="!"
              title={locale === "cs" ? "Tuhle kategorii zatím zapisuje hlavní aplikace" : "This category is still recorded in the main app"}
              description={locale === "cs"
                ? "Kategorie ještě nepřešla na novou servisní kartu. Servis pro ni zapiš v sekci Motory, nebo motor odbav tlačítkem „Nejel / bez servisu“ přímo ve frontě."
                : "This category has not moved to the new service card yet. Record the service under Engines, or clear the engine with “Didn't run / no service” straight from the queue."}
              action={<button className="secondary-compact" type="button" onClick={onDone}>{back}</button>}
            />
          </section>
        )}
      </div>
    </main>
  );
}
