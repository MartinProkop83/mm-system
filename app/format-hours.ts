/**
 * Motohodiny se v celém systému zadávají a zobrazují jako HH:MM, uloženy jsou v minutách.
 * Přesunuto z `mm-dashboard.tsx`, aby ho mohly použít i jiné klientské komponenty
 * (zakázkový servis) beze cyklického importu zpátky do dashboardu.
 *
 * Parsování HH:MM → minuty je server-side v `app/engine-usage.ts` (`parseTime`) — klient
 * jen posílá text, server validuje a převádí. Tahle funkce je jen opačný směr pro zobrazení.
 */
export function formatHours(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
