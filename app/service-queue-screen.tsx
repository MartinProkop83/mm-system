"use client";

import Link from "next/link";
import { useState } from "react";
import { ServiceQueuePage } from "./service-queue-page";
import { EngineServiceEntryScreen } from "./engine-service-entry-screen";

type Locale = "cs" | "en";
type AppRole = "superadmin" | "boss" | "mechanic";

/**
 * Celoobrazovkový obal fronty — bez bočního menu a bez zbytku aplikace.
 *
 * Používá se na dvou místech: na nástěnce v dílně a jako domovská obrazovka mechaniků.
 * Odkaz zpět do systému vidí jen superadmin a vedení; mechanik se odsud nikam neproklikne.
 */
export function ServiceQueueScreen({ locale, role, userName }: {
  locale: Locale;
  role: AppRole;
  userName: string;
}) {
  const [engineId, setEngineId] = useState<string | null>(null);
  const canLeave = role !== "mechanic";

  if (engineId) {
    return (
      <EngineServiceEntryScreen
        locale={locale}
        engineId={engineId}
        currentUserName={role === "mechanic" ? userName : ""}
        onDone={() => setEngineId(null)}
      />
    );
  }

  return (
    <main className="queue-screen">
      <header className="queue-screen-bar">
        <img src="/machac-motors-logo.jpg" alt="Macháč Motors" />
        <span className="queue-screen-user">{userName}</span>
        {canLeave && (
          <Link className="secondary-compact" href="/">{locale === "cs" ? "Zpět do systému" : "Back to the system"}</Link>
        )}
      </header>
      <div className="queue-screen-body">
        <ServiceQueuePage locale={locale} onOpenEngineService={setEngineId} />
      </div>
    </main>
  );
}
