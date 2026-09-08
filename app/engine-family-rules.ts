/** Rodiny motorů, které neevidují motohodiny (Oppama) — motohodiny se pro ně na UI skrývají / API zápisy blokují. */
export const NO_HOUR_TRACKING_ENGINE_FAMILIES: readonly string[] = ["MINI", "OKJ"];

/** Rodiny motorů, u kterých se po dokončeném závodě automaticky nastaví stav "Servis" (přestavba po každém závodě). */
export const AUTO_SERVICE_ON_RACE_ENGINE_FAMILIES: readonly string[] = ["MINI"];
