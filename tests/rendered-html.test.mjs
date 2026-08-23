import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../app/mm-dashboard.tsx", import.meta.url);
const enginesApiUrl = new URL("../app/api/engines/route.ts", import.meta.url);
const recordsApiUrl = new URL("../app/api/engine-records/route.ts", import.meta.url);
const schemaUrl = new URL("../db/schema.ts", import.meta.url);
const hostingUrl = new URL("../.openai/hosting.json", import.meta.url);
const salesPageUrl = new URL("../app/sales-page.tsx", import.meta.url);
const salesApiUrl = new URL("../app/api/sales/route.ts", import.meta.url);
const tasksPageUrl = new URL("../app/task-pages.tsx", import.meta.url);
const tasksApiUrl = new URL("../app/api/tasks/route.ts", import.meta.url);
const activityApiUrl = new URL("../app/api/activity/route.ts", import.meta.url);
const raceFinancePageUrl = new URL("../app/race-finance.tsx", import.meta.url);
const raceFinanceApiUrl = new URL("../app/api/race-finance/route.ts", import.meta.url);
const racePagesUrl = new URL("../app/race-pages.tsx", import.meta.url);
const raceSalesPageUrl = new URL("../app/race-sales.tsx", import.meta.url);
const racesApiUrl = new URL("../app/api/races/route.ts", import.meta.url);
const runtimeSchemaUrl = new URL("../db/runtime-schema.ts", import.meta.url);
const competitionHistoryPageUrl = new URL("../app/competition-history-detail.tsx", import.meta.url);
const competitionHistoryApiUrl = new URL("../app/api/competition-history/route.ts", import.meta.url);
const racePlanningApiUrl = new URL("../app/api/race-planning/route.ts", import.meta.url);
const settingsPageUrl = new URL("../app/settings-page.tsx", import.meta.url);
const usersApiUrl = new URL("../app/api/users/route.ts", import.meta.url);
const appPageUrl = new URL("../app/page.tsx", import.meta.url);
const devSessionApiUrl = new URL("../app/api/dev-session/route.ts", import.meta.url);
const serverAuthUrl = new URL("../app/server-auth.ts", import.meta.url);
const clothingPageUrl = new URL("../app/clothing-page.tsx", import.meta.url);
const clothingApiUrl = new URL("../app/api/clothing/route.ts", import.meta.url);
const mechanicPageUrl = new URL("../app/mechanic-detail.tsx", import.meta.url);
const mechanicApiUrl = new URL("../app/api/mechanic-records/route.ts", import.meta.url);
const clothingImageApiUrl = new URL("../app/api/clothing-image/route.ts", import.meta.url);
const commercePageUrl = new URL("../app/commerce-pages.tsx", import.meta.url);
const customersApiUrl = new URL("../app/api/customers/route.ts", import.meta.url);
const serviceCatalogApiUrl = new URL("../app/api/service-catalog/route.ts", import.meta.url);
const inventoryApiUrl = new URL("../app/api/inventory/route.ts", import.meta.url);
const inventoryImageApiUrl = new URL("../app/api/inventory-image/route.ts", import.meta.url);
const logisticsPageUrl = new URL("../app/logistics-pages.tsx", import.meta.url);
const logisticsApiUrl = new URL("../app/api/logistics/route.ts", import.meta.url);
const logisticsAttachmentsApiUrl = new URL("../app/api/logistics-attachments/route.ts", import.meta.url);
const accommodationDistanceApiUrl = new URL("../app/api/accommodation-distance/route.ts", import.meta.url);
const circuitLocationUrl = new URL("../app/circuit-location.ts", import.meta.url);
const calendarPageUrl = new URL("../app/calendar-page.tsx", import.meta.url);

