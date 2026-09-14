import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: text("role", { enum: ["superadmin", "boss", "mechanic"] }).notNull(),
  locale: text("locale", { enum: ["cs", "en"] }).notNull().default("cs"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const engines = sqliteTable("engines", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  serialNumber: text("serial_number").notNull().default(""),
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  category: text("category").notNull().default(""),
  family: text("family", { enum: ["MINI", "OKJ", "OKN", "OKN-J", "OK", "KZ"] }).notNull().default("OKN"),
  ignition: text("ignition", { enum: ["", "PVL", "SELETTRA"] }).notNull().default("PVL"),
  kzGeneration: text("kz_generation", { enum: ["R2", "R3"] }),
  currentConfiguration: text("current_configuration", { enum: ["MINI", "MINI 3", "MINI 4", "BABY", "BABY 3", "BABY 4"] }),
  upgradeCode: text("upgrade_code").notNull().default(""),
  labelColor: text("label_color").notNull().default(""),
  purchaseDate: text("purchase_date"),
  pistonSpec: text("piston_spec").notNull().default(""),
  cylinderCode: text("cylinder_code").notNull().default(""),
  cylinderUpgrade: text("cylinder_upgrade").notNull().default(""),
  liner: text("liner").notNull().default(""),
  degree: text("degree").notNull().default(""),
  timing: text("timing").notNull().default(""),
  carter: text("carter").notNull().default(""),
  reeds: text("reeds").notNull().default(""),
  spacer: text("spacer").notNull().default(""),
  squish: text("squish").notNull().default(""),
  status: text("status", {
    enum: ["ready", "service_soon", "service", "rebuild", "storage", "retired"],
  }).notNull().default("ready"),
  totalMinutes: integer("total_minutes").notNull().default(0),
  pistonMinutes: integer("piston_minutes").notNull().default(0),
  rodMinutes: integer("rod_minutes").notNull().default(0),
  lastOppamaMinutes: integer("last_oppama_minutes").notNull().default(0),
  currentPistonSize: text("current_piston_size").notNull().default(""),
  baselineTotalMinutes: integer("baseline_total_minutes").notNull().default(0),
  baselinePistonMinutes: integer("baseline_piston_minutes").notNull().default(0),
  baselineRodMinutes: integer("baseline_rod_minutes").notNull().default(0),
  baselineLastOppamaMinutes: integer("baseline_last_oppama_minutes").notNull().default(0),
  baselinePistonSize: text("baseline_piston_size").notNull().default(""),
  serviceIntervalMinutes: integer("service_interval_minutes").notNull().default(360),
  notes: text("notes").notNull().default(""),
  soldAt: integer("sold_at", { mode: "timestamp_ms" }),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("engines_code_category_unique").on(table.code, table.category),
]);

