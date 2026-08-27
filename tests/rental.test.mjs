import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyRentalReturns,
  calculateRentalTotals,
  canManageRentals,
  effectiveRentalStatus,
  periodsOverlap,
  rentalDays,
} from "../app/rental-domain.ts";

const routeUrl = new URL("../app/api/equipment-rentals/route.ts", import.meta.url);
const schemaUrl = new URL("../db/schema.ts", import.meta.url);
const runtimeSchemaUrl = new URL("../db/runtime-schema.ts", import.meta.url);
const dashboardUrl = new URL("../app/mm-dashboard.tsx", import.meta.url);
const pageUrl = new URL("../app/rental-page.tsx", import.meta.url);
const historyUrl = new URL("../app/rental-history.tsx", import.meta.url);

test("rental creation has durable header/items, generated number, totals and audit", async () => {
  const [route, schema, runtime, dashboard, page] = await Promise.all([
    readFile(routeUrl, "utf8"), readFile(schemaUrl, "utf8"), readFile(runtimeSchemaUrl, "utf8"), readFile(dashboardUrl, "utf8"), readFile(pageUrl, "utf8"),
  ]);
  assert.match(schema, /export const equipmentRentals/);
  assert.match(schema, /export const equipmentRentalItems/);
  assert.match(runtime, /CREATE TABLE IF NOT EXISTS equipment_rentals/);
  assert.match(route, /INSERT INTO equipment_rentals/);
  assert.match(route, /INSERT INTO equipment_rental_items/);
  assert.match(route, /REN-\$\{year\}/);
  assert.match(route, /'equipment_rental'/);
  assert.match(dashboard, /equipmentRentals: "Pronájem"/);
  assert.match(dashboard, /equipmentRentals: "Rental"/);
  assert.match(page, /Nový pronájem/);
});

test("planned and actual day counts and total prices are calculated inclusively", () => {
  assert.equal(rentalDays("2026-08-26", "2026-08-26"), 1);
  assert.equal(rentalDays("2026-08-26", "2026-08-28"), 3);
  assert.deepEqual(calculateRentalTotals("2026-08-26", "2026-08-28", null, [
    { dailyPriceCents: 10_000, quantity: 1 },
    { dailyPriceCents: 2_500, quantity: 2 },
  ]), { plannedDays: 3, actualDays: null, totalCents: 45_000 });
  assert.deepEqual(calculateRentalTotals("2026-08-26", "2026-08-28", "2026-08-29", [
    { dailyPriceCents: 10_000, quantity: 1 },
  ]), { plannedDays: 3, actualDays: 4, totalCents: 40_000 });
  assert.deepEqual(calculateRentalTotals("2026-08-26", "2026-09-02", null, [
    { dailyPriceCents: 10_000, quantity: 1, billableDays: 2 },
    { dailyPriceCents: 2_500, quantity: 1, billableDays: 1 },
  ]), { plannedDays: 8, actualDays: null, totalCents: 22_500 });
});

test("returning individual items completes the rental only after the final return", () => {
  const items = [
    { id: "engine-1", dailyPriceCents: 10_000, quantity: 1, returnedDate: null },
    { id: "carb-1", dailyPriceCents: 2_000, quantity: 1, returnedDate: null },
  ];
  const partial = applyRentalReturns("2026-08-26", "2026-08-28", "active", items, ["engine-1"], "2026-08-27");
  assert.equal(partial.allReturned, false);
  assert.equal(partial.status, "active");
  assert.equal(partial.actualReturnDate, null);
  assert.equal(partial.updatedItems[0].returnedDate, "2026-08-27");
  const complete = applyRentalReturns("2026-08-26", "2026-08-28", partial.status, partial.updatedItems, ["carb-1"], "2026-08-29");
  assert.equal(complete.allReturned, true);
  assert.equal(complete.status, "returned");
  assert.equal(complete.actualReturnDate, "2026-08-29");
  assert.equal(complete.totalCents, 28_000);
});

test("overlapping equipment rentals are detected and overdue status is automatic", () => {
  assert.equal(periodsOverlap("2026-09-01", "2026-09-05", "2026-09-05", "2026-09-08"), true);
  assert.equal(periodsOverlap("2026-09-01", "2026-09-04", "2026-09-05", "2026-09-08"), false);
  assert.equal(effectiveRentalStatus("active", "2026-09-04", null, "2026-09-05"), "overdue");
  assert.equal(effectiveRentalStatus("returned", "2026-09-04", "2026-09-04", "2026-09-05"), "returned");
});

test("rental permissions allow boss and superadmin writes while mechanic stays read-only", async () => {
  assert.equal(canManageRentals("superadmin"), true);
  assert.equal(canManageRentals("boss"), true);
  assert.equal(canManageRentals("mechanic"), false);
  const route = await readFile(routeUrl, "utf8");
  assert.match(route, /if \(!canManageRentals\(user\.role\)\).*Forbidden/);
});

test("engine card exposes current rental and complete price/day history", async () => {
  const [dashboard, history, route] = await Promise.all([readFile(dashboardUrl, "utf8"), readFile(historyUrl, "utf8"), readFile(routeUrl, "utf8")]);
  assert.match(dashboard, /itemType="engine" resourceId=\{engine\.id\}/);
  assert.match(history, /Aktuálně půjčeno/);
  assert.match(history, /Plánované vrácení/);
  assert.match(history, /item\?\.billableDays/);
  assert.match(history, /item\.dailyPriceCents \* item\.quantity \* days/);
  assert.match(route, /filter_item\.item_type = \?/);
  assert.match(route, /filter_item\.resource_id = \?/);
});

test("race planning blocks rented equipment in entries and extras until return", async () => {
  const [planning, racePage, rentalRoute] = await Promise.all([
    readFile(new URL("../app/api/race-planning/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/race-pages.tsx", import.meta.url), "utf8"),
    readFile(routeUrl, "utf8"),
  ]);
  assert.match(planning, /item\.returned_date IS NULL/);
  assert.match(planning, /has not been returned/);
  assert.match(racePage, /assignment\.isRental/);
  assert.match(rentalRoute, /findRaceConflict/);
  assert.match(rentalRoute, /is assigned to race/);
});

test("rental stores optional driver, manual billable days and both shipping legs", async () => {
  const [route, schema, page] = await Promise.all([readFile(routeUrl, "utf8"), readFile(schemaUrl, "utf8"), readFile(pageUrl, "utf8")]);
  assert.match(schema, /billableDays/);
  assert.match(schema, /driverNameSnapshot/);
  assert.match(schema, /equipmentRentalShipments/);
  assert.match(route, /equipment_rental_shipments/);
  assert.match(page, /Účtované dny/);
  assert.match(page, /Cesta tam/);
  assert.match(page, /Cesta zpět/);
});

test("only superadmin can delete a rental and deletion remains in audit", async () => {
  const [route, page] = await Promise.all([readFile(routeUrl, "utf8"), readFile(pageUrl, "utf8")]);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /user\.role !== "superadmin"/);
  assert.match(route, /DELETE FROM equipment_rentals/);
  assert.match(route, /'delete', 'equipment_rental'/);
  assert.match(page, /Smazat pronájem/);
});