test("MM System contains the engine workflow requested by Macháč Motors", async () => {
  const dashboard = await readFile(dashboardUrl, "utf8");

  assert.match(dashboard, /Vstupní stav motoru/);
  assert.match(dashboard, /Opravit motohodiny/);
  assert.match(dashboard, /Opravit servisní záznam/);
  assert.match(dashboard, /53\.83/);
  assert.match(dashboard, /53\.95/);
  assert.match(dashboard, /role === "superadmin"/);
});

test("sales register supports CZK/EUR, durable line items and controlled equipment release", async () => {
  const [page, route, schema] = await Promise.all([
    readFile(salesPageUrl, "utf8"),
    readFile(salesApiUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
  ]);

  assert.match(page, /CZK — Kč/);
  assert.match(page, /EUR — €/);
  assert.match(page, /Karburátor/);
  assert.match(schema, /export const sales/);
  assert.match(schema, /export const saleItems/);
  assert.match(route, /sold_at =/);
  assert.match(route, /user\.role !== "superadmin"/);
  assert.match(route, /findFutureAssignment/);
});

test("sales connect customers, teams, fixed services and inventory with reversible stock changes", async () => {
  const [page, route, commerce, customersRoute, serviceRoute, inventoryRoute, schema, runtimeSchema, dashboard] = await Promise.all([
    readFile(salesPageUrl, "utf8"), readFile(salesApiUrl, "utf8"), readFile(commercePageUrl, "utf8"),
    readFile(customersApiUrl, "utf8"), readFile(serviceCatalogApiUrl, "utf8"), readFile(inventoryApiUrl, "utf8"),
    readFile(schemaUrl, "utf8"), readFile(runtimeSchemaUrl, "utf8"), readFile(dashboardUrl, "utf8"),
  ]);

  assert.match(page, /Existující zákazník/);
  assert.match(page, /Nový zákazník/);
  assert.match(page, /Díl ze skladu/);
  assert.match(page, /Předdefinovaný servis/);
  assert.match(page, /Ostatní \/ díly/);
  assert.match(page, /itemType: "other"/);
  assert.match(page, /Popis vybraného servisu/);
  assert.match(page, /descriptionEn/);
  assert.match(page, /Prodané motory/);
  assert.match(page, /Kompletní historie/);
  assert.match(page, /sales=\{activeSales\}/);
  assert.match(page, /Aktivní prodeje/);
  assert.match(page, /sale-payment-meta/);
  assert.match(route, /quantity = quantity -/);
  assert.match(route, /quantity = quantity \+/);
  assert.match(route, /customer_id/);
  assert.match(route, /team_id/);
  assert.match(route, /price_czk_cents AS priceCzkCents/);
  assert.match(route, /description_en_snapshot/);
  assert.match(route, /description_cs AS descriptionCs/);
  assert.match(commerce, /Všechny ceny jsou bez DPH|pevné ceny bez DPH/);
  assert.match(customersRoute, /INSERT INTO customers/);
  assert.match(serviceRoute, /INSERT INTO service_catalog/);
  assert.match(serviceRoute, /description_cs AS descriptionCs/);
  assert.match(serviceRoute, /description_en AS descriptionEn/);
  assert.match(inventoryRoute, /INSERT INTO inventory_parts/);
  assert.match(schema, /export const customers/);
  assert.match(schema, /export const serviceCatalog/);
  assert.match(schema, /descriptionEnSnapshot/);
  assert.match(schema, /export const inventoryParts/);
  assert.match(runtimeSchema, /CREATE TABLE IF NOT EXISTS customers/);
  assert.match(runtimeSchema, /CREATE TABLE IF NOT EXISTS service_catalog/);
  assert.match(runtimeSchema, /CREATE TABLE IF NOT EXISTS inventory_parts/);
  assert.match(dashboard, /customers: "Zákazníci"/);
  assert.match(dashboard, /<InventoryPage/);
  assert.match(dashboard, /<ServiceCatalogPage/);
});

test("inventory parts support photos, engine category checkboxes and visible product cards", async () => {
  const [commerce, inventoryRoute, imageRoute, salesPage, schema, runtimeSchema] = await Promise.all([
    readFile(commercePageUrl, "utf8"), readFile(inventoryApiUrl, "utf8"), readFile(inventoryImageApiUrl, "utf8"),
    readFile(salesPageUrl, "utf8"), readFile(schemaUrl, "utf8"), readFile(runtimeSchemaUrl, "utf8"),
  ]);

  assert.match(commerce, /Všechny typy motorů/);
  assert.match(commerce, /inventory-card-grid/);
  assert.match(commerce, /inventory-part-photo/);
  assert.match(commerce, /Fotografie dílu/);
  assert.match(commerce, /api\/inventory-image/);
  assert.match(inventoryRoute, /allowedCategories/);
  assert.match(inventoryRoute, /categories: parseCategories/);
  assert.match(inventoryRoute, /inventoryImageUrl/);
  assert.match(imageRoute, /inventory-images/);
  assert.match(imageRoute, /getAssetsBucket/);
  assert.match(imageRoute, /10 \* 1024 \* 1024/);
  assert.match(salesPage, /part\.categories\.join/);
  assert.match(schema, /categories: text\("categories"\)/);
  assert.match(schema, /imageKey: text\("image_key"\)/);
  assert.match(runtimeSchema, /CREATE TABLE IF NOT EXISTS inventory_parts/);
  assert.match(runtimeSchema, /image_updated_at INTEGER/);
});

test("engine records use D1 persistence and server-side superadmin authorization", async () => {
  const [route, schema, hosting] = await Promise.all([
    readFile(recordsApiUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
    readFile(hostingUrl, "utf8"),
  ]);

  assert.match(hosting, /"d1": "DB"/);
  assert.match(schema, /baselinePistonMinutes/);
  assert.match(schema, /engineUsageLogs/);
  assert.match(schema, /engineServiceEntries/);
  assert.match(route, /user\.role !== "superadmin"/);
  assert.match(route, /recalculateEngine/);
  assert.match(route, /DELETE FROM/);
});

test("MINI engines support extended configurations and optional ignition", async () => {
  const [dashboard, route, schema] = await Promise.all([
    readFile(dashboardUrl, "utf8"),
    readFile(enginesApiUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
  ]);

  for (const configuration of ["MINI 3", "MINI 4", "BABY 3", "BABY 4"]) {
    assert.match(dashboard, new RegExp(configuration));
    assert.match(route, new RegExp(configuration));
    assert.match(schema, new RegExp(configuration));
  }
  assert.match(dashboard, /<option value="">/);
  assert.match(route, /allowedIgnitions = new Set\(\["", "PVL", "SELETTRA"\]\)/);
});

test("engine codes are unique inside a logical category but reusable across categories", async () => {
  const [dashboard, route, schema, runtimeSchema] = await Promise.all([
    readFile(dashboardUrl, "utf8"),
    readFile(enginesApiUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
    readFile(runtimeSchemaUrl, "utf8"),
  ]);

  assert.match(schema, /engines_code_category_unique/);
  assert.match(schema, /\.on\(table\.code, table\.category\)/);
  assert.match(route, /function engineCategoryScope/);
  assert.match(route, /currentConfiguration\?\.startsWith\("BABY"\) \? "BABY" : "MINI"/);
  assert.match(route, /family === "OKN-J"\) return "OKN"/);
  assert.match(route, /Engine code already exists in this category/);
  assert.match(runtimeSchema, /CREATE UNIQUE INDEX IF NOT EXISTS engines_code_category_unique ON engines \(code, category\)/);
  assert.match(runtimeSchema, /LIKE 'BABY%'/);
  assert.match(dashboard, /Motor s tímto číslem už v této kategorii existuje/);
});

test("tasks, real activity and time-aware Czech greetings are connected to the dashboard", async () => {
  const [dashboard, page, route, activityRoute, schema] = await Promise.all([
    readFile(dashboardUrl, "utf8"),
    readFile(tasksPageUrl, "utf8"),
    readFile(tasksApiUrl, "utf8"),
    readFile(activityApiUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
  ]);

  for (const greeting of ["Dobré ráno", "Dobré dopoledne", "Příjemné poledne", "Dobré odpoledne", "Příjemný podvečer", "Dobrý večer", "Klidnou noc"]) {
    assert.match(dashboard, new RegExp(greeting));
  }
  assert.match(dashboard, /martin: "Martine"/);
  assert.match(dashboard, /<TaskPage/);
  assert.match(dashboard, /dashboardActivity/);
  assert.match(dashboard, /api\/activity/);
  assert.match(page, /Úkoly a připomínky/);
  assert.match(page, /Označit jako hotové/);
  assert.match(schema, /export const workItems/);
  assert.match(route, /INSERT INTO work_items/);
  assert.match(route, /user\.role !== "superadmin"/);
  assert.match(activityRoute, /ORDER BY l\.created_at DESC/);
  assert.match(activityRoute, /actorName/);
  assert.match(activityRoute, /target_user\.full_name/);
  assert.match(activityRoute, /entry\.driver_name_snapshot/);
  assert.match(activityRoute, /return cleanText\(row\.resolvedSubject\)/);
  assert.match(dashboard, /app_user: "uživatele"/);
});

test("race finance is role protected, stored durably and calculated on the server", async () => {
  const [page, route, racePages, schema, runtimeSchema] = await Promise.all([
    readFile(raceFinancePageUrl, "utf8"),
    readFile(raceFinanceApiUrl, "utf8"),
    readFile(racePagesUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
    readFile(runtimeSchemaUrl, "utf8"),
  ]);

  assert.match(route, /role === "superadmin" \|\| role === "boss"/);
  assert.match(route, /Math\.round\(basePriceCents \* \(10_000 - discountBasisPoints\) \/ 10_000\)/);
  assert.match(route, /INSERT INTO race_entry_finance/);
  assert.match(route, /FROM sales/);
  assert.match(route, /voided_at IS NULL/);
  assert.match(route, /SUM\(CASE WHEN is_paid = 1 THEN total_cents ELSE 0 END\)/);
  assert.match(route, /sale_number AS saleNumber/);
  assert.match(route, /JOIN sales s ON s\.id = i\.sale_id/);
  assert.match(route, /items: saleItemRows\.filter/);
  assert.match(route, /'race_finance'/);
  assert.match(schema, /export const raceEntryFinance/);
  assert.match(runtimeSchema, /CREATE TABLE IF NOT EXISTS race_entry_finance/);
  assert.match(racePages, /role === "superadmin" \|\| role === "boss"/);
  assert.match(racePages, /<RaceFinancePanel/);
  assert.match(page, /Všechny ceny jsou bez DPH/);
  assert.match(page, /Prodeje přidané k tomuto závodu jsou započítané do celku/);
  assert.match(page, /Celkem závod/);
  assert.match(page, /Vytisknout finance/);
  assert.match(page, /Prodej dílů a servis/);
  assert.match(page, /Kdo co koupil, kolik zaplatil/);
  assert.match(page, /Předáno/);
  assert.match(page, /raceSales\.map/);
  assert.match(page, /Hotově/);
  assert.match(page, /Převodem/);
  assert.match(page, /EUR/);
  assert.match(page, /CZK/);
});

test("race sales support multi-item orders and races are ordered from the nearest date", async () => {
  const [salesPage, salesRoute, racePages, racesRoute, runtimeSchema] = await Promise.all([
    readFile(raceSalesPageUrl, "utf8"),
    readFile(salesApiUrl, "utf8"),
    readFile(racePagesUrl, "utf8"),
    readFile(racesApiUrl, "utf8"),
    readFile(runtimeSchemaUrl, "utf8"),
  ]);

  assert.match(salesPage, /Prodej a servis na závodě/);
  assert.match(salesPage, /<SaleForm/);
  assert.match(salesRoute, /line_kind = 'service'/);
  assert.match(salesRoute, /is_delivered/);
  assert.match(racePages, /<RaceSalesPanel/);
  assert.match(runtimeSchema, /sales_race_idx/);
  assert.match(racesRoute, /CASE WHEN r\.end_date >= date\('now'\) THEN r\.start_date END ASC/);
  assert.match(racesRoute, /CASE WHEN r\.end_date < date\('now'\) THEN r\.start_date END DESC/);
});

test("driver and team cards preserve engine configuration and payment history", async () => {
  const [page, historyRoute, planningRoute, raceFinanceRoute, schema, runtimeSchema] = await Promise.all([
    readFile(competitionHistoryPageUrl, "utf8"),
    readFile(competitionHistoryApiUrl, "utf8"),
    readFile(racePlanningApiUrl, "utf8"),
    readFile(raceFinanceApiUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
    readFile(runtimeSchemaUrl, "utf8"),
  ]);

  assert.match(page, /Platby pilota/);
  assert.match(page, /Finance týmu/);
  assert.match(page, /teamFinanceBreakdown/);
  assert.match(page, /engineHistoryLabel/);
  assert.match(historyRoute, /LEFT JOIN race_entry_finance/);
  assert.match(historyRoute, /engine_1_configuration AS engine1Configuration/);
  assert.match(planningRoute, /engine_1_configuration/);
  assert.match(raceFinanceRoute, /CASE WHEN r\.country_code = 'CZE' THEN 'CZK' ELSE 'EUR' END/);
  assert.match(schema, /engine1Configuration/);
  assert.match(runtimeSchema, /engine_1_configuration/);
});

test("user access is managed by superadmins and prevents an accidental lockout", async () => {
  const [settingsPage, usersRoute, appPage, dashboard, schema, devSessionRoute, serverAuth] = await Promise.all([
    readFile(settingsPageUrl, "utf8"),
    readFile(usersApiUrl, "utf8"),
    readFile(appPageUrl, "utf8"),
    readFile(dashboardUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
    readFile(devSessionApiUrl, "utf8"),
    readFile(serverAuthUrl, "utf8"),
  ]);

  assert.match(dashboard, /<SettingsPage/);
  assert.match(settingsPage, /Přístupy a role/);
  assert.match(settingsPage, /Přidat uživatele/);
  assert.match(settingsPage, /Vlastní roli a přístup nelze odebrat/);
  assert.match(settingsPage, /MM SYSTEM hesla neukládá/);
  assert.match(dashboard, /signout-with-chatgpt/);
  assert.match(appPage, /Přihlásit se přes ChatGPT/);
  assert.match(appPage, /MM SYSTEM neukládá vaše heslo/);
  assert.match(usersRoute, /user\.role !== "superadmin"/);
  assert.match(usersRoute, /You cannot remove your own superadmin access/);
  assert.match(usersRoute, /At least one active superadmin is required/);
  assert.match(usersRoute, /INSERT INTO audit_logs/);
  assert.match(appPage, /Přístup není povolen/);
  assert.match(schema, /export const appUsers/);
  assert.match(dashboard, /Testovat jako/);
  assert.match(devSessionRoute, /process\.env\.NODE_ENV === "production"/);
  assert.match(devSessionRoute, /mm-dev-user-id/);
  assert.match(serverAuth, /mm-dev-user-id/);
});

test("clothing catalog stores configurable sizes, photos and appears on mechanic cards", async () => {
  const [dashboard, page, route, imageRoute, mechanicPage, mechanicRoute, schema, runtimeSchema] = await Promise.all([
    readFile(dashboardUrl, "utf8"),
    readFile(clothingPageUrl, "utf8"),
    readFile(clothingApiUrl, "utf8"),
    readFile(clothingImageApiUrl, "utf8"),
    readFile(mechanicPageUrl, "utf8"),
    readFile(mechanicApiUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
    readFile(runtimeSchemaUrl, "utf8"),
  ]);

  assert.match(dashboard, /clothing: "Oblečení"/);
  assert.match(dashboard, /<ClothingPage/);
  assert.match(page, /Přiřazení mechanikům/);
  assert.match(page, /Nastavení oblečení/);
  assert.match(page, /Přidat doporučenou sadu/);
  assert.match(page, /Fotografie oblečení/);
  assert.match(page, /Co má každý mechanik/);
  assert.match(page, /Předáno/);
  assert.match(page, /formatAssignmentDate/);
  assert.match(page, /<ClothingLightbox/);
  assert.match(route, /ON CONFLICT\(mechanic_id, clothing_item_id\) DO UPDATE/);
  assert.match(route, /user\.role === "mechanic"/);
  assert.match(route, /removedInUse/);
  assert.match(schema, /export const clothingItems/);
  assert.match(schema, /export const mechanicClothingAssignments/);
  assert.match(schema, /assignedAt: integer\("assigned_at"/);
  assert.match(schema, /imageKey: text\("image_key"\)/);
  assert.match(runtimeSchema, /CREATE TABLE IF NOT EXISTS mechanic_clothing_assignments/);
  assert.match(imageRoute, /clothing-images\/\$\{itemId\}/);
  assert.match(imageRoute, /getAssetsBucket/);
  assert.match(imageRoute, /image\/webp/);
  assert.match(mechanicRoute, /clothing: clothing\.results/);
  assert.match(mechanicRoute, /assigned_at AS assignedAt/);
  assert.match(mechanicPage, /Oblečení a velikosti/);
});

test("MM Travel shares race records, supports round trips, accommodation routing and leg-specific attachment previews", async () => {
  const [page, route, attachmentRoute, distanceRoute, circuitLocation, racePages, mechanicPage, mechanicRoute, calendarPage, dashboard, schema, runtimeSchema, hosting] = await Promise.all([
    readFile(logisticsPageUrl, "utf8"),
    readFile(logisticsApiUrl, "utf8"),
    readFile(logisticsAttachmentsApiUrl, "utf8"),
    readFile(accommodationDistanceApiUrl, "utf8"),
    readFile(circuitLocationUrl, "utf8"),
    readFile(racePagesUrl, "utf8"),
    readFile(mechanicPageUrl, "utf8"),
    readFile(mechanicApiUrl, "utf8"),
    readFile(calendarPageUrl, "utf8"),
    readFile(dashboardUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
    readFile(runtimeSchemaUrl, "utf8"),
    readFile(hostingUrl, "utf8"),
  ]);

  assert.match(page, /Kdo letí/);
  assert.match(page, /multiple accept="application\/pdf,image\/png,image\/jpeg,image\/webp"/);
  assert.match(page, /AttachmentGallery/);
  assert.match(page, /race-travel-entry/);
  assert.match(page, /Kde se auto vrací/);
  assert.match(page, /passengerNames/);
  assert.match(page, /Závod a termín/);
  assert.match(page, /raceFormLabel/);
  assert.match(page, /compactFormDate/);
  assert.match(page, /Tam i zpět/);
  assert.match(page, /returnDepartureAirport/);
  assert.match(page, /returnReservationCode/);
  assert.match(page, /Rezervační kód – cesta tam/);
  assert.match(page, /Rezervační kód – cesta zpět/);
  assert.match(page, /Přílohy – cesta tam/);
  assert.match(page, /Přílohy – cesta zpět/);
  assert.match(page, /AttachmentSections/);
  assert.match(page, /Web ubytování/);
  assert.match(page, /Odkaz na Booking/);
  assert.match(page, /Vzdálenost na trať/);
  assert.match(page, /api\/accommodation-distance/);
  assert.match(page, /AccommodationLinks/);
  assert.match(page, /race-accommodation-trip/);
  assert.match(page, /NA TRAŤ/);
  assert.match(route, /passengers_json/);
  assert.match(route, /travel_attachments/);
  assert.match(route, /trip_kind/);
  assert.match(route, /return_departure_airport/);
  assert.match(route, /return_reservation_code/);
  assert.match(route, /booking_url AS bookingUrl/);
  assert.match(route, /track_distance_km AS trackDistanceKm/);
  assert.match(route, /r\.track AS raceTrack/);
  assert.match(route, /mechanic:/);
  assert.match(route, /user:/);
  assert.match(attachmentRoute, /getAssetsBucket/);
  assert.match(attachmentRoute, /15 \* 1024 \* 1024/);
  assert.match(attachmentRoute, /application\/pdf/);
  assert.match(attachmentRoute, /form\.get\("leg"\)/);
  assert.match(attachmentRoute, /travel_attachments.*leg/);
  assert.match(distanceRoute, /resolveTravelBetween/);
  assert.match(distanceRoute, /LEFT JOIN circuits/);
  assert.match(distanceRoute, /Route to circuit could not be calculated/);
  assert.match(circuitLocation, /export async function resolveTravelBetween/);
  assert.match(schema, /export const travelAttachments/);
  assert.match(schema, /passengersJson: text\("passengers_json"\)/);
  assert.match(schema, /tripKind: text\("trip_kind"/);
  assert.match(schema, /returnReservationCode: text\("return_reservation_code"/);
  assert.match(schema, /leg: text\("leg"/);
  assert.match(schema, /bookingUrl: text\("booking_url"/);
  assert.match(schema, /trackDistanceKm: real\("track_distance_km"/);
  assert.match(runtimeSchema, /CREATE TABLE IF NOT EXISTS travel_attachments/);
  assert.match(runtimeSchema, /travel_attachments_entity_idx/);
  assert.match(runtimeSchema, /return_departure_airport/);
  assert.match(runtimeSchema, /return_reservation_code/);
  assert.match(runtimeSchema, /track_distance_km REAL/);
  assert.match(runtimeSchema, /ALTER TABLE race_accommodations ADD COLUMN booking_url/);
  assert.match(runtimeSchema, /UPDATE race_flights SET trip_kind = direction/);
  assert.match(hosting, /"r2": "ASSETS"/);
  assert.match(mechanicRoute, /mechanicPassengerId/);
  assert.match(mechanicRoute, /travel: \{/);
  assert.match(mechanicRoute, /FROM race_accommodations/);
  assert.match(mechanicRoute, /FROM race_car_rentals/);
  assert.match(mechanicRoute, /returnDepartureAirport/);
  assert.match(mechanicRoute, /track_distance_km AS trackDistanceKm/);
  assert.match(mechanicPage, /MechanicRaceTravel/);
  assert.match(mechanicPage, /Letí:/);
  assert.match(mechanicPage, /item\.direction === "roundtrip"/);
  assert.match(calendarPage, /item\.direction === "roundtrip"/);
  assert.match(calendarPage, /CalendarRaceEvent/);
  assert.match(calendarPage, /Přiřazení k závodu/);
  assert.match(calendarPage, /title=\{hoverText\}/);
  assert.match(calendarPage, /onOpenRace\(race\.id\)/);
  assert.match(dashboard, /<CalendarPage locale=\{locale\} onOpenRace=/);
  assert.match(racePages, /MM RACE LOGISTICS/);
  assert.match(racePages, /Posádka a doprava/);
  assert.ok(racePages.indexOf('className="panel race-logistics-panel"') < racePages.indexOf("<RaceCircuitPanel"));
  assert.ok(racePages.indexOf("<RaceLogisticsPanel") < racePages.indexOf("<RaceEquipmentOverview"));
});
