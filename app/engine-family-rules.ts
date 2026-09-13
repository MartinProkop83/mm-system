/**
 * Rodiny motorů, které neevidují motohodiny (Oppama) — motohodiny se pro ně na UI skrývají / API zápisy blokují.
 *
 * Nová servisní karta se na tenhle seznam neptá: čte `engine_categories.counter_unit`
 * (NULL = kategorie počítadlo nemá), aby šlo počítadlo zapnout změnou v Nastavení bez zásahu
 * do kódu. Obsah obou musí zůstat v souladu — seed v `db/runtime-schema.ts` ho tak zakládá.
 */
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
 *
 * NAHRAZENO sloupcem `engine_categories.service_card_migrated`. Zůstává jen kvůli staré
 * cestě zápisu (`/api/engine-records`) u kategorií, které na novou kartu ještě nepřešly;
 * `engine_service_part_catalog` už se needituje — jeho obsah je zmigrovaný
 * do `service_card_items` a spravuje se v Nastavení → Servisní karta.
 */
export const DB_BACKED_SERVICE_PART_FAMILIES: readonly string[] = ["MINI"];
