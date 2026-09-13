import type { AppRole } from "./server-auth";

/**
 * Co smí mechanik přes API.
 *
 * **Default je zákaz.** Endpoint, který tu není vyjmenovaný, mechanikovi vrátí 403 — i ten,
 * který teprve vznikne. Mechanik má jako celou aplikaci frontu na servis (`/servis-fronta`),
 * takže zbytek systému nepotřebuje ani ke čtení.
 *
 * Ostatní role (superadmin, vedení) tahle politika neomezuje; ty si své kontroly řeší
 * jednotlivé routy samy.
 */

/** Čtení. Zápis je řešený zvlášť — viz `MECHANIC_WRITE`. */
const MECHANIC_READ = new Set([
  "/api/service-queue",
  "/api/service-records",
  // Číselníky, bez kterých nejde zapsat servis: položky karty a katalog materiálu.
  "/api/service-card-settings",
  // Detail motoru na servisní kartě.
  "/api/engines",
  // Technické údaje motoru a porovnání s vybraným materiálem (varianta C).
  "/api/engine-technical-structure",
  // Časová osa na kartě motoru.
  "/api/engine-timeline",
  // Název a datum závodu — fronta ukazuje, odkud se motor vrátil.
  "/api/races",
  // Vlastní session: bez ní se nepozná přihlášený uživatel ani jazyk.
  "/api/session",
]);

/** Zápis. Mechanik zapisuje jen servisní záznamy a zařazení motoru do fronty. */
const MECHANIC_WRITE = new Set([
  "/api/service-records",
  "/api/service-queue",
]);

const READ_METHODS = new Set(["GET", "HEAD"]);

/** Normalizuje cestu na `/api/<jméno>` — query ani podcesty o oprávnění nerozhodují. */
function routeKey(pathname: string) {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  return parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : `/${parts.join("/")}`;
}

export function mechanicMayAccess(pathname: string, method: string) {
  const key = routeKey(pathname);
  return READ_METHODS.has(method.toUpperCase()) ? MECHANIC_READ.has(key) : MECHANIC_WRITE.has(key);
}

export function isApiAccessAllowed(role: AppRole, pathname: string, method: string) {
  return role !== "mechanic" || mechanicMayAccess(pathname, method);
}

/**
 * Co z odpovědi mechanik uvidí — whitelist, ne blacklist.
 *
 * Povolit endpoint nestačí: `/api/races` vrací adresy a organizátora, `/api/engines` datum
 * nákupu, prodeje a `location`, kde u zapůjčeného motoru figuruje jméno příjemce. Whitelist
 * je bezpečnější než seznam zakázaných klíčů — pole, které do odpovědi teprve přibude, se
 * mechanikovi samo neprosákne.
 */
const MECHANIC_FIELDS: Record<string, { collection: string; fields: string[] }> = {
  // Fronta ukazuje, odkud se motor vrátil — k tomu stačí název a termín.
  "/api/races": {
    collection: "races",
    fields: ["id", "name", "startDate", "endDate", "status", "countryCode", "track"],
  },
  // Detail motoru na servisní kartě: technika ano, obchod ne.
  "/api/engines": {
    collection: "engines",
    fields: [
      "id", "code", "family", "category", "status", "ignition", "kzGeneration",
      "currentConfiguration", "upgradeCode", "labelColor",
      "pistonSpec", "cylinderCode", "cylinderUpgrade", "liner", "degree", "timing",
      "carter", "reeds", "spacer", "squish",
      "totalMinutes", "pistonMinutes", "rodMinutes", "lastOppamaMinutes", "currentPistonSize",
      "assignedRace", "assignedDriver", "assignmentStatus",
    ],
  },
};

/**
 * Ořeže odpověď na to, co mechanik smí vidět. Endpointy bez pravidla projdou beze změny —
 * ty, které mechanikovi zůstaly povolené, jsou buď jeho vlastní (fronta, servisní záznamy),
 * nebo číselníky bez obchodních dat.
 */
export function filterResponseForMechanic(role: AppRole, pathname: string, payload: unknown): unknown {
  if (role !== "mechanic") return payload;

  const rule = MECHANIC_FIELDS[routeKey(pathname)];
  if (!rule || !payload || typeof payload !== "object") return payload;

  const source = payload as Record<string, unknown>;
  const collection = source[rule.collection];
  if (!Array.isArray(collection)) return payload;

  const allowed = new Set(rule.fields);
  return {
    ...source,
    [rule.collection]: collection.map((item) => {
      if (!item || typeof item !== "object") return item;
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
        if (allowed.has(key)) result[key] = value;
      }
      return result;
    }),
  };
}