export const engineUsageLogs = sqliteTable("engine_usage_logs", {
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull(),
  entryDate: text("entry_date").notNull(),
  oppamaMinutes: integer("oppama_minutes").notNull(),
  raceName: text("race_name").notNull().default(""),
  driverName: text("driver_name").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const engineServiceEntries = sqliteTable("engine_service_entries", {
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull(),
  serviceDate: text("service_date").notNull(),
  serviceType: text("service_type").notNull(),
  replacedParts: text("replaced_parts").notNull().default("[]"),
  replacedPartsSnapshot: text("replaced_parts_snapshot").notNull().default("[]"),
  pistonSize: text("piston_size").notNull().default(""),
  notes: text("notes").notNull().default(""),
  pistonMinutesBefore: integer("piston_minutes_before").notNull().default(0),
  rodMinutesBefore: integer("rod_minutes_before").notNull().default(0),
  mechanicId: text("mechanic_id"),
  mechanicNameSnapshot: text("mechanic_name_snapshot").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Per-family replaceable-parts catalog — currently only populated for MINI (see
 * DB_BACKED_SERVICE_PART_FAMILIES in app/engine-family-rules.ts). Other families still use the
 * hardcoded `serviceParts`/`allowedParts` lists until they're migrated here one by one.
 */
export const engineServicePartCatalog = sqliteTable("engine_service_part_catalog", {
  id: text("id").primaryKey(),
  family: text("family").notNull(),
  partKey: text("part_key").notNull(),
  labelCs: text("label_cs").notNull(),
  labelEn: text("label_en").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("engine_service_part_catalog_family_key_idx").on(table.family, table.partKey),
]);

/** Per-family column count for the technical-data grid — one settings row per family, created on demand. */
export const engineTechnicalLayout = sqliteTable("engine_technical_layout", {
  family: text("family").primaryKey(),
  columnCount: integer("column_count").notNull().default(3),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const engineTechnicalSections = sqliteTable("engine_technical_sections", {
  id: text("id").primaryKey(),
  family: text("family").notNull(),
  labelCs: text("label_cs").notNull(),
  labelEn: text("label_en").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const engineTechnicalFields = sqliteTable("engine_technical_fields", {
  id: text("id").primaryKey(),
  sectionId: text("section_id").notNull(),
  labelCs: text("label_cs").notNull(),
  labelEn: text("label_en").notNull(),
  fieldType: text("field_type", { enum: ["select", "text"] }).notNull(),
  showOnOverview: integer("show_on_overview", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  // Set only for fields created by the legacy-column migration draft — links the field back to its
  // originating `engines` column (e.g. "pistonSpec") so PATCH /api/engines can find where to write.
  // Null for any field created by hand.
  legacyKey: text("legacy_key"),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const engineTechnicalFieldOptions = sqliteTable("engine_technical_field_options", {
  id: text("id").primaryKey(),
  fieldId: text("field_id").notNull(),
  valueCs: text("value_cs").notNull(),
  valueEn: text("value_en").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const engineTechnicalValues = sqliteTable("engine_technical_values", {
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull(),
  fieldId: text("field_id").notNull(),
  value: text("value").notNull().default(""),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("engine_technical_values_unique_idx").on(table.engineId, table.fieldId),
]);

export const engineAutoServiceLog = sqliteTable("engine_auto_service_log", {
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull(),
  raceId: text("race_id").notNull(),
  raceNameSnapshot: text("race_name_snapshot").notNull().default(""),
  appliedAt: integer("applied_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("engine_auto_service_log_unique_idx").on(table.engineId, table.raceId),
]);

/** Polymorphic recipient, same shape as sale_items.item_type/resource_id and race_extras.resource_type/resource_id. */
export const engineLoans = sqliteTable("engine_loans", {
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull(),
  recipientType: text("recipient_type", { enum: ["customer", "team", "driver"] }).notNull(),
  recipientId: text("recipient_id").notNull(),
  recipientNameSnapshot: text("recipient_name_snapshot").notNull(),
  startDate: text("start_date").notNull(),
  expectedReturnDate: text("expected_return_date").notNull(),
  actualReturnDate: text("actual_return_date"),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  countryCode: text("country_code").notNull().default(""),
  notes: text("notes").notNull().default(""),
  logoKey: text("logo_key"),
  logoContentType: text("logo_content_type"),
  logoUpdatedAt: integer("logo_updated_at", { mode: "timestamp_ms" }),
  customerId: text("customer_id"),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const drivers = sqliteTable("drivers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  teamId: text("team_id"),
  defaultCategory: text("default_category").notNull().default(""),
  raceNumber: text("race_number").notNull().default(""),
  nationality: text("nationality").notNull().default(""),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes").notNull().default(""),
  photoKey: text("photo_key"),
  photoContentType: text("photo_content_type"),
  photoUpdatedAt: integer("photo_updated_at", { mode: "timestamp_ms" }),
  billingMode: text("billing_mode").notNull().default("self"),
  customerId: text("customer_id"),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const mechanics = sqliteTable("mechanics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const clothingItems = sqliteTable("clothing_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sizes: text("sizes").notNull().default("[]"),
  defaultQuantity: integer("default_quantity").notNull().default(1),
  notes: text("notes").notNull().default(""),
  imageKey: text("image_key"),
  imageContentType: text("image_content_type"),
  imageUpdatedAt: integer("image_updated_at", { mode: "timestamp_ms" }),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const mechanicClothingAssignments = sqliteTable("mechanic_clothing_assignments", {
  id: text("id").primaryKey(),
  mechanicId: text("mechanic_id").notNull(),
  clothingItemId: text("clothing_item_id").notNull(),
  size: text("size").notNull(),
  quantity: integer("quantity").notNull().default(1),
  assignedAt: integer("assigned_at", { mode: "timestamp_ms" }).notNull(),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("mechanic_clothing_unique_idx").on(table.mechanicId, table.clothingItemId),
]);

export const vehicles = sqliteTable("vehicles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  licensePlate: text("license_plate").notNull().default(""),
  notes: text("notes").notNull().default(""),
  photoKey: text("photo_key"),
  photoContentType: text("photo_content_type"),
  photoUpdatedAt: integer("photo_updated_at", { mode: "timestamp_ms" }),
  currentKm: integer("current_km"),
  serviceIntervalKm: integer("service_interval_km"),
  lastServiceKm: integer("last_service_km"),
  lastServiceNote: text("last_service_note").notNull().default(""),
  lastServiceDate: text("last_service_date").notNull().default(""),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const vehicleServiceEntries = sqliteTable("vehicle_service_entries", {
  id: text("id").primaryKey(),
  vehicleId: text("vehicle_id").notNull(),
  serviceDate: text("service_date").notNull(),
  km: integer("km"),
  workDone: text("work_done").notNull().default(""),
  mechanicId: text("mechanic_id"),
  mechanicNameSnapshot: text("mechanic_name_snapshot").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const carburetors = sqliteTable("carburetors", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  carburetorTypeId: text("carburetor_type_id"),
  category: text("category").notNull().default(""),
  family: text("family").notNull(),
  brand: text("brand").notNull().default(""),
  model: text("model").notNull().default(""),
  status: text("status").notNull().default("ready"),
  notes: text("notes").notNull().default(""),
  soldAt: integer("sold_at", { mode: "timestamp_ms" }),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const carburetorTypes = sqliteTable("carburetor_types", {
  id: text("id").primaryKey(),
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  categories: text("categories").notNull().default("[]"),
  notes: text("notes").notNull().default(""),
  photoKey: text("photo_key"),
  photoContentType: text("photo_content_type"),
  photoUpdatedAt: integer("photo_updated_at", { mode: "timestamp_ms" }),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const carburetorServiceEntries = sqliteTable("carburetor_service_entries", {
  id: text("id").primaryKey(),
  carburetorId: text("carburetor_id").notNull(),
  serviceDate: text("service_date").notNull(),
  serviceType: text("service_type", { enum: ["check", "routine", "full", "repair"] }).notNull(),
  mechanicId: text("mechanic_id"),
  mechanicNameSnapshot: text("mechanic_name_snapshot").notNull().default(""),
  workDone: text("work_done").notNull().default(""),
  replacedParts: text("replaced_parts").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const raceTemplates = sqliteTable("race_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes").notNull().default(""),
  seriesOptions: text("series_options").notNull().default("[]"),
  calendarColor: text("calendar_color").notNull().default("sky"),
  logoKey: text("logo_key"),
  logoContentType: text("logo_content_type"),
  logoUpdatedAt: integer("logo_updated_at", { mode: "timestamp_ms" }),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const circuits = sqliteTable("circuits", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  countryCode: text("country_code").notNull(),
  address: text("address").notNull().default(""),
  websiteUrl: text("website_url").notNull().default(""),
  mapsUrl: text("maps_url").notNull().default(""),
  latitude: real("latitude"),
  longitude: real("longitude"),
  distanceKm: real("distance_km"),
  driveMinutes: integer("drive_minutes"),
  imageKey: text("image_key"),
  imageContentType: text("image_content_type"),
  imageUpdatedAt: integer("image_updated_at", { mode: "timestamp_ms" }),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const races = sqliteTable("races", {
  id: text("id").primaryKey(),
  raceTemplateId: text("race_template_id"),
  circuitId: text("circuit_id"),
  name: text("name").notNull(),
  series: text("series").notNull().default(""),
  seriesRound: integer("series_round"),
  raceType: text("race_type").notNull().default(""),
  track: text("track").notNull(),
  address: text("address").notNull().default(""),
  countryCode: text("country_code").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  departureDate: text("departure_date").notNull().default(""),
  returnDate: text("return_date").notNull().default(""),
  organizer: text("organizer").notNull().default(""),
  notes: text("notes").notNull().default(""),
  status: text("status", { enum: ["planned", "active", "completed", "archived"] }).notNull().default("planned"),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const raceCategories = sqliteTable("race_categories", {
  id: text("id").primaryKey(),
  raceId: text("race_id").notNull(),
  category: text("category").notNull(),
  sortOrder: integer("sort_order").notNull(),
  notes: text("notes").notNull().default(""),
});

export const raceEntries = sqliteTable("race_entries", {
  id: text("id").primaryKey(),
  raceId: text("race_id").notNull(),
  category: text("category").notNull(),
  driverId: text("driver_id").notNull(),
  driverNameSnapshot: text("driver_name_snapshot").notNull(),
  teamId: text("team_id"),
  teamNameSnapshot: text("team_name_snapshot").notNull().default(""),
  engine1Id: text("engine_1_id"),
  engine1Code: text("engine_1_code").notNull().default(""),
  engine1Configuration: text("engine_1_configuration").notNull().default(""),
  engine2Id: text("engine_2_id"),
  engine2Code: text("engine_2_code").notNull().default(""),
  engine2Configuration: text("engine_2_configuration").notNull().default(""),
  engine3Id: text("engine_3_id"),
  engine3Code: text("engine_3_code").notNull().default(""),
  engine3Configuration: text("engine_3_configuration").notNull().default(""),
  carburetor1Id: text("carburetor_1_id"),
  carburetor1Code: text("carburetor_1_code").notNull().default(""),
  carburetor2Id: text("carburetor_2_id"),
  carburetor2Code: text("carburetor_2_code").notNull().default(""),
  carburetor3Id: text("carburetor_3_id"),
  carburetor3Code: text("carburetor_3_code").notNull().default(""),
  isConfirmed: integer("is_confirmed", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const raceEntryFinance = sqliteTable("race_entry_finance", {
  raceEntryId: text("race_entry_id").primaryKey(),
  raceId: text("race_id").notNull(),
  basePriceCents: integer("base_price_cents").notNull().default(0),
  currency: text("currency", { enum: ["CZK", "EUR"] }).notNull().default("EUR"),
  discountBasisPoints: integer("discount_basis_points").notNull().default(0),
  finalPriceCents: integer("final_price_cents").notNull().default(0),
  paymentMethod: text("payment_method", { enum: ["", "cash", "card", "bank_transfer"] }).notNull().default(""),
  isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(false),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const raceMechanics = sqliteTable("race_mechanics", {
  id: text("id").primaryKey(),
  raceId: text("race_id").notNull(),
  mechanicId: text("mechanic_id").notNull(),
  mechanicNameSnapshot: text("mechanic_name_snapshot").notNull(),
  vehicleId: text("vehicle_id"),
});

export const raceVehicles = sqliteTable("race_vehicles", {
  id: text("id").primaryKey(),
  raceId: text("race_id").notNull(),
  vehicleId: text("vehicle_id").notNull(),
  vehicleNameSnapshot: text("vehicle_name_snapshot").notNull(),
  licensePlateSnapshot: text("license_plate_snapshot").notNull().default(""),
});

export const raceExtras = sqliteTable("race_extras", {
  id: text("id").primaryKey(),
  raceId: text("race_id").notNull(),
  category: text("category").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  resourceCodeSnapshot: text("resource_code_snapshot").notNull(),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const raceChecklists = sqliteTable("race_checklists", {
  id: text("id").primaryKey(),
  raceId: text("race_id").notNull(),
  checklistId: text("checklist_id"),
  vehicleId: text("vehicle_id"),
  vehicleNameSnapshot: text("vehicle_name_snapshot").notNull().default(""),
  name: text("name").notNull(),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const raceChecklistItems = sqliteTable("race_checklist_items", {
  id: text("id").primaryKey(),
  raceChecklistId: text("race_checklist_id").notNull(),
  section: text("section").notNull().default(""),
  partNumber: text("part_number").notNull().default(""),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  isChecked: integer("is_checked", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const raceDeliveries = sqliteTable("race_deliveries", {
  id: text("id").primaryKey(),
  raceId: text("race_id").notNull(),
  customerName: text("customer_name").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  currency: text("currency", { enum: ["CZK", "EUR"] }).notNull().default("CZK"),
  amountCents: integer("amount_cents").notNull().default(0),
  paymentMethod: text("payment_method", { enum: ["cash", "card", "bank_transfer", "invoice", "other"] }).notNull().default("cash"),
  isDelivered: integer("is_delivered", { mode: "boolean" }).notNull().default(false),
  isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(false),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const raceTeamVisits = sqliteTable("race_team_visits", {
  id: text("id").primaryKey(),
  raceId: text("race_id").notNull(),
  teamId: text("team_id"),
  teamName: text("team_name").notNull(),
  driverId: text("driver_id"),
  driverName: text("driver_name").notNull().default(""),
  itemType: text("item_type", { enum: ["part", "service", "stock", "oil", "other"] }).notNull().default("part"),
  resourceId: text("resource_id"),
  description: text("description").notNull().default(""),
  quantity: integer("quantity").notNull().default(1),
  visitDate: text("visit_date").notNull().default(""),
  mechanicId: text("mechanic_id"),
  mechanicName: text("mechanic_name").notNull().default(""),
  currency: text("currency", { enum: ["CZK", "EUR"] }).notNull().default("CZK"),
  amountCents: integer("amount_cents"),
  isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(false),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const raceFollowupNotes = sqliteTable("race_followup_notes", {
  raceId: text("race_id").primaryKey(),
  nextRace: text("next_race").notNull().default(""),
  consumed: text("consumed").notNull().default(""),
  missing: text("missing").notNull().default(""),
  otherNotes: text("other_notes").notNull().default(""),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const raceAccommodations = sqliteTable("race_accommodations", {
  id: text("id").primaryKey(),
  raceId: text("race_id").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  checkInDate: text("check_in_date").notNull(),
  checkOutDate: text("check_out_date").notNull(),
  reservationCode: text("reservation_code").notNull().default(""),
  websiteUrl: text("website_url").notNull().default(""),
  bookingUrl: text("booking_url").notNull().default(""),
  trackDistanceKm: real("track_distance_km"),
  trackDriveMinutes: integer("track_drive_minutes"),
  roomCount: integer("room_count").notNull().default(0),
  guestCount: integer("guest_count").notNull().default(0),
  currency: text("currency", { enum: ["CZK", "EUR"] }).notNull().default("EUR"),
  totalCents: integer("total_cents").notNull().default(0),
  paymentStatus: text("payment_status", { enum: ["unpaid", "partial", "paid"] }).notNull().default("unpaid"),
  status: text("status", { enum: ["planned", "booked", "cancelled"] }).notNull().default("planned"),
  notes: text("notes").notNull().default(""),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const raceFlights = sqliteTable("race_flights", {
  id: text("id").primaryKey(),
  raceId: text("race_id").notNull(),
  direction: text("direction", { enum: ["outbound", "return", "other"] }).notNull().default("outbound"),
  tripKind: text("trip_kind", { enum: ["outbound", "return", "roundtrip", "other"] }).notNull().default("outbound"),
  departureAirport: text("departure_airport").notNull(),
  arrivalAirport: text("arrival_airport").notNull(),
  departureAt: text("departure_at").notNull(),
  arrivalAt: text("arrival_at").notNull(),
  airline: text("airline").notNull().default(""),
  flightNumber: text("flight_number").notNull().default(""),
  returnDepartureAirport: text("return_departure_airport").notNull().default(""),
  returnArrivalAirport: text("return_arrival_airport").notNull().default(""),
  returnDepartureAt: text("return_departure_at").notNull().default(""),
  returnArrivalAt: text("return_arrival_at").notNull().default(""),
  returnAirline: text("return_airline").notNull().default(""),
  returnFlightNumber: text("return_flight_number").notNull().default(""),
  reservationCode: text("reservation_code").notNull().default(""),
  returnReservationCode: text("return_reservation_code").notNull().default(""),
  passengersNote: text("passengers_note").notNull().default(""),
  passengersJson: text("passengers_json").notNull().default("[]"),
  baggage: text("baggage").notNull().default(""),
  currency: text("currency", { enum: ["CZK", "EUR"] }).notNull().default("EUR"),
  totalCents: integer("total_cents").notNull().default(0),
  status: text("status", { enum: ["planned", "booked", "cancelled"] }).notNull().default("planned"),
  notes: text("notes").notNull().default(""),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const raceCarRentals = sqliteTable("race_car_rentals", {
  id: text("id").primaryKey(),
  raceId: text("race_id").notNull(),
  company: text("company").notNull(),
  vehicleType: text("vehicle_type").notNull().default(""),
  pickupPlace: text("pickup_place").notNull(),
  returnPlace: text("return_place").notNull(),
  pickupAt: text("pickup_at").notNull(),
  returnAt: text("return_at").notNull(),
  reservationCode: text("reservation_code").notNull().default(""),
  licensePlate: text("license_plate").notNull().default(""),
  driverName: text("driver_name").notNull().default(""),
  currency: text("currency", { enum: ["CZK", "EUR"] }).notNull().default("EUR"),
  totalCents: integer("total_cents").notNull().default(0),
  status: text("status", { enum: ["planned", "booked", "cancelled"] }).notNull().default("planned"),
  notes: text("notes").notNull().default(""),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const travelAttachments = sqliteTable("travel_attachments", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", { enum: ["accommodation", "flight", "rental"] }).notNull(),
  entityId: text("entity_id").notNull(),
  leg: text("leg", { enum: ["general", "outbound", "return"] }).notNull().default("general"),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("travel_attachments_entity_idx").on(table.entityType, table.entityId, table.createdAt),
]);

export const sales = sqliteTable("sales", {
  id: text("id").primaryKey(),
  raceId: text("race_id"),
  customerId: text("customer_id"),
  teamId: text("team_id"),
  saleNumber: text("sale_number").notNull().unique(),
  saleDate: text("sale_date").notNull(),
  customerName: text("customer_name").notNull(),
  documentNumber: text("document_number").notNull().default(""),
  currency: text("currency", { enum: ["CZK", "EUR"] }).notNull().default("CZK"),
  totalCents: integer("total_cents").notNull().default(0),
  paymentMethod: text("payment_method", { enum: ["cash", "card", "bank_transfer", "invoice", "other"] }).notNull().default("cash"),
  isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(false),
  isDelivered: integer("is_delivered", { mode: "boolean" }).notNull().default(false),
  notes: text("notes").notNull().default(""),
  voidedAt: integer("voided_at", { mode: "timestamp_ms" }),
  voidedBy: text("voided_by"),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const saleItems = sqliteTable("sale_items", {
  id: text("id").primaryKey(),
  saleId: text("sale_id").notNull(),
  itemType: text("item_type", { enum: ["engine", "carburetor", "part", "service", "other"] }).notNull(),
  lineKind: text("line_kind").notNull().default(""),
  resourceId: text("resource_id"),
  codeSnapshot: text("code_snapshot").notNull().default(""),
  description: text("description").notNull(),
  descriptionEnSnapshot: text("description_en_snapshot").notNull().default(""),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull().default(0),
  lineTotalCents: integer("line_total_cents").notNull().default(0),
});

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  companyId: text("company_id").notNull().default(""),
  vatId: text("vat_id").notNull().default(""),
  notes: text("notes").notNull().default(""),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const serviceCatalog = sqliteTable("service_catalog", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  descriptionCs: text("description_cs").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  priceCzkCents: integer("price_czk_cents").notNull().default(0),
  priceEurCents: integer("price_eur_cents").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const inventoryParts = sqliteTable("inventory_parts", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  categories: text("categories").notNull().default("[]"),
  quantity: integer("quantity").notNull().default(0),
  unit: text("unit").notNull().default("ks"),
  priceCzkCents: integer("price_czk_cents").notNull().default(0),
  priceEurCents: integer("price_eur_cents").notNull().default(0),
  notes: text("notes").notNull().default(""),
  imageKey: text("image_key"),
  imageContentType: text("image_content_type"),
  imageUpdatedAt: integer("image_updated_at", { mode: "timestamp_ms" }),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const checklists = sqliteTable("checklists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes").notNull().default(""),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const checklistItems = sqliteTable("checklist_items", {
  id: text("id").primaryKey(),
  checklistId: text("checklist_id").notNull(),
  section: text("section").notNull().default(""),
  partNumber: text("part_number").notNull().default(""),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  details: text("details").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const workItems = sqliteTable("work_items", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["task", "reminder"] }).notNull().default("task"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }).notNull().default("normal"),
  status: text("status", { enum: ["open", "in_progress", "done"] }).notNull().default("open"),
  dueAt: text("due_at"),
  assigneeName: text("assignee_name").notNull().default(""),
  raceId: text("race_id"),
  completedBy: text("completed_by"),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// --- Servisní karta (Nastavení → Servisní karta) --------------------------------------
// Declarative mirror only — these tables are actually created by db/runtime-schema.ts.
// See CLAUDE.md: drizzle migrations are not the mechanism here.

/** Engine categories keyed by the `engines.family` code (MINI / OKJ / OKN / OKN-J / OK / KZ).
 *  `counterUnit` null means the category tracks no counter at all — every interval, warning
 *  threshold and tile colour is skipped for it. Flipping it to "hours" later needs no migration. */
export const engineCategories = sqliteTable("engine_categories", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  nameCs: text("name_cs").notNull(),
  nameEn: text("name_en").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  counterUnit: text("counter_unit", { enum: ["hours", "days", "race_weekends"] }),
  serviceCardMigrated: integer("service_card_migrated", { mode: "boolean" }).notNull().default(false),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("engine_categories_code_unique_idx").on(table.code),
]);

export const serviceTypes = sqliteTable("service_types", {
  id: text("id").primaryKey(),
  engineCategoryId: text("engine_category_id").notNull().references(() => engineCategories.id),
  code: text("code").notNull(),
  nameCs: text("name_cs").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionCs: text("description_cs").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("service_types_category_idx").on(table.engineCategoryId, table.sortOrder),
]);

/** Which card items a service type pre-ticks. Flat link table — there is no inheritance
 *  between types (1.D does not extend 1.C); each type carries its own full list. */
export const serviceTypeDefaultItems = sqliteTable("service_type_default_items", {
  id: text("id").primaryKey(),
  serviceTypeId: text("service_type_id").notNull().references(() => serviceTypes.id),
  serviceCardItemId: text("service_card_item_id").notNull().references(() => serviceCardItems.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("service_type_default_items_unique_idx").on(table.serviceTypeId, table.serviceCardItemId),
]);

/** One tile on an engine's service card. `materialCategoryId` set means the mechanic gets a
 *  variant dropdown for it; empty means it is a plain tick box. `intervalMinutes` is stored in
 *  minutes to match engines.total_minutes — the UI enters and shows it as HH:MM.
 *  `legacyPartKey` carries the old engine_service_part_catalog.part_key so historic entries
 *  (which reference parts by that key, not by id) still resolve to the item they became. */
export const serviceCardItems = sqliteTable("service_card_items", {
  id: text("id").primaryKey(),
  engineCategoryId: text("engine_category_id").notNull().references(() => engineCategories.id),
  nameCs: text("name_cs").notNull(),
  nameEn: text("name_en").notNull(),
  materialCategoryId: text("material_category_id").references(() => materialCategories.id),
  intervalMinutes: integer("interval_minutes"),
  warnPercent: integer("warn_percent").notNull().default(80),
  legacyPartKey: text("legacy_part_key"),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("service_card_items_category_idx").on(table.engineCategoryId, table.sortOrder),
]);

export const materialCategories = sqliteTable("material_categories", {
  id: text("id").primaryKey(),
  engineCategoryId: text("engine_category_id").notNull().references(() => engineCategories.id),
  nameCs: text("name_cs").notNull(),
  nameEn: text("name_en").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("material_categories_category_idx").on(table.engineCategoryId, table.sortOrder),
]);

/** Attributes are defined per material category, not globally — pistons carry a brand and a
 *  size, gaskets a type and a thickness. `options` is a JSON string array, filled only for
 *  attributeType "dropdown". */
export const materialAttributes = sqliteTable("material_attributes", {
  id: text("id").primaryKey(),
  materialCategoryId: text("material_category_id").notNull().references(() => materialCategories.id),
  nameCs: text("name_cs").notNull(),
  nameEn: text("name_en").notNull(),
  attributeType: text("attribute_type", { enum: ["dropdown", "number", "text"] }).notNull().default("text"),
  unit: text("unit").notNull().default(""),
  options: text("options").notNull().default("[]"),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("material_attributes_category_idx").on(table.materialCategoryId, table.sortOrder),
]);

/** A ready-made catalogue entry — the only thing a mechanic ever picks. They never type
 *  attribute values by hand, which keeps "0.3" / "0,3" / "0.30 mm" out of the data.
 *  `attributeValues` is a JSON map of materialAttributes.id → value. */
export const materialVariants = sqliteTable("material_variants", {
  id: text("id").primaryKey(),
  materialCategoryId: text("material_category_id").notNull().references(() => materialCategories.id),
  name: text("name").notNull(),
  attributeValues: text("attribute_values").notNull().default("{}"),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("material_variants_category_idx").on(table.materialCategoryId, table.name),
]);

/** `serviceDate` is when the work happened (the mechanic may backdate it); `createdAt` is when
 *  it was typed in — deliberately separate, and history sorts by serviceDate. `counterMinutes`
 *  snapshots engines.total_minutes at write time and stays null for categories without a
 *  counter; such rows are skipped, not read as zero, when computing run-since-replacement.
 *  Cancelled records keep `cancelledAt` set and are never deleted. */
export const serviceRecords = sqliteTable("service_records", {
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull().references(() => engines.id),
  serviceTypeId: text("service_type_id").references(() => serviceTypes.id),
  serviceTypeSnapshot: text("service_type_snapshot").notNull().default(""),
  serviceDate: text("service_date").notNull(),
  /** Volitelný čas HH:MM. Prázdný = neznámý; řadí se na začátek dne a nikde se nezobrazuje. */
  serviceTime: text("service_time").notNull().default(""),
  counterMinutes: integer("counter_minutes"),
  mechanicId: text("mechanic_id").references(() => mechanics.id),
  mechanicNameSnapshot: text("mechanic_name_snapshot").notNull().default(""),
  note: text("note").notNull().default(""),
  cancelledReason: text("cancelled_reason").notNull().default(""),
  cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
  cancelledBy: text("cancelled_by").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("service_records_engine_idx").on(table.engineId, table.serviceDate, table.serviceTime),
]);

/** Snapshots are mandatory: history reads `itemName*Snapshot` and `materialSnapshot` first, so
 *  renaming an item or archiving a variant a year from now can neither rewrite nor break what
 *  was recorded. The foreign keys stay only for live lookups. */
export const serviceRecordItems = sqliteTable("service_record_items", {
  id: text("id").primaryKey(),
  serviceRecordId: text("service_record_id").notNull().references(() => serviceRecords.id),
  serviceCardItemId: text("service_card_item_id").references(() => serviceCardItems.id),
  itemNameCsSnapshot: text("item_name_cs_snapshot").notNull(),
  itemNameEnSnapshot: text("item_name_en_snapshot").notNull(),
  materialVariantId: text("material_variant_id").references(() => materialVariants.id),
  materialSnapshot: text("material_snapshot"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("service_record_items_record_idx").on(table.serviceRecordId, table.sortOrder),
]);

/** Vyřízené položky fronty servisu. Fronta sama se dopočítává ze skončených závodů a vrácených
 *  zápůjček — tady je jen její opak: (motor, zdroj), který už někdo odbavil. `serviced` vzniká
 *  spolu se servisním záznamem, `skipped` kliknutím na „Nejel / bez servisu". */
export const engineServiceQueueResolutions = sqliteTable("engine_service_queue_resolutions", {
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull().references(() => engines.id),
  sourceType: text("source_type", { enum: ["race", "loan", "manual"] }).notNull(),
  sourceId: text("source_id").notNull(),
  resolution: text("resolution", { enum: ["serviced", "skipped"] }).notNull(),
  serviceRecordId: text("service_record_id").references(() => serviceRecords.id),
  resolvedBy: text("resolved_by").notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("engine_service_queue_resolutions_unique_idx").on(table.engineId, table.sourceType, table.sourceId),
]);

/** Motor poslaný do fronty ručně — mimo závod i zápůjčku. Poznámka je povinná, aby mechanik
 *  věděl, co na něm hledat. */
export const engineServiceQueueManual = sqliteTable("engine_service_queue_manual", {
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull().references(() => engines.id),
  note: text("note").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("engine_service_queue_manual_engine_idx").on(table.engineId, table.createdAt),
]);

/** Historie změn technických údajů motoru. `engineTechnicalValues` drží jen poslední hodnotu,
 *  takže bez tohohle logu nejde zpětně zjistit, co na motoru bylo. Hodnoty i název pole se
 *  ukládají jako čitelný text — id volby by po její archivaci přestalo dávat smysl. */
export const engineTechnicalValueChanges = sqliteTable("engine_technical_value_changes", {
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull().references(() => engines.id),
  fieldId: text("field_id").references(() => engineTechnicalFields.id),
  fieldLabelCs: text("field_label_cs").notNull(),
  fieldLabelEn: text("field_label_en").notNull(),
  oldValue: text("old_value").notNull().default(""),
  newValue: text("new_value").notNull().default(""),
  /** `service` = hodnota se propsala ze servisního záznamu, `manual` = ruční editace karty. */
  source: text("source", { enum: ["manual", "service"] }).notNull().default("manual"),
  /** U `source: "service"` odkaz na zápis, který změnu způsobil — osa z něj dělá proklik. */
  serviceRecordId: text("service_record_id").references(() => serviceRecords.id),
  changedBy: text("changed_by").notNull(),
  changedAt: integer("changed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("engine_technical_value_changes_engine_idx").on(table.engineId, table.changedAt),
]);

/** Rozpracovaný motor — kdo si ho vzal („Beru si ho") a odkdy na něm dělá. Výlučnost hlídá
 *  částečný unikátní index nad `engine_id` pro nezavřená zabrání (viz `runtime-schema.ts`);
 *  drizzle ho takhle zapsat neumí, proto je tady jen prostý index. Řádek se nemaže, jen
 *  uzavírá `releasedAt`, aby šlo dohledat, kdo na motoru kdy dělal. */
export const engineServiceClaims = sqliteTable("engine_service_claims", {
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull().references(() => engines.id),
  claimedBy: text("claimed_by").notNull(),
  /** Jméno v době zabrání — na dlaždici se ukazuje i po přejmenování účtu. */
  claimedByName: text("claimed_by_name").notNull(),
  /** Vybraný mechanik, když zabrání zapsal sdílený panel v dílně. Mechanikův vlastní účet
   *  ho nevyplňuje — tam je člověk dán přihlášením. */
  claimedMechanicId: text("claimed_mechanic_id").references(() => mechanics.id),
  claimedAt: integer("claimed_at", { mode: "timestamp_ms" }).notNull(),
  releasedAt: integer("released_at", { mode: "timestamp_ms" }),
  releasedBy: text("released_by"),
  /** `manual` = vráceno do fronty, `service` = uvolněno automaticky po uložení servisu. */
  releaseReason: text("release_reason", { enum: ["", "manual", "service"] }).notNull().default(""),
}, (table) => [
  index("engine_service_claims_engine_idx").on(table.engineId, table.claimedAt),
]);

/** Obecné nastavení aplikace jako klíč/hodnota — první je základní adresa pro QR kódy,
 *  ale tabulka je záměrně obecná. */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedBy: text("updated_by").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
