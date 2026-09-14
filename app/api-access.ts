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
  // RACE MODE na place: výběr závodu, piloti a jejich přiřazené motory. Vlastní routa právě
  // proto, aby mechanik nemusel dostat `/api/race-planning` s organizátorem, logistikou
  // a obchodním kontextem.
  "/api/race-mode",
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
  // Zakázkový servis: zákaznické motory ve frontě a mechanikova jediná obrazovka zápisu.
  // Úzká routa záměrně, ne `/api/service-orders` — ten je mimo mechanika úplně (sekce
  // Zakázky je pro superadmina a vedení, viz MECHANIC_PAYLOADS níž pro ořez odpovědi).
  "/api/customer-service",
]);

/** Zápis. Mechanik zapisuje jen servisní záznamy a zařazení motoru do fronty. */
const MECHANIC_WRITE = new Set([
  "/api/service-records",
  "/api/service-queue",
  // „Jel / nejel" a stav Oppamy zapsaný přímo na place.
  "/api/race-mode",
  // Zápis práce a materiálu na zákaznickém motoru, přepnutí na „čeká na díl" a „hotovo".
  "/api/customer-service",
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
      "id", "publicCode", "code", "family", "category", "status", "ignition", "kzGeneration",
      "currentConfiguration", "upgradeCode", "labelColor",
      "pistonSpec", "cylinderCode", "cylinderUpgrade", "liner", "degree", "timing",
      "carter", "reeds", "spacer", "squish",
      "totalMinutes", "pistonMinutes", "rodMinutes", "lastOppamaMinutes", "currentPistonSize",
      "assignedRace", "assignedDriver", "assignmentStatus",
    ],
  },
};

/**
 * Přísnější varianta whitelistu: popisuje **celou** odpověď, ne jednu kolekci v ní.
 *
 * Co tu není vyjmenované, se zahodí — včetně celých větví. Nové pole v dotazu se tak
 * mechanikovi neprosákne ani tehdy, když ho někdo přidá do SQL a zapomene na oprávnění.
 */
type FieldTree = { fields?: string[]; children?: Record<string, FieldTree> };

