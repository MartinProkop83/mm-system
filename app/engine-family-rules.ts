/** Rodiny motorů, které neevidují motohodiny (Oppama) — motohodiny se pro ně na UI skrývají / API zápisy blokují. */
export const NO_HOUR_TRACKING_ENGINE_FAMILIES: readonly string[] = ["MINI", "OKJ"];

/** Rodiny motorů, u kterých se po dokončeném závodě automaticky nastaví stav "Servis" (přestavba po každém závodě). */
export const AUTO_SERVICE_ON_RACE_ENGINE_FAMILIES: readonly string[] = ["MINI"];

/** Rodiny motorů, u kterých se po uložení servisního záznamu automaticky nastaví stav zpět na "Připraveno". */
export const AUTO_READY_ON_SERVICE_ENGINE_FAMILIES: readonly string[] = ["MINI"];

/**
 * Rodiny motorů, jejichž sada vyměnitelných dílů na servisní kartě žije v DB tabulce
 * `engine_service_part_catalog` (editovatelné bez zásahu do kódu). Ostatní rodiny zatím
 * používají starý hardcoded seznam `serviceParts`/`allowedParts`, dokud se na ně nepřevede
 * i katalog v DB.
 */
export const DB_BACKED_SERVICE_PART_FAMILIES: readonly string[] = ["MINI"];
