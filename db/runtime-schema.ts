import { getD1 } from "./index";

let schemaPromise: Promise<void> | null = null;

export function ensureRuntimeSchema() {
  schemaPromise ??= createRuntimeSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

async function createRuntimeSchema() {
  const d1 = getD1();

  await d1.batch([
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('superadmin', 'boss', 'mechanic')),
        locale TEXT NOT NULL DEFAULT 'cs' CHECK (locale IN ('cs', 'en')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engines (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL,
        serial_number TEXT NOT NULL DEFAULT '',
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        family TEXT NOT NULL DEFAULT 'OKN',
        ignition TEXT NOT NULL DEFAULT 'PVL',
        kz_generation TEXT,
        current_configuration TEXT,
        upgrade_code TEXT NOT NULL DEFAULT '',
        label_color TEXT NOT NULL DEFAULT '',
        purchase_date TEXT,
        piston_spec TEXT NOT NULL DEFAULT '',
        cylinder_code TEXT NOT NULL DEFAULT '',
        cylinder_upgrade TEXT NOT NULL DEFAULT '',
        liner TEXT NOT NULL DEFAULT '',
        degree TEXT NOT NULL DEFAULT '',
        timing TEXT NOT NULL DEFAULT '',
        carter TEXT NOT NULL DEFAULT '',
        reeds TEXT NOT NULL DEFAULT '',
        spacer TEXT NOT NULL DEFAULT '',
        squish TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'service_soon', 'service', 'rebuild', 'storage', 'retired')),
        total_minutes INTEGER NOT NULL DEFAULT 0,
        piston_minutes INTEGER NOT NULL DEFAULT 0,
        rod_minutes INTEGER NOT NULL DEFAULT 0,
        last_oppama_minutes INTEGER NOT NULL DEFAULT 0,
        current_piston_size TEXT NOT NULL DEFAULT '',
        baseline_total_minutes INTEGER NOT NULL DEFAULT 0,
        baseline_piston_minutes INTEGER NOT NULL DEFAULT 0,
        baseline_rod_minutes INTEGER NOT NULL DEFAULT 0,
        baseline_last_oppama_minutes INTEGER NOT NULL DEFAULT 0,
        baseline_piston_size TEXT NOT NULL DEFAULT '',
        service_interval_minutes INTEGER NOT NULL DEFAULT 360,
        notes TEXT NOT NULL DEFAULT '',
        sold_at INTEGER,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_usage_logs (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        oppama_minutes INTEGER NOT NULL,
        race_name TEXT NOT NULL DEFAULT '',
        driver_name TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_service_entries (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        service_date TEXT NOT NULL,
        service_type TEXT NOT NULL,
        replaced_parts TEXT NOT NULL DEFAULT '[]',
        piston_size TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        piston_minutes_before INTEGER NOT NULL DEFAULT 0,
        rod_minutes_before INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        country_code TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        logo_key TEXT,
        logo_content_type TEXT,
        logo_updated_at INTEGER,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        team_id TEXT,
        default_category TEXT NOT NULL DEFAULT '',
        race_number TEXT NOT NULL DEFAULT '',
        nationality TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        notes TEXT NOT NULL DEFAULT '',
        photo_key TEXT,
        photo_content_type TEXT,
        photo_updated_at INTEGER,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS mechanics (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS clothing_items (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        sizes TEXT NOT NULL DEFAULT '[]',
        default_quantity INTEGER NOT NULL DEFAULT 1,
        notes TEXT NOT NULL DEFAULT '',
        image_key TEXT,
        image_content_type TEXT,
        image_updated_at INTEGER,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS mechanic_clothing_assignments (
        id TEXT PRIMARY KEY NOT NULL,
        mechanic_id TEXT NOT NULL,
        clothing_item_id TEXT NOT NULL,
        size TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        assigned_at INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        license_plate TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        photo_key TEXT,
        photo_content_type TEXT,
        photo_updated_at INTEGER,
        current_km INTEGER,
        service_interval_km INTEGER,
        last_service_km INTEGER,
        last_service_note TEXT NOT NULL DEFAULT '',
        last_service_date TEXT NOT NULL DEFAULT '',
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS vehicle_service_entries (
        id TEXT PRIMARY KEY NOT NULL,
        vehicle_id TEXT NOT NULL,
        service_date TEXT NOT NULL,
        km INTEGER,
        work_done TEXT NOT NULL DEFAULT '',
        mechanic_id TEXT,
        mechanic_name_snapshot TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS carburetors (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL UNIQUE,
        carburetor_type_id TEXT,
        category TEXT NOT NULL DEFAULT '',
        family TEXT NOT NULL,
        brand TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ready',
        notes TEXT NOT NULL DEFAULT '',
        sold_at INTEGER,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS carburetor_types (
        id TEXT PRIMARY KEY NOT NULL,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        categories TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        photo_key TEXT,
        photo_content_type TEXT,
        photo_updated_at INTEGER,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS carburetor_service_entries (
        id TEXT PRIMARY KEY NOT NULL,
        carburetor_id TEXT NOT NULL,
        service_date TEXT NOT NULL,
        service_type TEXT NOT NULL CHECK (service_type IN ('check', 'routine', 'full', 'repair')),
        mechanic_id TEXT,
        mechanic_name_snapshot TEXT NOT NULL DEFAULT '',
        work_done TEXT NOT NULL DEFAULT '',
        replaced_parts TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_templates (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        notes TEXT NOT NULL DEFAULT '',
        series_options TEXT NOT NULL DEFAULT '[]',
        calendar_color TEXT NOT NULL DEFAULT 'sky',
        logo_key TEXT,
        logo_content_type TEXT,
        logo_updated_at INTEGER,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS circuits (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        country_code TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        website_url TEXT NOT NULL DEFAULT '',
        maps_url TEXT NOT NULL DEFAULT '',
        latitude REAL,
        longitude REAL,
        distance_km REAL,
        drive_minutes INTEGER,
        image_key TEXT,
        image_content_type TEXT,
        image_updated_at INTEGER,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS races (
        id TEXT PRIMARY KEY NOT NULL,
        race_template_id TEXT,
        circuit_id TEXT,
        name TEXT NOT NULL,
        series TEXT NOT NULL DEFAULT '',
        series_round INTEGER,
        race_type TEXT NOT NULL DEFAULT '',
        track TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        country_code TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        departure_date TEXT NOT NULL DEFAULT '',
        return_date TEXT NOT NULL DEFAULT '',
        organizer TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'archived')),
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_categories (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        category TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT ''
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_entries (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        category TEXT NOT NULL,
        driver_id TEXT NOT NULL,
        driver_name_snapshot TEXT NOT NULL,
        team_id TEXT,
        team_name_snapshot TEXT NOT NULL DEFAULT '',
        engine_1_id TEXT,
        engine_1_code TEXT NOT NULL DEFAULT '',
        engine_1_configuration TEXT NOT NULL DEFAULT '',
        engine_2_id TEXT,
        engine_2_code TEXT NOT NULL DEFAULT '',
        engine_2_configuration TEXT NOT NULL DEFAULT '',
        engine_3_id TEXT,
        engine_3_code TEXT NOT NULL DEFAULT '',
        engine_3_configuration TEXT NOT NULL DEFAULT '',
        carburetor_1_id TEXT,
        carburetor_1_code TEXT NOT NULL DEFAULT '',
        carburetor_2_id TEXT,
        carburetor_2_code TEXT NOT NULL DEFAULT '',
        carburetor_3_id TEXT,
        carburetor_3_code TEXT NOT NULL DEFAULT '',
        is_confirmed INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_entry_finance (
        race_entry_id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        base_price_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('CZK', 'EUR')),
        discount_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (discount_basis_points >= 0 AND discount_basis_points <= 10000),
        final_price_cents INTEGER NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT '' CHECK (payment_method IN ('', 'cash', 'card', 'bank_transfer')),
        is_paid INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_mechanics (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        mechanic_id TEXT NOT NULL,
        mechanic_name_snapshot TEXT NOT NULL,
        vehicle_id TEXT
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_vehicles (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        vehicle_id TEXT NOT NULL,
        vehicle_name_snapshot TEXT NOT NULL,
        license_plate_snapshot TEXT NOT NULL DEFAULT ''
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_extras (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        category TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        resource_code_snapshot TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_deliveries (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        currency TEXT NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR')),
        amount_cents INTEGER NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'invoice', 'other')),
        is_delivered INTEGER NOT NULL DEFAULT 0,
        is_paid INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_followup_notes (
        race_id TEXT PRIMARY KEY NOT NULL,
        next_race TEXT NOT NULL DEFAULT '',
        consumed TEXT NOT NULL DEFAULT '',
        missing TEXT NOT NULL DEFAULT '',
        other_notes TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_accommodations (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        name TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        check_in_date TEXT NOT NULL,
        check_out_date TEXT NOT NULL,
        reservation_code TEXT NOT NULL DEFAULT '',
        website_url TEXT NOT NULL DEFAULT '',
        booking_url TEXT NOT NULL DEFAULT '',
        track_distance_km REAL,
        track_drive_minutes INTEGER,
        room_count INTEGER NOT NULL DEFAULT 0,
        guest_count INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('CZK', 'EUR')),
        total_cents INTEGER NOT NULL DEFAULT 0,
        payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
        status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'booked', 'cancelled')),
        notes TEXT NOT NULL DEFAULT '',
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_flights (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'return', 'other')),
        trip_kind TEXT NOT NULL DEFAULT 'outbound',
        departure_airport TEXT NOT NULL,
        arrival_airport TEXT NOT NULL,
        departure_at TEXT NOT NULL,
        arrival_at TEXT NOT NULL,
        airline TEXT NOT NULL DEFAULT '',
        flight_number TEXT NOT NULL DEFAULT '',
        return_departure_airport TEXT NOT NULL DEFAULT '',
        return_arrival_airport TEXT NOT NULL DEFAULT '',
        return_departure_at TEXT NOT NULL DEFAULT '',
        return_arrival_at TEXT NOT NULL DEFAULT '',
        return_airline TEXT NOT NULL DEFAULT '',
        return_flight_number TEXT NOT NULL DEFAULT '',
        reservation_code TEXT NOT NULL DEFAULT '',
        return_reservation_code TEXT NOT NULL DEFAULT '',
        passengers_note TEXT NOT NULL DEFAULT '',
        passengers_json TEXT NOT NULL DEFAULT '[]',
        baggage TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('CZK', 'EUR')),
        total_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'booked', 'cancelled')),
        notes TEXT NOT NULL DEFAULT '',
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_car_rentals (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        company TEXT NOT NULL,
        vehicle_type TEXT NOT NULL DEFAULT '',
        pickup_place TEXT NOT NULL,
        return_place TEXT NOT NULL,
        pickup_at TEXT NOT NULL,
        return_at TEXT NOT NULL,
        reservation_code TEXT NOT NULL DEFAULT '',
        license_plate TEXT NOT NULL DEFAULT '',
        driver_name TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('CZK', 'EUR')),
        total_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'booked', 'cancelled')),
        notes TEXT NOT NULL DEFAULT '',
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS travel_attachments (
        id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('accommodation', 'flight', 'rental')),
        entity_id TEXT NOT NULL,
        leg TEXT NOT NULL DEFAULT 'general' CHECK (leg IN ('general', 'outbound', 'return')),
        file_name TEXT NOT NULL,
        object_key TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        actor_email TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task', 'reminder')),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
        due_at TEXT,
        assignee_name TEXT NOT NULL DEFAULT '',
        race_id TEXT,
        completed_by TEXT,
        completed_at INTEGER,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT,
        customer_id TEXT,
        team_id TEXT,
        sale_number TEXT NOT NULL UNIQUE,
        sale_date TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        document_number TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR')),
        total_cents INTEGER NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'invoice', 'other')),
        is_paid INTEGER NOT NULL DEFAULT 0,
        is_delivered INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        voided_at INTEGER,
        voided_by TEXT,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        company_id TEXT NOT NULL DEFAULT '',
        vat_id TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_catalog (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        description_cs TEXT NOT NULL DEFAULT '',
        description_en TEXT NOT NULL DEFAULT '',
        price_czk_cents INTEGER NOT NULL DEFAULT 0,
        price_eur_cents INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS inventory_parts (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        categories TEXT NOT NULL DEFAULT '[]',
        quantity INTEGER NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT 'ks',
        price_czk_cents INTEGER NOT NULL DEFAULT 0,
        price_eur_cents INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        image_key TEXT,
        image_content_type TEXT,
        image_updated_at INTEGER,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT NOT NULL,
        item_type TEXT NOT NULL CHECK (item_type IN ('engine', 'carburetor', 'part', 'service', 'other')),
        line_kind TEXT NOT NULL DEFAULT '',
        resource_id TEXT,
        code_snapshot TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL,
        description_en_snapshot TEXT NOT NULL DEFAULT '',
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price_cents INTEGER NOT NULL DEFAULT 0,
        line_total_cents INTEGER NOT NULL DEFAULT 0
      )
    `),
    d1.prepare("CREATE INDEX IF NOT EXISTS engines_status_idx ON engines (status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_usage_engine_idx ON engine_usage_logs (engine_id, entry_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_service_engine_idx ON engine_service_entries (engine_id, service_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS drivers_team_idx ON drivers (team_id)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS carburetor_types_brand_model_idx ON carburetor_types (brand, model) WHERE archived_at IS NULL"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS circuits_country_name_idx ON circuits (country_code, name) WHERE archived_at IS NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS circuits_country_idx ON circuits (country_code, name)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS carburetor_service_entries_carb_idx ON carburetor_service_entries (carburetor_id, service_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS vehicle_service_entries_vehicle_idx ON vehicle_service_entries (vehicle_id, service_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_categories_race_idx ON race_categories (race_id, sort_order)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS race_entries_driver_idx ON race_entries (race_id, driver_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_entries_race_idx ON race_entries (race_id, category)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_entry_finance_race_idx ON race_entry_finance (race_id)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS race_mechanics_unique_idx ON race_mechanics (race_id, mechanic_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS clothing_items_name_idx ON clothing_items (name)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS mechanic_clothing_unique_idx ON mechanic_clothing_assignments (mechanic_id, clothing_item_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS mechanic_clothing_item_idx ON mechanic_clothing_assignments (clothing_item_id)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS race_vehicles_unique_idx ON race_vehicles (race_id, vehicle_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_extras_race_idx ON race_extras (race_id, category)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_deliveries_race_idx ON race_deliveries (race_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_accommodations_race_idx ON race_accommodations (race_id, check_in_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_flights_race_idx ON race_flights (race_id, departure_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_car_rentals_race_idx ON race_car_rentals (race_id, pickup_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS travel_attachments_entity_idx ON travel_attachments (entity_type, entity_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS races_start_date_idx ON races (start_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS sales_date_idx ON sales (sale_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items (sale_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS sale_items_resource_idx ON sale_items (item_type, resource_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (name)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique_idx ON customers (LOWER(email)) WHERE email != '' AND archived_at IS NULL"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS service_catalog_name_unique_idx ON service_catalog (LOWER(name)) WHERE archived_at IS NULL"),
    d1.prepare("DROP INDEX IF EXISTS inventory_parts_code_unique"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS inventory_parts_code_unique ON inventory_parts (code) WHERE archived_at IS NULL"),
    d1.prepare("DROP INDEX IF EXISTS engines_code_category_unique"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS engines_code_category_unique ON engines (code, category) WHERE archived_at IS NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS work_items_status_due_idx ON work_items (status, due_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS work_items_race_idx ON work_items (race_id)"),
  ]);

  const columns = await d1.prepare("PRAGMA table_info(engines)").all<{ name: string }>();
  const existing = new Set(columns.results.map((column: { name: string }) => column.name));
  const additions = [
    ["family", "ALTER TABLE engines ADD COLUMN family TEXT NOT NULL DEFAULT 'OKN'"],
    ["ignition", "ALTER TABLE engines ADD COLUMN ignition TEXT NOT NULL DEFAULT 'PVL'"],
    ["kz_generation", "ALTER TABLE engines ADD COLUMN kz_generation TEXT"],
    ["current_configuration", "ALTER TABLE engines ADD COLUMN current_configuration TEXT"],
    ["upgrade_code", "ALTER TABLE engines ADD COLUMN upgrade_code TEXT NOT NULL DEFAULT ''"],
    ["label_color", "ALTER TABLE engines ADD COLUMN label_color TEXT NOT NULL DEFAULT ''"],
    ["purchase_date", "ALTER TABLE engines ADD COLUMN purchase_date TEXT"],
    ["piston_minutes", "ALTER TABLE engines ADD COLUMN piston_minutes INTEGER NOT NULL DEFAULT 0"],
    ["rod_minutes", "ALTER TABLE engines ADD COLUMN rod_minutes INTEGER NOT NULL DEFAULT 0"],
    ["last_oppama_minutes", "ALTER TABLE engines ADD COLUMN last_oppama_minutes INTEGER NOT NULL DEFAULT 0"],
    ["current_piston_size", "ALTER TABLE engines ADD COLUMN current_piston_size TEXT NOT NULL DEFAULT ''"],
    ["baseline_total_minutes", "ALTER TABLE engines ADD COLUMN baseline_total_minutes INTEGER NOT NULL DEFAULT 0"],
    ["baseline_piston_minutes", "ALTER TABLE engines ADD COLUMN baseline_piston_minutes INTEGER NOT NULL DEFAULT 0"],
    ["baseline_rod_minutes", "ALTER TABLE engines ADD COLUMN baseline_rod_minutes INTEGER NOT NULL DEFAULT 0"],
    ["baseline_last_oppama_minutes", "ALTER TABLE engines ADD COLUMN baseline_last_oppama_minutes INTEGER NOT NULL DEFAULT 0"],
    ["baseline_piston_size", "ALTER TABLE engines ADD COLUMN baseline_piston_size TEXT NOT NULL DEFAULT ''"],
    ["piston_spec", "ALTER TABLE engines ADD COLUMN piston_spec TEXT NOT NULL DEFAULT ''"],
    ["cylinder_code", "ALTER TABLE engines ADD COLUMN cylinder_code TEXT NOT NULL DEFAULT ''"],
    ["cylinder_upgrade", "ALTER TABLE engines ADD COLUMN cylinder_upgrade TEXT NOT NULL DEFAULT ''"],
    ["liner", "ALTER TABLE engines ADD COLUMN liner TEXT NOT NULL DEFAULT ''"],
    ["degree", "ALTER TABLE engines ADD COLUMN degree TEXT NOT NULL DEFAULT ''"],
    ["timing", "ALTER TABLE engines ADD COLUMN timing TEXT NOT NULL DEFAULT ''"],
    ["carter", "ALTER TABLE engines ADD COLUMN carter TEXT NOT NULL DEFAULT ''"],
    ["reeds", "ALTER TABLE engines ADD COLUMN reeds TEXT NOT NULL DEFAULT ''"],
    ["spacer", "ALTER TABLE engines ADD COLUMN spacer TEXT NOT NULL DEFAULT ''"],
    ["squish", "ALTER TABLE engines ADD COLUMN squish TEXT NOT NULL DEFAULT ''"],
    ["sold_at", "ALTER TABLE engines ADD COLUMN sold_at INTEGER"],
  ].filter(([name]) => !existing.has(name));

  if (additions.length > 0) {
    await d1.batch(additions.map(([, statement]) => d1.prepare(statement)));
    if (!existing.has("family")) {
      await d1.prepare("UPDATE engines SET family = category WHERE category IN ('MINI', 'OKJ', 'OKN', 'OKN-J', 'OK', 'KZ')").run();
    }
  }

  await ensureEngineCodeCategoryIndex(d1);
  await ensureArchivedScopedUniqueness(d1);

  const raceColumns = await d1.prepare("PRAGMA table_info(races)").all<{ name: string }>();
  const existingRaceColumns = new Set(raceColumns.results.map((column: { name: string }) => column.name));
  const raceAdditions = [
    ["race_template_id", "ALTER TABLE races ADD COLUMN race_template_id TEXT"],
    ["circuit_id", "ALTER TABLE races ADD COLUMN circuit_id TEXT"],
    ["race_type", "ALTER TABLE races ADD COLUMN race_type TEXT NOT NULL DEFAULT ''"],
    ["address", "ALTER TABLE races ADD COLUMN address TEXT NOT NULL DEFAULT ''"],
    ["departure_date", "ALTER TABLE races ADD COLUMN departure_date TEXT NOT NULL DEFAULT ''"],
    ["return_date", "ALTER TABLE races ADD COLUMN return_date TEXT NOT NULL DEFAULT ''"],
    ["organizer", "ALTER TABLE races ADD COLUMN organizer TEXT NOT NULL DEFAULT ''"],
    ["notes", "ALTER TABLE races ADD COLUMN notes TEXT NOT NULL DEFAULT ''"],
    ["series_round", "ALTER TABLE races ADD COLUMN series_round INTEGER"],
  ].filter(([name]) => !existingRaceColumns.has(name));
  if (raceAdditions.length > 0) await d1.batch(raceAdditions.map(([, statement]) => d1.prepare(statement)));
  await d1.prepare("CREATE INDEX IF NOT EXISTS races_template_idx ON races (race_template_id)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS races_circuit_idx ON races (circuit_id)").run();

  const raceEntryColumns = await d1.prepare("PRAGMA table_info(race_entries)").all<{ name: string }>();
  const existingRaceEntryColumns = new Set(raceEntryColumns.results.map((column: { name: string }) => column.name));
  const raceEntryAdditions = [
    ["is_confirmed", "ALTER TABLE race_entries ADD COLUMN is_confirmed INTEGER NOT NULL DEFAULT 0"],
    ["engine_1_configuration", "ALTER TABLE race_entries ADD COLUMN engine_1_configuration TEXT NOT NULL DEFAULT ''"],
    ["engine_2_configuration", "ALTER TABLE race_entries ADD COLUMN engine_2_configuration TEXT NOT NULL DEFAULT ''"],
    ["engine_3_configuration", "ALTER TABLE race_entries ADD COLUMN engine_3_configuration TEXT NOT NULL DEFAULT ''"],
  ].filter(([name]) => !existingRaceEntryColumns.has(name));
  if (raceEntryAdditions.length > 0) await d1.batch(raceEntryAdditions.map(([, statement]) => d1.prepare(statement)));
  await d1.prepare(`
    UPDATE race_entries SET
      engine_1_configuration = COALESCE((SELECT current_configuration FROM engines WHERE engines.id = race_entries.engine_1_id), engine_1_configuration),
      engine_2_configuration = COALESCE((SELECT current_configuration FROM engines WHERE engines.id = race_entries.engine_2_id), engine_2_configuration),
      engine_3_configuration = COALESCE((SELECT current_configuration FROM engines WHERE engines.id = race_entries.engine_3_id), engine_3_configuration)
    WHERE (engine_1_id IS NOT NULL AND engine_1_configuration = '')
       OR (engine_2_id IS NOT NULL AND engine_2_configuration = '')
       OR (engine_3_id IS NOT NULL AND engine_3_configuration = '')
  `).run();

  const templateColumns = await d1.prepare("PRAGMA table_info(race_templates)").all<{ name: string }>();
  const existingTemplateColumns = new Set(templateColumns.results.map((column: { name: string }) => column.name));
  const templateAdditions = [
    ["calendar_color", "ALTER TABLE race_templates ADD COLUMN calendar_color TEXT NOT NULL DEFAULT 'sky'"],
    ["logo_key", "ALTER TABLE race_templates ADD COLUMN logo_key TEXT"],
    ["logo_content_type", "ALTER TABLE race_templates ADD COLUMN logo_content_type TEXT"],
    ["logo_updated_at", "ALTER TABLE race_templates ADD COLUMN logo_updated_at INTEGER"],
    ["series_options", "ALTER TABLE race_templates ADD COLUMN series_options TEXT NOT NULL DEFAULT '[]'"],
  ].filter(([name]) => !existingTemplateColumns.has(name));
  if (templateAdditions.length > 0) await d1.batch(templateAdditions.map(([, statement]) => d1.prepare(statement)));

  const teamColumns = await d1.prepare("PRAGMA table_info(teams)").all<{ name: string }>();
  const existingTeamColumns = new Set(teamColumns.results.map((column: { name: string }) => column.name));
  const teamAdditions = [
    ["logo_key", "ALTER TABLE teams ADD COLUMN logo_key TEXT"],
    ["logo_content_type", "ALTER TABLE teams ADD COLUMN logo_content_type TEXT"],
    ["logo_updated_at", "ALTER TABLE teams ADD COLUMN logo_updated_at INTEGER"],
  ].filter(([name]) => !existingTeamColumns.has(name));
  if (teamAdditions.length > 0) await d1.batch(teamAdditions.map(([, statement]) => d1.prepare(statement)));

  const driverColumns = await d1.prepare("PRAGMA table_info(drivers)").all<{ name: string }>();
  if (!driverColumns.results.some((column: { name: string }) => column.name === "is_active")) {
    await d1.prepare("ALTER TABLE drivers ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1").run();
  }
  await d1.prepare("CREATE INDEX IF NOT EXISTS drivers_active_category_idx ON drivers (is_active, default_category)").run();

  const carburetorColumns = await d1.prepare("PRAGMA table_info(carburetors)").all<{ name: string }>();
  if (!carburetorColumns.results.some((column: { name: string }) => column.name === "carburetor_type_id")) {
    await d1.prepare("ALTER TABLE carburetors ADD COLUMN carburetor_type_id TEXT").run();
  }
  if (!carburetorColumns.results.some((column: { name: string }) => column.name === "category")) {
    await d1.prepare("ALTER TABLE carburetors ADD COLUMN category TEXT NOT NULL DEFAULT ''").run();
  }
  await d1.prepare("CREATE INDEX IF NOT EXISTS carburetors_type_idx ON carburetors (carburetor_type_id)").run();
  if (!carburetorColumns.results.some((column: { name: string }) => column.name === "sold_at")) {
    await d1.prepare("ALTER TABLE carburetors ADD COLUMN sold_at INTEGER").run();
  }

  const carburetorTypeColumns = await d1.prepare("PRAGMA table_info(carburetor_types)").all<{ name: string }>();
  const existingCarburetorTypeColumns = new Set(carburetorTypeColumns.results.map((column: { name: string }) => column.name));
  const carburetorTypeAdditions = [
    ["photo_key", "ALTER TABLE carburetor_types ADD COLUMN photo_key TEXT"],
    ["photo_content_type", "ALTER TABLE carburetor_types ADD COLUMN photo_content_type TEXT"],
    ["photo_updated_at", "ALTER TABLE carburetor_types ADD COLUMN photo_updated_at INTEGER"],
  ].filter(([name]) => !existingCarburetorTypeColumns.has(name));
  if (carburetorTypeAdditions.length > 0) await d1.batch(carburetorTypeAdditions.map(([, statement]) => d1.prepare(statement)));

  const vehicleColumns = await d1.prepare("PRAGMA table_info(vehicles)").all<{ name: string }>();
  const existingVehicleColumns = new Set(vehicleColumns.results.map((column: { name: string }) => column.name));
  const vehicleAdditions = [
    ["photo_key", "ALTER TABLE vehicles ADD COLUMN photo_key TEXT"],
    ["photo_content_type", "ALTER TABLE vehicles ADD COLUMN photo_content_type TEXT"],
    ["photo_updated_at", "ALTER TABLE vehicles ADD COLUMN photo_updated_at INTEGER"],
    ["current_km", "ALTER TABLE vehicles ADD COLUMN current_km INTEGER"],
    ["service_interval_km", "ALTER TABLE vehicles ADD COLUMN service_interval_km INTEGER"],
    ["last_service_km", "ALTER TABLE vehicles ADD COLUMN last_service_km INTEGER"],
    ["last_service_note", "ALTER TABLE vehicles ADD COLUMN last_service_note TEXT NOT NULL DEFAULT ''"],
    ["last_service_date", "ALTER TABLE vehicles ADD COLUMN last_service_date TEXT NOT NULL DEFAULT ''"],
  ].filter(([name]) => !existingVehicleColumns.has(name));
  if (vehicleAdditions.length > 0) await d1.batch(vehicleAdditions.map(([, statement]) => d1.prepare(statement)));

  const vehicleServiceEntryColumns = await d1.prepare("PRAGMA table_info(vehicle_service_entries)").all<{ name: string }>();
  const existingVehicleServiceEntryColumns = new Set(vehicleServiceEntryColumns.results.map((column: { name: string }) => column.name));
  const vehicleServiceEntryAdditions = [
    ["mechanic_id", "ALTER TABLE vehicle_service_entries ADD COLUMN mechanic_id TEXT"],
    ["mechanic_name_snapshot", "ALTER TABLE vehicle_service_entries ADD COLUMN mechanic_name_snapshot TEXT NOT NULL DEFAULT ''"],
  ].filter(([name]) => !existingVehicleServiceEntryColumns.has(name));
  if (vehicleServiceEntryAdditions.length > 0) await d1.batch(vehicleServiceEntryAdditions.map(([, statement]) => d1.prepare(statement)));

  const driverPhotoColumns = await d1.prepare("PRAGMA table_info(drivers)").all<{ name: string }>();
  const existingDriverPhotoColumns = new Set(driverPhotoColumns.results.map((column: { name: string }) => column.name));
  const driverPhotoAdditions = [
    ["photo_key", "ALTER TABLE drivers ADD COLUMN photo_key TEXT"],
    ["photo_content_type", "ALTER TABLE drivers ADD COLUMN photo_content_type TEXT"],
    ["photo_updated_at", "ALTER TABLE drivers ADD COLUMN photo_updated_at INTEGER"],
  ].filter(([name]) => !existingDriverPhotoColumns.has(name));
  if (driverPhotoAdditions.length > 0) await d1.batch(driverPhotoAdditions.map(([, statement]) => d1.prepare(statement)));

  const raceMechanicColumns = await d1.prepare("PRAGMA table_info(race_mechanics)").all<{ name: string }>();
  if (!raceMechanicColumns.results.some((column: { name: string }) => column.name === "vehicle_id")) {
    await d1.prepare("ALTER TABLE race_mechanics ADD COLUMN vehicle_id TEXT").run();
  }

  const flightColumns = await d1.prepare("PRAGMA table_info(race_flights)").all<{ name: string }>();
  const existingFlightColumns = new Set(flightColumns.results.map((column: { name: string }) => column.name));
  const needsTripKindBackfill = !existingFlightColumns.has("trip_kind");
  const flightAdditions = [
    ["passengers_json", "ALTER TABLE race_flights ADD COLUMN passengers_json TEXT NOT NULL DEFAULT '[]'"],
    ["trip_kind", "ALTER TABLE race_flights ADD COLUMN trip_kind TEXT NOT NULL DEFAULT 'outbound'"],
    ["return_departure_airport", "ALTER TABLE race_flights ADD COLUMN return_departure_airport TEXT NOT NULL DEFAULT ''"],
    ["return_arrival_airport", "ALTER TABLE race_flights ADD COLUMN return_arrival_airport TEXT NOT NULL DEFAULT ''"],
    ["return_departure_at", "ALTER TABLE race_flights ADD COLUMN return_departure_at TEXT NOT NULL DEFAULT ''"],
    ["return_arrival_at", "ALTER TABLE race_flights ADD COLUMN return_arrival_at TEXT NOT NULL DEFAULT ''"],
    ["return_airline", "ALTER TABLE race_flights ADD COLUMN return_airline TEXT NOT NULL DEFAULT ''"],
    ["return_flight_number", "ALTER TABLE race_flights ADD COLUMN return_flight_number TEXT NOT NULL DEFAULT ''"],
    ["return_reservation_code", "ALTER TABLE race_flights ADD COLUMN return_reservation_code TEXT NOT NULL DEFAULT ''"],
  ].filter(([name]) => !existingFlightColumns.has(name));
  if (flightAdditions.length > 0) await d1.batch(flightAdditions.map(([, statement]) => d1.prepare(statement)));
  if (needsTripKindBackfill) await d1.prepare("UPDATE race_flights SET trip_kind = direction").run();

  const travelAttachmentColumns = await d1.prepare("PRAGMA table_info(travel_attachments)").all<{ name: string }>();
  if (!travelAttachmentColumns.results.some((column: { name: string }) => column.name === "leg")) {
    await d1.prepare("ALTER TABLE travel_attachments ADD COLUMN leg TEXT NOT NULL DEFAULT 'general'").run();
  }

  const accommodationColumns = await d1.prepare("PRAGMA table_info(race_accommodations)").all<{ name: string }>();
  const existingAccommodationColumns = new Set(accommodationColumns.results.map((column: { name: string }) => column.name));
  const accommodationAdditions = [
    ["website_url", "ALTER TABLE race_accommodations ADD COLUMN website_url TEXT NOT NULL DEFAULT ''"],
    ["booking_url", "ALTER TABLE race_accommodations ADD COLUMN booking_url TEXT NOT NULL DEFAULT ''"],
    ["track_distance_km", "ALTER TABLE race_accommodations ADD COLUMN track_distance_km REAL"],
    ["track_drive_minutes", "ALTER TABLE race_accommodations ADD COLUMN track_drive_minutes INTEGER"],
  ].filter(([name]) => !existingAccommodationColumns.has(name));
  if (accommodationAdditions.length > 0) await d1.batch(accommodationAdditions.map(([, statement]) => d1.prepare(statement)));

  const saleColumns = await d1.prepare("PRAGMA table_info(sales)").all<{ name: string }>();
  const existingSaleColumns = new Set(saleColumns.results.map((column: { name: string }) => column.name));
  const saleAdditions = [
    ["race_id", "ALTER TABLE sales ADD COLUMN race_id TEXT"],
    ["customer_id", "ALTER TABLE sales ADD COLUMN customer_id TEXT"],
    ["team_id", "ALTER TABLE sales ADD COLUMN team_id TEXT"],
    ["payment_method", "ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'"],
    ["is_paid", "ALTER TABLE sales ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 0"],
    ["is_delivered", "ALTER TABLE sales ADD COLUMN is_delivered INTEGER NOT NULL DEFAULT 0"],
    ["voided_at", "ALTER TABLE sales ADD COLUMN voided_at INTEGER"],
    ["voided_by", "ALTER TABLE sales ADD COLUMN voided_by TEXT"],
  ].filter(([name]) => !existingSaleColumns.has(name));
  if (saleAdditions.length > 0) await d1.batch(saleAdditions.map(([, statement]) => d1.prepare(statement)));
  await d1.prepare("CREATE INDEX IF NOT EXISTS sales_race_idx ON sales (race_id, sale_date)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales (customer_id, sale_date)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS sales_team_idx ON sales (team_id, sale_date)").run();

  const saleItemColumns = await d1.prepare("PRAGMA table_info(sale_items)").all<{ name: string }>();
  const existingSaleItemColumns = new Set(saleItemColumns.results.map((column: { name: string }) => column.name));
  const saleItemAdditions = [
    ["line_kind", "ALTER TABLE sale_items ADD COLUMN line_kind TEXT NOT NULL DEFAULT ''"],
    ["description_en_snapshot", "ALTER TABLE sale_items ADD COLUMN description_en_snapshot TEXT NOT NULL DEFAULT ''"],
  ].filter(([name]) => !existingSaleItemColumns.has(name));
  if (saleItemAdditions.length > 0) await d1.batch(saleItemAdditions.map(([, statement]) => d1.prepare(statement)));

  const serviceColumns = await d1.prepare("PRAGMA table_info(service_catalog)").all<{ name: string }>();
  const existingServiceColumns = new Set(serviceColumns.results.map((column: { name: string }) => column.name));
  const serviceAdditions = [
    ["description_cs", "ALTER TABLE service_catalog ADD COLUMN description_cs TEXT NOT NULL DEFAULT ''"],
    ["description_en", "ALTER TABLE service_catalog ADD COLUMN description_en TEXT NOT NULL DEFAULT ''"],
  ].filter(([name]) => !existingServiceColumns.has(name));
  if (serviceAdditions.length > 0) await d1.batch(serviceAdditions.map(([, statement]) => d1.prepare(statement)));
  await d1.prepare("UPDATE service_catalog SET description_cs = description WHERE description_cs = '' AND description != ''").run();

  const inventoryColumns = await d1.prepare("PRAGMA table_info(inventory_parts)").all<{ name: string }>();
  const existingInventoryColumns = new Set(inventoryColumns.results.map((column: { name: string }) => column.name));
  const inventoryAdditions = [
    ["categories", "ALTER TABLE inventory_parts ADD COLUMN categories TEXT NOT NULL DEFAULT '[]'"],
    ["image_key", "ALTER TABLE inventory_parts ADD COLUMN image_key TEXT"],
    ["image_content_type", "ALTER TABLE inventory_parts ADD COLUMN image_content_type TEXT"],
    ["image_updated_at", "ALTER TABLE inventory_parts ADD COLUMN image_updated_at INTEGER"],
  ].filter(([name]) => !existingInventoryColumns.has(name));
  if (inventoryAdditions.length > 0) await d1.batch(inventoryAdditions.map(([, statement]) => d1.prepare(statement)));

  const deliveryColumns = await d1.prepare("PRAGMA table_info(race_deliveries)").all<{ name: string }>();
  if (!deliveryColumns.results.some((column: { name: string }) => column.name === "is_delivered")) {
    await d1.prepare("ALTER TABLE race_deliveries ADD COLUMN is_delivered INTEGER NOT NULL DEFAULT 0").run();
  }

  const clothingColumns = await d1.prepare("PRAGMA table_info(clothing_items)").all<{ name: string }>();
  const existingClothingColumns = new Set(clothingColumns.results.map((column: { name: string }) => column.name));
  const clothingAdditions = [
    ["image_key", "ALTER TABLE clothing_items ADD COLUMN image_key TEXT"],
    ["image_content_type", "ALTER TABLE clothing_items ADD COLUMN image_content_type TEXT"],
    ["image_updated_at", "ALTER TABLE clothing_items ADD COLUMN image_updated_at INTEGER"],
  ].filter(([name]) => !existingClothingColumns.has(name));
  if (clothingAdditions.length > 0) await d1.batch(clothingAdditions.map(([, statement]) => d1.prepare(statement)));

  const assignmentColumns = await d1.prepare("PRAGMA table_info(mechanic_clothing_assignments)").all<{ name: string }>();
  if (!assignmentColumns.results.some((column: { name: string }) => column.name === "assigned_at")) {
    await d1.prepare("ALTER TABLE mechanic_clothing_assignments ADD COLUMN assigned_at INTEGER NOT NULL DEFAULT 0").run();
  }
  await d1.prepare("UPDATE mechanic_clothing_assignments SET assigned_at = created_at WHERE assigned_at = 0").run();

  const vehiclesNeedingServiceBackfill = await d1.prepare(`
    SELECT v.id, v.last_service_km AS lastServiceKm, v.last_service_note AS lastServiceNote, v.last_service_date AS lastServiceDate, v.updated_at AS updatedAt, v.created_by AS createdBy
    FROM vehicles v
    WHERE v.last_service_km IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehicle_service_entries e WHERE e.vehicle_id = v.id)
  `).all<{ id: string; lastServiceKm: number; lastServiceNote: string; lastServiceDate: string; updatedAt: number; createdBy: string }>();
  const vehiclesToBackfill: Array<{ id: string; lastServiceKm: number; lastServiceNote: string; lastServiceDate: string; updatedAt: number; createdBy: string }> = vehiclesNeedingServiceBackfill.results;
  if (vehiclesToBackfill.length > 0) {
    await d1.batch(vehiclesToBackfill.map((vehicle) => {
      const serviceDate = vehicle.lastServiceDate || new Date(vehicle.updatedAt).toISOString().slice(0, 10);
      return d1.prepare("INSERT INTO vehicle_service_entries (id, vehicle_id, service_date, km, work_done, mechanic_id, mechanic_name_snapshot, created_by, created_at) VALUES (?, ?, ?, ?, ?, NULL, '', ?, ?)")
        .bind(crypto.randomUUID(), vehicle.id, serviceDate, vehicle.lastServiceKm, vehicle.lastServiceNote || "", vehicle.createdBy, vehicle.updatedAt);
    }));
  }
}

async function ensureEngineCodeCategoryIndex(d1: ReturnType<typeof getD1>) {
  const indexes = await d1.prepare("PRAGMA index_list(engines)").all<{ name: string }>();
  if (indexes.results.some((index) => index.name === "engines_code_category_unique")) return;

  const table = await d1.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'engines'").first<{ sql: string }>();
  const hasInlineCodeUnique = /[\"`]?code[\"`]?\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(table?.sql ?? "");

  if (hasInlineCodeUnique) {
    await d1.batch([
      d1.prepare("DROP TABLE IF EXISTS engines_category_scope_migration"),
      d1.prepare(`
        CREATE TABLE engines_category_scope_migration (
          id TEXT PRIMARY KEY NOT NULL,
          code TEXT NOT NULL,
          serial_number TEXT NOT NULL DEFAULT '',
          brand TEXT NOT NULL,
          model TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT '',
          family TEXT NOT NULL DEFAULT 'OKN',
          ignition TEXT NOT NULL DEFAULT 'PVL',
          kz_generation TEXT,
          current_configuration TEXT,
          upgrade_code TEXT NOT NULL DEFAULT '',
          label_color TEXT NOT NULL DEFAULT '',
          purchase_date TEXT,
          piston_spec TEXT NOT NULL DEFAULT '',
          cylinder_code TEXT NOT NULL DEFAULT '',
          cylinder_upgrade TEXT NOT NULL DEFAULT '',
          liner TEXT NOT NULL DEFAULT '',
          degree TEXT NOT NULL DEFAULT '',
          timing TEXT NOT NULL DEFAULT '',
          carter TEXT NOT NULL DEFAULT '',
          reeds TEXT NOT NULL DEFAULT '',
          spacer TEXT NOT NULL DEFAULT '',
          squish TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'service_soon', 'service', 'rebuild', 'storage', 'retired')),
          total_minutes INTEGER NOT NULL DEFAULT 0,
          piston_minutes INTEGER NOT NULL DEFAULT 0,
          rod_minutes INTEGER NOT NULL DEFAULT 0,
          last_oppama_minutes INTEGER NOT NULL DEFAULT 0,
          current_piston_size TEXT NOT NULL DEFAULT '',
          baseline_total_minutes INTEGER NOT NULL DEFAULT 0,
          baseline_piston_minutes INTEGER NOT NULL DEFAULT 0,
          baseline_rod_minutes INTEGER NOT NULL DEFAULT 0,
          baseline_last_oppama_minutes INTEGER NOT NULL DEFAULT 0,
          baseline_piston_size TEXT NOT NULL DEFAULT '',
          service_interval_minutes INTEGER NOT NULL DEFAULT 360,
          notes TEXT NOT NULL DEFAULT '',
          sold_at INTEGER,
          archived_at INTEGER,
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `),
      d1.prepare(`
        INSERT INTO engines_category_scope_migration (
          id, code, serial_number, brand, model, category, family, ignition,
          kz_generation, current_configuration, upgrade_code, label_color, purchase_date,
          piston_spec, cylinder_code, cylinder_upgrade, liner, degree, timing, carter, reeds, spacer, squish,
          status, total_minutes, piston_minutes, rod_minutes, last_oppama_minutes, current_piston_size,
          baseline_total_minutes, baseline_piston_minutes, baseline_rod_minutes,
          baseline_last_oppama_minutes, baseline_piston_size, service_interval_minutes,
          notes, sold_at, archived_at, created_by, created_at, updated_at
        )
        SELECT
          id, code, serial_number, brand, model,
          CASE
            WHEN family = 'MINI' AND UPPER(COALESCE(current_configuration, '')) LIKE 'BABY%' THEN 'BABY'
            WHEN family = 'MINI' THEN 'MINI'
            WHEN family IN ('OKN', 'OKN-J') THEN 'OKN'
            ELSE COALESCE(NULLIF(family, ''), category)
          END,
          family, ignition, kz_generation, current_configuration, upgrade_code, label_color, purchase_date,
          piston_spec, cylinder_code, cylinder_upgrade, liner, degree, timing, carter, reeds, spacer, squish,
          status, total_minutes, piston_minutes, rod_minutes, last_oppama_minutes, current_piston_size,
          baseline_total_minutes, baseline_piston_minutes, baseline_rod_minutes,
          baseline_last_oppama_minutes, baseline_piston_size, service_interval_minutes,
          notes, sold_at, archived_at, created_by, created_at, updated_at
        FROM engines
      `),
      d1.prepare("DROP TABLE engines"),
      d1.prepare("ALTER TABLE engines_category_scope_migration RENAME TO engines"),
    ]);
  } else {
    await d1.prepare("DROP INDEX IF EXISTS engines_code_unique").run();
    await d1.prepare(`
      UPDATE engines
      SET category = CASE
        WHEN family = 'MINI' AND UPPER(COALESCE(current_configuration, '')) LIKE 'BABY%' THEN 'BABY'
        WHEN family = 'MINI' THEN 'MINI'
        WHEN family IN ('OKN', 'OKN-J') THEN 'OKN'
        ELSE COALESCE(NULLIF(family, ''), category)
      END
    `).run();
  }

  await d1.batch([
    d1.prepare("DROP INDEX IF EXISTS engines_code_category_unique"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS engines_code_category_unique ON engines (code, category) WHERE archived_at IS NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engines_status_idx ON engines (status)"),
  ]);
}

// carburetors.code and race_templates.name were originally declared with an inline
// UNIQUE column constraint, which (unlike a partial index) can't be scoped to
// active rows only — archiving a record and reusing its code/name would still be
// rejected. Rebuild each table without the inline constraint, same approach as
// ensureEngineCodeCategoryIndex above, then replace it with a partial unique index.
async function ensureArchivedScopedUniqueness(d1: ReturnType<typeof getD1>) {
  const carburetorsTable = await d1.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'carburetors'").first<{ sql: string }>();
  if (/code\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(carburetorsTable?.sql ?? "")) {
    await d1.batch([
      d1.prepare("DROP TABLE IF EXISTS carburetors_scope_migration"),
      d1.prepare(`
        CREATE TABLE carburetors_scope_migration (
          id TEXT PRIMARY KEY NOT NULL,
          code TEXT NOT NULL,
          carburetor_type_id TEXT,
          category TEXT NOT NULL DEFAULT '',
          family TEXT NOT NULL,
          brand TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'ready',
          notes TEXT NOT NULL DEFAULT '',
          sold_at INTEGER,
          archived_at INTEGER,
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `),
      d1.prepare(`
        INSERT INTO carburetors_scope_migration (
          id, code, carburetor_type_id, category, family, brand, model, status,
          notes, sold_at, archived_at, created_by, created_at, updated_at
        )
        SELECT id, code, carburetor_type_id, category, family, brand, model, status,
          notes, sold_at, archived_at, created_by, created_at, updated_at
        FROM carburetors
      `),
      d1.prepare("DROP TABLE carburetors"),
      d1.prepare("ALTER TABLE carburetors_scope_migration RENAME TO carburetors"),
    ]);
  }
  await d1.batch([
    d1.prepare("DROP INDEX IF EXISTS carburetors_code_unique"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS carburetors_code_unique ON carburetors (code) WHERE archived_at IS NULL"),
  ]);

  const raceTemplatesTable = await d1.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'race_templates'").first<{ sql: string }>();
  if (/name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(raceTemplatesTable?.sql ?? "")) {
    await d1.batch([
      d1.prepare("DROP TABLE IF EXISTS race_templates_scope_migration"),
      d1.prepare(`
        CREATE TABLE race_templates_scope_migration (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          calendar_color TEXT NOT NULL DEFAULT 'sky',
          logo_key TEXT,
          logo_content_type TEXT,
          logo_updated_at INTEGER,
          archived_at INTEGER,
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `),
      d1.prepare(`
        INSERT INTO race_templates_scope_migration (
          id, name, notes, calendar_color, logo_key, logo_content_type, logo_updated_at,
          archived_at, created_by, created_at, updated_at
        )
        SELECT id, name, notes, calendar_color, logo_key, logo_content_type, logo_updated_at,
          archived_at, created_by, created_at, updated_at
        FROM race_templates
      `),
      d1.prepare("DROP TABLE race_templates"),
      d1.prepare("ALTER TABLE race_templates_scope_migration RENAME TO race_templates"),
    ]);
  }
  await d1.batch([
    d1.prepare("DROP INDEX IF EXISTS race_templates_name_unique"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS race_templates_name_unique ON race_templates (name) WHERE archived_at IS NULL"),
  ]);
}
