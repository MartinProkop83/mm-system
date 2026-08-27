export type RentalStatus = "preparing" | "sent" | "active" | "overdue" | "returned" | "cancelled";
export type RentalRole = "superadmin" | "boss" | "mechanic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function rentalDays(startDate: string, endDate: string | null | undefined): number {
  if (!isIsoDate(startDate) || !endDate || !isIsoDate(endDate) || endDate < startDate) return 0;
  return Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS) + 1;
}

export function periodsOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return isIsoDate(startA) && isIsoDate(endA) && isIsoDate(startB) && isIsoDate(endB)
    ? startA <= endB && endA >= startB
    : false;
}

export function isRentalOverdue(status: RentalStatus, plannedReturnDate: string, actualReturnDate: string | null, today: string): boolean {
  return !actualReturnDate && status !== "preparing" && status !== "returned" && status !== "cancelled" && plannedReturnDate < today;
}

export function effectiveRentalStatus(status: RentalStatus, plannedReturnDate: string, actualReturnDate: string | null, today: string): RentalStatus {
  if (status === "cancelled") return "cancelled";
  if (actualReturnDate || status === "returned") return "returned";
  return isRentalOverdue(status, plannedReturnDate, actualReturnDate, today) ? "overdue" : status;
}

export function calculateRentalTotals(
  handoverDate: string,
  plannedReturnDate: string,
  actualReturnDate: string | null,
  items: Array<{ dailyPriceCents: number; quantity?: number; returnedDate?: string | null; billableDays?: number | null }>,
) {
  const plannedDays = rentalDays(handoverDate, plannedReturnDate);
  const actualDays = actualReturnDate ? rentalDays(handoverDate, actualReturnDate) : null;
  const totalCents = items.reduce((sum, item) => {
    const billedEnd = item.returnedDate || actualReturnDate || plannedReturnDate;
    const fallbackDays = rentalDays(handoverDate, billedEnd);
    const days = item.billableDays === null || item.billableDays === undefined
      ? fallbackDays
      : Math.max(0, Math.trunc(item.billableDays));
    return sum + Math.max(0, Math.trunc(item.dailyPriceCents)) * Math.max(1, Math.trunc(item.quantity ?? 1)) * days;
  }, 0);
  return { plannedDays, actualDays, totalCents };
}

export function canManageRentals(role: RentalRole): boolean {
  return role === "superadmin" || role === "boss";
}

export function applyRentalReturns<T extends { id: string; dailyPriceCents: number; quantity?: number; returnedDate?: string | null; billableDays?: number | null }>(
  handoverDate: string,
  plannedReturnDate: string,
  currentStatus: RentalStatus,
  items: T[],
  returnedItemIds: string[],
  returnedDate: string,
) {
  const returned = new Set(returnedItemIds);
  const updatedItems = items.map((item) => returned.has(item.id) ? { ...item, returnedDate } : item);
  const allReturned = updatedItems.length > 0 && updatedItems.every((item) => Boolean(item.returnedDate));
  const actualReturnDate = allReturned
    ? updatedItems.reduce((latest, item) => item.returnedDate && item.returnedDate > latest ? item.returnedDate : latest, handoverDate)
    : null;
  const status: RentalStatus = allReturned ? "returned" : currentStatus === "returned" ? "active" : currentStatus;
  return { updatedItems, allReturned, actualReturnDate, status, ...calculateRentalTotals(handoverDate, plannedReturnDate, actualReturnDate, updatedItems) };
}