const MECHANIC_PAYLOADS: Record<string, FieldTree> = {
  // RACE MODE: název a termín závodu, piloti s kategorií a jejich přiřazené motory. Nic jiného —
  // žádný organizátor, trať, adresa, poznámky, mechanici, logistika ani obchod.
  // Časová osa motoru: mechanik vidí, co se s motorem dělo, ale ne kdo to odklikl —
  // `actor` u systémových a frontových událostí je e-mail interního účtu.
  "/api/engine-timeline": {
    children: {
      engine: { fields: ["id", "code", "family"] },
      events: { fields: ["id", "kind", "date", "time", "sortAt", "title", "detail", "system", "serviceRecordId", "raceId"] },
    },
  },
  // Fronta na servis je mechanikova vlastní obrazovka; ven jde všechno kromě e-mailu toho,
  // kdo motor do fronty ručně zařadil.
  "/api/service-queue": {
    children: {
      categories: { fields: ["code", "nameCs", "nameEn", "sortOrder", "serviceCardMigrated"] },
      engines: { fields: ["id", "code", "family", "inQueue"] },
      mechanics: { fields: ["id", "name"] },
      items: {
        fields: ["engineId", "engineCode", "family", "returnDate", "driverNames", "notes",
          "serviceCardMigrated", "nextRaceDate", "nextRaceName"],
        children: {
          sources: { fields: ["sourceType", "sourceId", "sourceLabel", "returnDate", "driverName", "note"] },
          claim: { fields: ["id", "byName", "at", "canRelease"] },
        },
      },
    },
    fields: ["claimNeedsMechanic"],
  },
  // Servisní karta motoru. `createdBy` a `cancelledBy` jsou e-maily účtů — mechanik má
  // u záznamu jméno mechanika, víc nepotřebuje.
  "/api/service-records": {
    fields: ["claim", "technicalLinks", "technicalValues", "engine", "category", "serviceTypes",
      "cardItems", "materialCategories", "materialVariants", "defaultItems", "mechanics"],
    children: {
      records: {
        fields: ["id", "engineId", "serviceTypeId", "serviceTypeSnapshot", "serviceDate", "serviceTime",
          "counterMinutes", "mechanicId", "mechanicNameSnapshot", "note", "cancelledReason", "cancelledAt",
          "divergenceNote", "createdAt", "items"],
      },
    },
  },
  "/api/race-mode": {
    children: {
      races: { fields: ["id", "name", "startDate", "endDate", "departureDate", "returnDate", "status"] },
      race: { fields: ["id", "name", "startDate", "endDate"] },
      entries: {
        fields: ["id", "category", "driverName"],
        children: { engines: { fields: ["engineId", "engineCode", "tracksHours"] } },
      },
      engineRuns: { fields: ["engineId", "raced"] },
    },
  },
  // Zákaznické motory: fronta i mechanikova obrazovka zápisu. Mechanik vidí ceníkové ceny
  // u položek (`unitPriceCzkCents`/`unitPriceEurCents`), ale ne slevu (`discountPercent`) ani
  // celkovou cenu řádku (`totalCzkCents`/`totalEurCents`) — ty dvě se musí vynechat spolu,
  // protože z ceny, množství a celkové ceny by šla sleva zpětně dopočítat. Součet zakázky se
  // sem vůbec nedostane, protože ho routa v odpovědi nikdy nepočítá.
  "/api/customer-service": {
    children: {
      items: {
        fields: ["orderEngineId", "engineCode", "typeNameCs", "typeNameEn", "customerName", "deadlineDate", "status", "takenByName", "takenAt", "sortOrder"],
      },
      engine: {
        fields: ["orderEngineId", "engineCode", "typeNameCs", "typeNameEn", "customerName", "scope", "carbService", "customerParts", "customerPartsText", "status", "takenByName", "takenAt"],
        children: {
          works: { fields: ["id", "codeSnapshot", "nameCsSnapshot", "nameEnSnapshot", "quantity", "unitPriceCzkCents", "unitPriceEurCents"] },
          materials: { fields: ["id", "code", "name", "quantity", "unitPriceCzkCents", "unitPriceEurCents", "source"] },
          waitingParts: { fields: ["id", "code", "name", "priceCzkCents", "priceEurCents", "expectedDate", "isOrdered", "arrivedAt"] },
        },
      },
      priceItems: { fields: ["id", "code", "nameCs", "nameEn", "priceCzkCents", "priceEurCents"] },
      inventoryParts: { fields: ["id", "code", "name", "priceCzkCents", "priceEurCents"] },
    },
  },
};

/** Projde hodnotu podle stromu whitelistu; pole, která ve stromu nejsou, vypadnou. */
function applyFieldTree(value: unknown, tree: FieldTree): unknown {
  if (Array.isArray(value)) return value.map((item) => applyFieldTree(item, tree));
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of tree.fields ?? []) {
    if (field in source) result[field] = source[field];
  }
  for (const [key, child] of Object.entries(tree.children ?? {})) {
    if (key in source) result[key] = applyFieldTree(source[key], child);
  }
  return result;
}

/**
 * Ořeže odpověď na to, co mechanik smí vidět. Endpointy bez pravidla projdou beze změny —
 * ty, které mechanikovi zůstaly povolené, jsou buď jeho vlastní (fronta, servisní záznamy),
 * nebo číselníky bez obchodních dat.
 */
export function filterResponseForMechanic(role: AppRole, pathname: string, payload: unknown): unknown {
  if (role !== "mechanic") return payload;

  const shape = MECHANIC_PAYLOADS[routeKey(pathname)];
  if (shape) return applyFieldTree(payload, shape);

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
