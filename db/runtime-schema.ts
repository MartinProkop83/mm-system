import { getD1 } from "./index";
import { generatePublicCode } from "../app/engine-public-code";

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
        replaced_parts_snapshot TEXT NOT NULL DEFAULT '[]',
        piston_size TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        piston_minutes_before INTEGER NOT NULL DEFAULT 0,
        rod_minutes_before INTEGER NOT NULL DEFAULT 0,
        mechanic_id TEXT,
        mechanic_name_snapshot TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_service_part_catalog (
        id TEXT PRIMARY KEY NOT NULL,
        family TEXT NOT NULL,
        part_key TEXT NOT NULL,
        label_cs TEXT NOT NULL,
        label_en TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_loans (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        recipient_type TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        recipient_name_snapshot TEXT NOT NULL,
        start_date TEXT NOT NULL,
        expected_return_date TEXT NOT NULL,
        actual_return_date TEXT,
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_technical_layout (
        family TEXT PRIMARY KEY NOT NULL,
        column_count INTEGER NOT NULL DEFAULT 3,
        updated_by TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_technical_sections (
        id TEXT PRIMARY KEY NOT NULL,
        family TEXT NOT NULL,
        label_cs TEXT NOT NULL,
        label_en TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_technical_fields (
        id TEXT PRIMARY KEY NOT NULL,
        section_id TEXT NOT NULL,
        label_cs TEXT NOT NULL,
        label_en TEXT NOT NULL,
        field_type TEXT NOT NULL,
        show_on_overview INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_technical_field_options (
        id TEXT PRIMARY KEY NOT NULL,
        field_id TEXT NOT NULL,
        value_cs TEXT NOT NULL,
        value_en TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_technical_values (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        field_id TEXT NOT NULL,
        value TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // --- Servisní karta (Nastavení → Servisní karta) -------------------------------
    // Engine categories mirror the `engines.family` codes (MINI / OKJ / OKN / OKN-J / OK / KZ)
    // — `code` is the join key, so `engines` itself needs no new column. `counter_unit NULL`
    // means the category has no running-hours counter at all: every interval / warning /
    // tile-colour rule is skipped for it, in the API and in the UI. Flipping it from NULL to
    // 'hours' later is a pure settings change, no migration.
    // Fronta motorů čekajících na servis se nikam neukládá — dopočítává se ze skončených závodů
    // a vrácených zápůjček. Ukládá se jen její OPAK: že už je daný pobyt ve frontě vyřízený.
    // Stejný vzor jako engine_auto_service_log: unique klíč na (motor, zdroj) a ON CONFLICT
    // DO NOTHING, takže opakované vyřízení téže položky nic nepokazí.
    //
    // `resolution` rozlišuje, jak se to stalo: 'serviced' = vznikl servisní záznam (jeho id je
    // v service_record_id), 'skipped' = mechanik odklikl „Nejel / bez servisu". U obojího víme,
    // kdo a kdy — právě kvůli tomu druhému případu, kde jinak nezůstane žádná stopa.
    // Ruční zařazení motoru do fronty — mimo závod i zápůjčku. Mechanik nejčastěji pozná,
    // že něco není v pořádku („divný zvuk", „kontrola po pádu"), proto to smí kdokoli přihlášený.
    // Poznámka je povinná: bez ní by ostatní nevěděli, co na motoru hledat.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_service_queue_manual (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        note TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    // Co na závodě reálně jelo. Přiřazení motoru k pilotovi říká jen to, co se naložilo do
    // dodávky — náhradní motor zůstane celý víkend ve voze a servis nepotřebuje. Tohle je
    // záznam z place: `raced = 0` znamená „nejel".
    //
    // Pravidlo je schválně po kusech, ne po závodě: z fronty vypadne jen motor s výslovným
    // „nejel". Nedodělané potvrzování na place je pravděpodobné a nesmí ztratit motory,
    // ke kterým se nikdo nedostal.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_engine_runs (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        race_entry_id TEXT NOT NULL,
        engine_id TEXT NOT NULL,
        raced INTEGER NOT NULL DEFAULT 1,
        recorded_by TEXT NOT NULL,
        recorded_at INTEGER NOT NULL
      )
    `),
    // Obecné nastavení aplikace jako klíč/hodnota. Záměrně není pro jednu věc: první je
    // základní adresa pro QR kódy, ale stejným způsobem sem půjde cokoli dalšího, co se
    // nastavuje jednou a platí pro celý systém.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      )
    `),
    // Rozpracovaný motor — mechanik si ho zabere tlačítkem „Beru si ho", aby se na jednom
    // motoru nesešli dva. Výlučnost hlídá částečný unikátní index níž (`released_at IS NULL`),
    // ne aplikace: dvě současná kliknutí by jinak obě prošla kontrolou „je volný?".
    //
    // Historie zabrání se nemaže — `released_at` jen uzavře pobyt, takže jde zpětně dohledat,
    // kdo na motoru kdy dělal. `release_reason` odlišuje vrácení do fronty od automatického
    // uvolnění při uložení servisu.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_service_claims (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        claimed_by TEXT NOT NULL,
        claimed_by_name TEXT NOT NULL,
        claimed_mechanic_id TEXT,
        claimed_at INTEGER NOT NULL,
        released_at INTEGER,
        released_by TEXT,
        release_reason TEXT NOT NULL DEFAULT '' CHECK (release_reason IN ('', 'manual', 'service'))
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_service_queue_resolutions (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('race', 'loan', 'manual')),
        source_id TEXT NOT NULL,
        resolution TEXT NOT NULL CHECK (resolution IN ('serviced', 'skipped')),
        service_record_id TEXT,
        resolved_by TEXT NOT NULL,
        resolved_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_categories (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL,
        name_cs TEXT NOT NULL,
        name_en TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        counter_unit TEXT CHECK (counter_unit IN ('hours', 'days', 'race_weekends')),
        service_card_migrated INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_types (
        id TEXT PRIMARY KEY NOT NULL,
        engine_category_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name_cs TEXT NOT NULL,
        name_en TEXT NOT NULL,
        description_cs TEXT NOT NULL DEFAULT '',
        description_en TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Which card items a service type pre-ticks. Flat link table on purpose — there is no
    // inheritance between types (1.D does NOT extend 1.C); each type carries its own full list.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_type_default_items (
        id TEXT PRIMARY KEY NOT NULL,
        service_type_id TEXT NOT NULL,
        service_card_item_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    // `legacy_part_key` carries the old engine_service_part_catalog.part_key so historic
    // engine_service_entries rows (which reference parts by that key, not by id) can be
    // matched to the item they became. Null for items created from scratch in the new UI.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_card_items (
        id TEXT PRIMARY KEY NOT NULL,
        engine_category_id TEXT NOT NULL,
        name_cs TEXT NOT NULL,
        name_en TEXT NOT NULL,
        material_category_id TEXT,
        interval_minutes INTEGER,
        warn_percent INTEGER NOT NULL DEFAULT 80,
        legacy_part_key TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS material_categories (
        id TEXT PRIMARY KEY NOT NULL,
        engine_category_id TEXT NOT NULL,
        name_cs TEXT NOT NULL,
        name_en TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Attributes belong to a material category, not to the catalogue as a whole — pistons have
    // a brand and a size, gaskets a type and a thickness. `options` is a JSON string array and
    // only carries anything for attribute_type = 'dropdown'.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS material_attributes (
        id TEXT PRIMARY KEY NOT NULL,
        material_category_id TEXT NOT NULL,
        name_cs TEXT NOT NULL,
        name_en TEXT NOT NULL,
        attribute_type TEXT NOT NULL DEFAULT 'text' CHECK (attribute_type IN ('dropdown', 'number', 'text')),
        unit TEXT NOT NULL DEFAULT '',
        options TEXT NOT NULL DEFAULT '[]',
        technical_field_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // A ready-made variant is the only thing a mechanic ever picks — they never type attribute
    // values by hand, which is what keeps "0.3" / "0,3" / "0.30 mm" out of the data.
    // `attribute_values` is a JSON map of material_attributes.id → value.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS material_variants (
        id TEXT PRIMARY KEY NOT NULL,
        material_category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        attribute_values TEXT NOT NULL DEFAULT '{}',
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // `service_date` is when the work happened (entered by the mechanic, possibly backdated);
    // `created_at` is when it was typed in. They are deliberately separate, and history sorts
    // by service_date. `counter_minutes` is a snapshot of engines.total_minutes at write time
    // and stays NULL for categories without a counter — such rows are skipped (not treated as
    // zero) when computing "run since replacement". Cancelled rows keep cancelled_at set and
    // are never deleted.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_records (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        service_type_id TEXT,
        service_type_snapshot TEXT NOT NULL DEFAULT '',
        service_date TEXT NOT NULL,
        service_time TEXT NOT NULL DEFAULT '',
        counter_minutes INTEGER,
        mechanic_id TEXT,
        mechanic_name_snapshot TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        cancelled_reason TEXT NOT NULL DEFAULT '',
        cancelled_at INTEGER,
        cancelled_by TEXT NOT NULL DEFAULT '',
        import_source TEXT NOT NULL DEFAULT '',
        divergence_note TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Snapshots are mandatory: history is read from item_name_*_snapshot and material_snapshot
    // first, so renaming an item or archiving a variant in settings a year from now can neither
    // rewrite nor break what was recorded. The foreign keys are kept only for live lookups.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_record_items (
        id TEXT PRIMARY KEY NOT NULL,
        service_record_id TEXT NOT NULL,
        service_card_item_id TEXT,
        item_name_cs_snapshot TEXT NOT NULL,
        item_name_en_snapshot TEXT NOT NULL,
        material_variant_id TEXT,
        material_snapshot TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `),
    // Historie změn technických údajů. `engine_technical_values` drží jen poslední hodnotu —
    // předchozí se přepíše, takže bez tohohle logu nejde zpětně zjistit, co na motoru bylo.
    //
    // Hodnoty se ukládají jako ČITELNÝ TEXT, ne jako id volby: pole typu „výběr" drží
    // v `engine_technical_values.value` id z `engine_technical_field_options`, a to by se po
    // archivaci volby stalo nedohledatelným. Ze stejného důvodu se snapshotuje i název pole.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_technical_value_changes (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        field_id TEXT,
        field_label_cs TEXT NOT NULL,
        field_label_en TEXT NOT NULL,
        old_value TEXT NOT NULL DEFAULT '',
        new_value TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'service')),
        service_record_id TEXT,
        changed_by TEXT NOT NULL,
        changed_at INTEGER NOT NULL
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
        sort_order INTEGER NOT NULL DEFAULT 0,
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
      CREATE TABLE IF NOT EXISTS race_checklists (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        checklist_id TEXT,
        vehicle_id TEXT,
        vehicle_name_snapshot TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_checklist_items (
        id TEXT PRIMARY KEY NOT NULL,
        race_checklist_id TEXT NOT NULL,
        section TEXT NOT NULL DEFAULT '',
        part_number TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        is_checked INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0
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
      CREATE TABLE IF NOT EXISTS race_team_visits (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        team_id TEXT,
        team_name TEXT NOT NULL,
        driver_id TEXT,
        driver_name TEXT NOT NULL DEFAULT '',
        item_type TEXT NOT NULL DEFAULT 'part' CHECK (item_type IN ('part', 'service', 'stock', 'oil', 'other')),
        resource_id TEXT,
        description TEXT NOT NULL DEFAULT '',
        quantity INTEGER NOT NULL DEFAULT 1,
        visit_date TEXT NOT NULL DEFAULT '',
        mechanic_id TEXT,
        mechanic_name TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR')),
        amount_cents INTEGER,
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
    // Parkování na letišti k letence — 1:N, protože u jedné cesty může výjimečně
    // parkovat víc auct (`vehicle_or_driver` je pak odliší). Bez `archived_at`: při úpravě
    // letenky se všechny řádky smažou a znovu vloží podle toho, co se právě odeslalo
    // (stejný vzor jako `service_record_items`), a při smazání letenky zmizí s ní.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS race_flight_parking (
        id TEXT PRIMARY KEY NOT NULL,
        flight_id TEXT NOT NULL,
        vehicle_or_driver TEXT NOT NULL DEFAULT '',
        airport TEXT NOT NULL,
        parking_from TEXT NOT NULL,
        parking_to TEXT NOT NULL DEFAULT '',
        price_czk_cents INTEGER NOT NULL DEFAULT 0,
        price_eur_cents INTEGER NOT NULL DEFAULT 0,
        reservation_code TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
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
    // Číselník typů dokumentů u motoru — správcovský, ne natvrdo v kódu, aby šel v Nastavení
    // rozšířit o další typ bez zásahu do kódu. `hand_over_to_buyer` je jen příznak; samotné
    // předávání dokumentů kupci je zatím druhý, neimplementovaný krok — bez něj se chová
    // u prodaného motoru úplně stejně jako u jakéhokoli jiného.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_document_types (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL,
        name_cs TEXT NOT NULL,
        name_en TEXT NOT NULL,
        hand_over_to_buyer INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Dokumenty motoru: faktura, homologace, fotodokumentace a podobně. Binárka jde do R2
    // (`getAssetsBucket()`), tady jen metadata — stejný vzor jako `travel_attachments`.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_documents (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        document_type_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        object_key TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
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
    // ——— Zakázkový servis pro zákazníky ———
    //
    // Zákaznické motory ZÁMĚRNĚ nejsou v `engines`. Naše motory se přiřazují na závody a do
    // servisní karty s dlaždicemi; zákaznický motor nic z toho nemá a nikdy mít nesmí. Vlastní
    // tabulka je jediná pojistka, která to drží — proto se `customer_engines` nesmí objevit
    // v žádné routě, která pracuje se závody nebo se sekcí Motory (hlídá to test v tests/).
    //
    // Peníze všude jako `*_czk_cents` / `*_eur_cents` (celé koruny a eura se zadávají v UI),
    // slevy jako celá procenta 0–100.

    // Typy motorů pro servis. Vlastní číselník, nezávislý na `engine_categories` — budou v něm
    // i motokros a věci, které v našich kategoriích nejsou. Neseeduje se, plní se v Nastavení.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_engine_types (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL,
        name_cs TEXT NOT NULL,
        name_en TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Ceník prací. Ceny jsou bez DPH a v obou měnách natvrdo — kurzem se nikdy nepřepočítávají.
    // `group_name` je volný text (v UI s našeptávačem z už použitých skupin), ne číselník.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_price_items (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL,
        name_cs TEXT NOT NULL,
        name_en TEXT NOT NULL,
        material_included_cs TEXT NOT NULL DEFAULT '',
        material_included_en TEXT NOT NULL DEFAULT '',
        price_czk_cents INTEGER NOT NULL DEFAULT 0,
        price_eur_cents INTEGER NOT NULL DEFAULT 0,
        group_name TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Zákaznický motor. Zůstává v systému napořád, i po vydání — při další návštěvě se na něj
    // naváže historie. `archived_at` je jen ruční východisko pro překlep ve výrobním čísle,
    // nic ho nenastavuje automaticky.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS customer_engines (
        id TEXT PRIMARY KEY NOT NULL,
        customer_id TEXT NOT NULL,
        code TEXT NOT NULL,
        service_engine_type_id TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Zakázka. `number` je ve tvaru SERVIS_26-001 a pořadí se každý leden vrací na 001.
    // Doprava je vedená na zakázce jako „poslední zásilka“ — u částečného odeslání se rozdíl
    // dopisuje do poznámky, po motorech se nerozpadá.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_orders (
        id TEXT PRIMARY KEY NOT NULL,
        number TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR')),
        discount_work_percent INTEGER NOT NULL DEFAULT 0,
        discount_material_percent INTEGER NOT NULL DEFAULT 0,
        received_at TEXT NOT NULL,
        deadline_date TEXT NOT NULL DEFAULT '',
        deadline_note TEXT NOT NULL DEFAULT '',
        customer_note TEXT NOT NULL DEFAULT '',
        internal_note TEXT NOT NULL DEFAULT '',
        handover_type TEXT NOT NULL DEFAULT 'personal' CHECK (handover_type IN ('personal', 'carrier', 'race')),
        carrier TEXT NOT NULL DEFAULT '',
        tracking_number TEXT NOT NULL DEFAULT '',
        shipping_price_czk_cents INTEGER NOT NULL DEFAULT 0,
        shipping_price_eur_cents INTEGER NOT NULL DEFAULT 0,
        shipped_at TEXT NOT NULL DEFAULT '',
        invoiced_at INTEGER,
        unlocked_at INTEGER,
        unlocked_by TEXT NOT NULL DEFAULT '',
        cancelled_at INTEGER,
        cancelled_by TEXT NOT NULL DEFAULT '',
        cancelled_reason TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Motor na zakázce. Stav je na motoru, ne na zakázce — tři můžou být hotové a tři čekat
    // na díl. `taken_by*` zastupuje zabrání z naší fronty: zákaznický motor nemá řádek
    // v `engine_service_claims`, protože ten sloupec `engine_id` míří do `engines`.
    // `engine_minutes` jsou motohodiny při příjmu (NULL = nezadané), v UI se píšou jako HH:MM.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_order_engines (
        id TEXT PRIMARY KEY NOT NULL,
        order_id TEXT NOT NULL,
        customer_engine_id TEXT NOT NULL,
        engine_minutes INTEGER,
        scope TEXT NOT NULL DEFAULT '',
        carb_service INTEGER NOT NULL DEFAULT 0,
        customer_parts INTEGER NOT NULL DEFAULT 0,
        customer_parts_text TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_progress', 'waiting_part', 'done', 'checked', 'handed_over')),
        taken_by TEXT NOT NULL DEFAULT '',
        taken_by_name TEXT NOT NULL DEFAULT '',
        taken_at INTEGER,
        completed_by TEXT NOT NULL DEFAULT '',
        completed_by_name TEXT NOT NULL DEFAULT '',
        completed_at INTEGER,
        checked_by TEXT NOT NULL DEFAULT '',
        checked_at INTEGER,
        handed_over_at INTEGER,
        reopened_at INTEGER,
        reopened_by TEXT NOT NULL DEFAULT '',
        reopen_reason TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Provedené práce. Kód, název i obě ceny se snapshotují při zápisu — pozdější úprava
    // ceníku nikdy nepřepíše, co bylo na zakázce účtováno.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_order_works (
        id TEXT PRIMARY KEY NOT NULL,
        order_engine_id TEXT NOT NULL,
        price_item_id TEXT,
        code_snapshot TEXT NOT NULL DEFAULT '',
        name_cs_snapshot TEXT NOT NULL,
        name_en_snapshot TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price_czk_cents INTEGER NOT NULL DEFAULT 0,
        unit_price_eur_cents INTEGER NOT NULL DEFAULT 0,
        discount_percent INTEGER NOT NULL DEFAULT 0,
        total_czk_cents INTEGER NOT NULL DEFAULT 0,
        total_eur_cents INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_by_name TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Použitý materiál. `source = 'customer'` je díl, který přivezl zákazník — účtuje se nulou,
    // ale v seznamu zůstává, ať je doložené, co se do motoru dalo.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_order_materials (
        id TEXT PRIMARY KEY NOT NULL,
        order_engine_id TEXT NOT NULL,
        inventory_part_id TEXT,
        code TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price_czk_cents INTEGER NOT NULL DEFAULT 0,
        unit_price_eur_cents INTEGER NOT NULL DEFAULT 0,
        discount_percent INTEGER NOT NULL DEFAULT 0,
        total_czk_cents INTEGER NOT NULL DEFAULT 0,
        total_eur_cents INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'stock' CHECK (source IN ('stock', 'customer')),
        created_by TEXT NOT NULL,
        created_by_name TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Čekání na díl. `is_ordered` odlišuje „čekáme na díl“ od „díl je objednaný, přijde ve
    // čtvrtek“ — jsou to dvě různé situace. `arrived_at` vrací motor jedním kliknutím do práce.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_order_waiting_parts (
        id TEXT PRIMARY KEY NOT NULL,
        order_engine_id TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        price_czk_cents INTEGER NOT NULL DEFAULT 0,
        price_eur_cents INTEGER NOT NULL DEFAULT 0,
        expected_date TEXT NOT NULL DEFAULT '',
        is_ordered INTEGER NOT NULL DEFAULT 0,
        arrived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    // Fotky při příjmu. Binárka do R2, tady jen metadata — stejný vzor jako `engine_documents`.
    // `order_engine_id` je nepovinné: u zakázky na šest motorů se fotka váže ke konkrétnímu
    // kusu, jinak zůstává u zakázky jako celku.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_order_photos (
        id TEXT PRIMARY KEY NOT NULL,
        order_id TEXT NOT NULL,
        order_engine_id TEXT,
        file_name TEXT NOT NULL,
        object_key TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    // Trvalá evidence vydaných čísel zakázek — nezávislá na životě samotné zakázky. Zakázka
    // se dá po 30 dnech v koši skutečně vymazat (viz purgeExpiredTrash), ale číslo, které
    // jednou neslo, se nesmí přiřadit znovu. `nextOrderNumber()` proto počítá MAX z týhle
    // tabulky, ne z `service_orders` — ta se v čase koše zmenšuje, tahle ne.
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS service_order_numbers (
        number TEXT PRIMARY KEY NOT NULL,
        order_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS checklists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        archived_at INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS checklist_items (
        id TEXT PRIMARY KEY NOT NULL,
        checklist_id TEXT NOT NULL,
        section TEXT NOT NULL DEFAULT '',
        part_number TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS engine_auto_service_log (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        race_id TEXT NOT NULL,
        race_name_snapshot TEXT NOT NULL DEFAULT '',
        applied_at INTEGER NOT NULL
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
    d1.prepare("CREATE INDEX IF NOT EXISTS race_team_visits_race_idx ON race_team_visits (race_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_accommodations_race_idx ON race_accommodations (race_id, check_in_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_flights_race_idx ON race_flights (race_id, departure_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_flight_parking_flight_idx ON race_flight_parking (flight_id, sort_order)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_car_rentals_race_idx ON race_car_rentals (race_id, pickup_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS travel_attachments_entity_idx ON travel_attachments (entity_type, entity_id, created_at)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS engine_document_types_code_unique_idx ON engine_document_types (code)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_documents_engine_idx ON engine_documents (engine_id, created_at)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS service_engine_types_code_unique_idx ON service_engine_types (code) WHERE archived_at IS NULL"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS service_price_items_code_unique_idx ON service_price_items (code) WHERE archived_at IS NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_price_items_group_idx ON service_price_items (group_name, sort_order)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS customer_engines_code_unique_idx ON customer_engines (code) WHERE archived_at IS NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS customer_engines_customer_idx ON customer_engines (customer_id, code)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS service_orders_number_unique_idx ON service_orders (number)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_orders_customer_idx ON service_orders (customer_id, received_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_order_engines_order_idx ON service_order_engines (order_id, sort_order)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_order_engines_status_idx ON service_order_engines (status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_order_engines_engine_idx ON service_order_engines (customer_engine_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_order_works_engine_idx ON service_order_works (order_engine_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_order_materials_engine_idx ON service_order_materials (order_engine_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_order_waiting_parts_engine_idx ON service_order_waiting_parts (order_engine_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_order_photos_order_idx ON service_order_photos (order_id, created_at)"),
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
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS checklists_name_unique_idx ON checklists (LOWER(name)) WHERE archived_at IS NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS checklist_items_checklist_idx ON checklist_items (checklist_id, sort_order)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_checklists_race_idx ON race_checklists (race_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_checklist_items_checklist_idx ON race_checklist_items (race_checklist_id, sort_order)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS engine_auto_service_log_unique_idx ON engine_auto_service_log (engine_id, race_id)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS engine_service_part_catalog_family_key_idx ON engine_service_part_catalog (family, part_key) WHERE archived_at IS NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_service_part_catalog_family_idx ON engine_service_part_catalog (family, sort_order) WHERE archived_at IS NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_loans_engine_idx ON engine_loans (engine_id, actual_return_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_technical_sections_family_idx ON engine_technical_sections (family, sort_order)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_technical_fields_section_idx ON engine_technical_fields (section_id, sort_order)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_technical_field_options_field_idx ON engine_technical_field_options (field_id, sort_order)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS engine_technical_values_unique_idx ON engine_technical_values (engine_id, field_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_technical_values_field_idx ON engine_technical_values (field_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_technical_value_changes_engine_idx ON engine_technical_value_changes (engine_id, changed_at)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS engine_categories_code_unique_idx ON engine_categories (code)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS engine_service_queue_resolutions_unique_idx ON engine_service_queue_resolutions (engine_id, source_type, source_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_service_queue_resolutions_engine_idx ON engine_service_queue_resolutions (engine_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_service_queue_manual_engine_idx ON engine_service_queue_manual (engine_id, created_at)"),
    // Na motoru dělá vždycky jeden: částečný unikátní index nedovolí druhé nezavřené zabrání.
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS engine_service_claims_active_idx ON engine_service_claims (engine_id) WHERE released_at IS NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_service_claims_engine_idx ON engine_service_claims (engine_id, claimed_at)"),
    // Jeden motor má na jednom závodě jeden výsledek — dvojí ťuknutí na place nevyrobí dva řádky.
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS race_engine_runs_unique_idx ON race_engine_runs (race_id, engine_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_engine_runs_race_idx ON race_engine_runs (race_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_types_category_idx ON service_types (engine_category_id, sort_order)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS service_types_category_code_unique_idx ON service_types (engine_category_id, code) WHERE archived_at IS NULL"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS service_type_default_items_unique_idx ON service_type_default_items (service_type_id, service_card_item_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_card_items_category_idx ON service_card_items (engine_category_id, sort_order)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_card_items_material_idx ON service_card_items (material_category_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS material_categories_category_idx ON material_categories (engine_category_id, sort_order)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS material_attributes_category_idx ON material_attributes (material_category_id, sort_order)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS material_variants_category_idx ON material_variants (material_category_id, name)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_records_engine_idx ON service_records (engine_id, service_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_records_type_idx ON service_records (service_type_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_record_items_record_idx ON service_record_items (service_record_id, sort_order)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS service_record_items_card_item_idx ON service_record_items (service_card_item_id)"),
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

  const technicalFieldColumns = await d1.prepare("PRAGMA table_info(engine_technical_fields)").all<{ name: string }>();
  if (!technicalFieldColumns.results.some((column: { name: string }) => column.name === "legacy_key")) {
    await d1.prepare("ALTER TABLE engine_technical_fields ADD COLUMN legacy_key TEXT").run();
  }

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
    ["sort_order", "ALTER TABLE race_entries ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"],
  ].filter(([name]) => !existingRaceEntryColumns.has(name));
  if (raceEntryAdditions.length > 0) await d1.batch(raceEntryAdditions.map(([, statement]) => d1.prepare(statement)));
  if (!existingRaceEntryColumns.has("sort_order")) {
    const entryOrderRows = await d1.prepare("SELECT id FROM race_entries ORDER BY race_id, category, driver_name_snapshot").all<{ id: string }>();
    const entryOrder: Array<{ id: string }> = entryOrderRows.results;
    if (entryOrder.length > 0) {
      await d1.batch(entryOrder.map((row, index) => d1.prepare("UPDATE race_entries SET sort_order = ? WHERE id = ?").bind(index, row.id)));
    }
  }
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
    ["customer_id", "ALTER TABLE teams ADD COLUMN customer_id TEXT"],
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
    ["billing_mode", "ALTER TABLE drivers ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'self'"],
    ["customer_id", "ALTER TABLE drivers ADD COLUMN customer_id TEXT"],
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

  // Parkování na letišti krátce žilo jako 7 plochých parking_* sloupců přímo na
  // race_flights, než vyšlo najevo, že u jedné cesty může výjimečně parkovat víc auct —
  // to už se ploché sloupce neunesou. Nikdy se do nich nic neuložilo, takže žádná
  // konverze dat, jen úklid. `d1.batch` běží jako jedna transakce: spadne-li kterýkoli
  // DROP COLUMN, vrátí se všech 7 zpátky, ne že by půlka zmizela a půlka zůstala.
  const legacyFlightParkingColumns = [
    "parking_airport", "parking_from", "parking_to", "parking_price_czk_cents",
    "parking_price_eur_cents", "parking_reservation_code", "parking_note",
  ].filter((name) => existingFlightColumns.has(name));
  if (legacyFlightParkingColumns.length > 0) {
    await d1.batch(legacyFlightParkingColumns.map((name) => d1.prepare(`ALTER TABLE race_flights DROP COLUMN ${name}`)));
  }

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

  const visitColumns = await d1.prepare("PRAGMA table_info(race_team_visits)").all<{ name: string }>();
  const existingVisitColumns = new Set(visitColumns.results.map((column: { name: string }) => column.name));
  if (!existingVisitColumns.has("visit_date")) {
    await d1.prepare("ALTER TABLE race_team_visits ADD COLUMN visit_date TEXT NOT NULL DEFAULT ''").run();
    await d1.prepare("UPDATE race_team_visits SET visit_date = date(created_at / 1000, 'unixepoch') WHERE visit_date = ''").run();
  }
  const visitMechanicAdditions = [
    ["mechanic_id", "ALTER TABLE race_team_visits ADD COLUMN mechanic_id TEXT"],
    ["mechanic_name", "ALTER TABLE race_team_visits ADD COLUMN mechanic_name TEXT NOT NULL DEFAULT ''"],
    ["quantity", "ALTER TABLE race_team_visits ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1"],
    ["is_paid", "ALTER TABLE race_team_visits ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 0"],
  ].filter(([name]) => !existingVisitColumns.has(name));
  if (visitMechanicAdditions.length > 0) await d1.batch(visitMechanicAdditions.map(([, statement]) => d1.prepare(statement)));
  await ensureRaceTeamVisitsOilType(d1);
  await ensureQueueResolutionManualSource(d1);

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

  const serviceEntryColumns = await d1.prepare("PRAGMA table_info(engine_service_entries)").all<{ name: string }>();
  const existingServiceEntryColumns = new Set(serviceEntryColumns.results.map((column: { name: string }) => column.name));
  const serviceEntryAdditions = [
    ["replaced_parts_snapshot", "ALTER TABLE engine_service_entries ADD COLUMN replaced_parts_snapshot TEXT NOT NULL DEFAULT '[]'"],
    ["mechanic_id", "ALTER TABLE engine_service_entries ADD COLUMN mechanic_id TEXT"],
    ["mechanic_name_snapshot", "ALTER TABLE engine_service_entries ADD COLUMN mechanic_name_snapshot TEXT NOT NULL DEFAULT ''"],
  ].filter(([name]) => !existingServiceEntryColumns.has(name));
  if (serviceEntryAdditions.length > 0) await d1.batch(serviceEntryAdditions.map(([, statement]) => d1.prepare(statement)));

  // `import_source` přibyl až po prvním nasazení modulu servisní karty, takže tabulka už může
  // existovat bez něj. Index se proto zakládá až tady, ne v úvodním batchi — tam by na starší
  // databázi padl na neexistujícím sloupci.
  const serviceRecordColumns = await d1.prepare("PRAGMA table_info(service_records)").all<{ name: string }>();
  if (!serviceRecordColumns.results.some((column: { name: string }) => column.name === "import_source")) {
    await d1.prepare("ALTER TABLE service_records ADD COLUMN import_source TEXT NOT NULL DEFAULT ''").run();
  }
  await d1.prepare("CREATE INDEX IF NOT EXISTS service_records_import_source_idx ON service_records (import_source)").run();

  // Předávka zapsaná v RACE MODE může být díl ze skladu. Vazba se drží kvůli vratnosti —
  // smazání předávky musí kus vrátit na sklad, jinak se stav skladu rozejde s realitou.
  const deliveryStockColumns = await d1.prepare("PRAGMA table_info(race_deliveries)").all<{ name: string }>();
  if (!deliveryStockColumns.results.some((column: { name: string }) => column.name === "inventory_part_id")) {
    await d1.prepare("ALTER TABLE race_deliveries ADD COLUMN inventory_part_id TEXT").run();
  }

  // Krátký identifikátor motoru pro QR štítky (viz app/engine-public-code.ts). Existující
  // motory ho dostanou dodatečně — každý svůj, proto po jednom, ne jedním UPDATE.
  const engineColumns = await d1.prepare("PRAGMA table_info(engines)").all<{ name: string }>();
  if (!engineColumns.results.some((column: { name: string }) => column.name === "public_code")) {
    await d1.prepare("ALTER TABLE engines ADD COLUMN public_code TEXT NOT NULL DEFAULT ''").run();
  }
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS engines_public_code_unique_idx ON engines (public_code) WHERE public_code != ''").run();

  const missingCodes = await d1.prepare("SELECT id FROM engines WHERE public_code = ''").all<{ id: string }>();
  for (const engine of missingCodes.results) {
    // Kolize je při 32^6 možnostech nepravděpodobná, ale unikátní index ji odmítne — zkusí se
    // znovu s jiným kódem. Pět pokusů je víc než dost.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await d1.prepare("UPDATE engines SET public_code = ? WHERE id = ? AND public_code = ''")
          .bind(generatePublicCode(), engine.id).run();
        break;
      } catch {
        // obsazený kód — další pokus
      }
    }
  }

  // Vyřízení fronty starým servisním záznamem. `service_record_id` míří do `service_records`,
  // takže zápis ze staré karty potřebuje vlastní sloupec — bez něj by v reportu vypadal jako
  // odbavení bez servisu.
  const resolutionColumns = await d1.prepare("PRAGMA table_info(engine_service_queue_resolutions)").all<{ name: string }>();
  if (!resolutionColumns.results.some((column: { name: string }) => column.name === "legacy_entry_id")) {
    await d1.prepare("ALTER TABLE engine_service_queue_resolutions ADD COLUMN legacy_entry_id TEXT").run();
  }

  // Na sdílené obrazovce v dílně je přihlášený jeden účet za všechny, takže `claimed_by`
  // (účet, který klikl) není totéž co člověk, který na motoru dělá. `claimed_mechanic_id`
  // drží vybraného mechanika; u mechanikova vlastního účtu zůstává prázdné.
  const claimColumns = await d1.prepare("PRAGMA table_info(engine_service_claims)").all<{ name: string }>();
  if (!claimColumns.results.some((column: { name: string }) => column.name === "claimed_mechanic_id")) {
    await d1.prepare("ALTER TABLE engine_service_claims ADD COLUMN claimed_mechanic_id TEXT").run();
  }

  // `service_record_id` přibyl až s časovou osou — u změny propsané ze servisu je z něj vidět,
  // který zápis ji způsobil, a jde se na něj z osy prokliknout.
  const technicalChangeColumns = await d1.prepare("PRAGMA table_info(engine_technical_value_changes)").all<{ name: string }>();
  if (!technicalChangeColumns.results.some((column: { name: string }) => column.name === "service_record_id")) {
    await d1.prepare("ALTER TABLE engine_technical_value_changes ADD COLUMN service_record_id TEXT").run();
  }

  // `service_time` (HH:MM) je volitelný doplněk k `service_date`. Prázdný řetězec znamená
  // „čas neznámý" — takový záznam se řadí na začátek dne a čas se u něj nikde nezobrazuje.
  // Datum zůstává vlastním sloupcem ve tvaru YYYY-MM-DD, aby staré i přenesené záznamy platily
  // beze změny a `ORDER BY service_date` nikde nezměnilo význam.
  if (!serviceRecordColumns.results.some((column: { name: string }) => column.name === "service_time")) {
    await d1.prepare("ALTER TABLE service_records ADD COLUMN service_time TEXT NOT NULL DEFAULT ''").run();
  }

  // `divergence_note` drží zápis o tom, že mechanik vědomě nechal rozejít rozměr v servisu
  // a v technických údajích. Přibylo spolu s propojením obou míst.
  if (!serviceRecordColumns.results.some((column: { name: string }) => column.name === "divergence_note")) {
    await d1.prepare("ALTER TABLE service_records ADD COLUMN divergence_note TEXT NOT NULL DEFAULT ''").run();
  }

  // `technical_field_id` říká, kterému poli technických údajů atribut odpovídá — díky tomu umí
  // formulář servisu poznat, že se hodnoty rozcházejí, a nabídnout jejich srovnání.
  const attributeColumns = await d1.prepare("PRAGMA table_info(material_attributes)").all<{ name: string }>();
  if (!attributeColumns.results.some((column: { name: string }) => column.name === "technical_field_id")) {
    await d1.prepare("ALTER TABLE material_attributes ADD COLUMN technical_field_id TEXT").run();
  }

  // `allow_multiple_variants` — u položek jako Gufera je na motoru víc kusů, klidně různých
  // rozměrů; u Pístu má naopak smysl jen jedna hodnota. DEFAULT 0 nechává všechny existující
  // položky (i budoucí bez explicitní volby) na dnešním jednoduchém výběru jedné varianty.
  const cardItemColumns = await d1.prepare("PRAGMA table_info(service_card_items)").all<{ name: string }>();
  if (!cardItemColumns.results.some((column: { name: string }) => column.name === "allow_multiple_variants")) {
    await d1.prepare("ALTER TABLE service_card_items ADD COLUMN allow_multiple_variants INTEGER NOT NULL DEFAULT 0").run();
  }

  // `quantity` — kolik kusů této varianty bylo použito. DEFAULT 1 dá všem existujícím řádkům
  // (vždy přesně jedna varianta na položku) správnou hodnotu bez jediného UPDATE — čtou se
  // beze změny, jako skupina o jednom řádku.
  const serviceRecordItemColumns = await d1.prepare("PRAGMA table_info(service_record_items)").all<{ name: string }>();
  if (!serviceRecordItemColumns.results.some((column: { name: string }) => column.name === "quantity")) {
    await d1.prepare("ALTER TABLE service_record_items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1").run();
  }

  // `service_type_snapshot_cs`/`_en` — starý `service_type_snapshot` sloučil oba jazyky do
  // jednoho textu (např. „PRE · Přestavba / Rebuild"), takže se podle přepínače jazyka nedalo
  // vybrat, co zobrazit. Nové sloupce drží každý jazyk samostatně; starý sloupec zůstává
  // beze změny pro dřívější záznamy (žádný UPDATE), nové zápisy plní všechny tři.
  const serviceRecordColumnsForType = await d1.prepare("PRAGMA table_info(service_records)").all<{ name: string }>();
  const serviceTypeSnapshotAdditions: Array<[string, string]> = [
    ["service_type_snapshot_cs", "ALTER TABLE service_records ADD COLUMN service_type_snapshot_cs TEXT NOT NULL DEFAULT ''"],
    ["service_type_snapshot_en", "ALTER TABLE service_records ADD COLUMN service_type_snapshot_en TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, statement] of serviceTypeSnapshotAdditions) {
    if (!serviceRecordColumnsForType.results.some((column: { name: string }) => column.name === name)) {
      await d1.prepare(statement).run();
    }
  }

  // Zákazník u zakázkového servisu: výchozí slevy na práci a na materiál (celá procenta,
  // dají se přepsat na zakázce i na jednotlivé položce) a země. Fakturační údaje — IČO, DIČ,
  // adresa — v tabulce už jsou a zůstávají nepovinné; u zahraničního zákazníka často stačí
  // telefon a e-mail.
  const customerColumns = await d1.prepare("PRAGMA table_info(customers)").all<{ name: string }>();
  const customerAdditions: Array<[string, string]> = [
    ["discount_work_percent", "ALTER TABLE customers ADD COLUMN discount_work_percent INTEGER NOT NULL DEFAULT 0"],
    ["discount_material_percent", "ALTER TABLE customers ADD COLUMN discount_material_percent INTEGER NOT NULL DEFAULT 0"],
    ["country_code", "ALTER TABLE customers ADD COLUMN country_code TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [column, statement] of customerAdditions) {
    if (!customerColumns.results.some((item: { name: string }) => item.name === column)) {
      await d1.prepare(statement).run();
    }
  }

  // Koš pro zakázky: „smazat" nejdřív jen skryje (`deleted_at`/`deleted_by`), skutečně
  // zmizí až po 30 dnech přes lazy sweep v `purgeExpiredTrash()`.
  const serviceOrderColumns = await d1.prepare("PRAGMA table_info(service_orders)").all<{ name: string }>();
  if (!serviceOrderColumns.results.some((item: { name: string }) => item.name === "deleted_at")) {
    await d1.prepare("ALTER TABLE service_orders ADD COLUMN deleted_at INTEGER").run();
  }
  if (!serviceOrderColumns.results.some((item: { name: string }) => item.name === "deleted_by")) {
    await d1.prepare("ALTER TABLE service_orders ADD COLUMN deleted_by TEXT NOT NULL DEFAULT ''").run();
  }
  await d1.prepare("CREATE INDEX IF NOT EXISTS service_orders_deleted_idx ON service_orders (deleted_at)").run();

  // Zpětné naplnění ledgeru čísel z existujících zakázek — tabulka `service_order_numbers`
  // vznikla později než `service_orders`, ať se historická čísla taky chrání proti opakování.
  await d1.prepare(`
    INSERT INTO service_order_numbers (number, order_id, created_at)
    SELECT number, id, created_at FROM service_orders
    WHERE number NOT IN (SELECT number FROM service_order_numbers)
  `).run();

  await ensureMiniServicePartCatalogSeed(d1);
  await ensureServiceCardSeed(d1);
  await ensureEngineDocumentTypesSeed(d1);
  // Přenos staré historie se ZÁMĚRNĚ nespouští automaticky — viz migrateLegacyServiceEntries.
}

/** Výchozí sada typů dokumentů u motoru — spravovatelná dál v Nastavení, tohle jen nastartuje. */
const ENGINE_DOCUMENT_TYPE_SEED: Array<{ code: string; nameCs: string; nameEn: string; handOverToBuyer: boolean }> = [
  { code: "invoice", nameCs: "Faktura", nameEn: "Invoice", handOverToBuyer: false },
  { code: "delivery_note", nameCs: "Dodací list", nameEn: "Delivery note", handOverToBuyer: false },
  { code: "purchase_contract", nameCs: "Kupní smlouva", nameEn: "Purchase contract", handOverToBuyer: false },
  { code: "homologation", nameCs: "Homologace", nameEn: "Homologation", handOverToBuyer: true },
  { code: "photo_documentation", nameCs: "Fotodokumentace", nameEn: "Photo documentation", handOverToBuyer: true },
  { code: "measurement_protocol", nameCs: "Protokol o měření", nameEn: "Measurement protocol", handOverToBuyer: true },
  { code: "warranty", nameCs: "Záruka a reklamace", nameEn: "Warranty and claims", handOverToBuyer: false },
  { code: "other", nameCs: "Ostatní", nameEn: "Other", handOverToBuyer: false },
];

async function ensureEngineDocumentTypesSeed(d1: ReturnType<typeof getD1>) {
  const count = await d1.prepare("SELECT COUNT(*) AS count FROM engine_document_types").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;
  const now = Date.now();
  await d1.batch(ENGINE_DOCUMENT_TYPE_SEED.map((type, index) =>
    d1.prepare(`
      INSERT INTO engine_document_types (id, code, name_cs, name_en, hand_over_to_buyer, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'system', ?, ?)
    `).bind(crypto.randomUUID(), type.code, type.nameCs, type.nameEn, type.handOverToBuyer ? 1 : 0, (index + 1) * SORT_STEP, now, now)
  ));
}

/** Engine categories, keyed by the `engines.family` code already used everywhere else. */
const SERVICE_CARD_CATEGORY_SEED: Array<{ code: string; nameCs: string; nameEn: string; counterUnit: string | null; migrated: boolean }> = [
  { code: "MINI", nameCs: "MINI", nameEn: "MINI", counterUnit: null, migrated: true },
  { code: "OKJ", nameCs: "OKJ", nameEn: "OKJ", counterUnit: null, migrated: false },
  { code: "OKN", nameCs: "OKN", nameEn: "OKN", counterUnit: "hours", migrated: false },
  { code: "OKN-J", nameCs: "OKN-J", nameEn: "OKN-J", counterUnit: "hours", migrated: false },
  { code: "OK", nameCs: "OK", nameEn: "OK", counterUnit: "hours", migrated: false },
  { code: "KZ", nameCs: "KZ", nameEn: "KZ", counterUnit: "hours", migrated: false },
];

/** Card items — the same seven parts, in the same order, as the old hardcoded LEGACY_SERVICE_PARTS
 *  list (app/api/engine-records/route.ts) and the MINI part catalog. That list applies to every
 *  engine family today, so every category is seeded with it: MINI as its live card, the rest as
 *  an editable starting point they can adjust before switching over.
 *
 *  `legacyPartKey` is what ties historic engine_service_entries rows to the new item, and what
 *  lets the switch-over check find the piston / connecting-rod items whose intervals replace the
 *  automatic counter reset. Items created from scratch in the UI have it null. */
const CARD_ITEM_SEED: Array<{ legacyPartKey: string; nameCs: string; nameEn: string; materialCategory: string | null }> = [
  { legacyPartKey: "piston", nameCs: "Píst", nameEn: "Piston", materialCategory: "PISTONS" },
  { legacyPartKey: "oil_seals", nameCs: "Gufera", nameEn: "Oil seals", materialCategory: "OIL_SEALS" },
  { legacyPartKey: "crank_bearings", nameCs: "Ložiska kliky", nameEn: "Crank bearings", materialCategory: "BEARINGS" },
  { legacyPartKey: "connecting_rod", nameCs: "Kompletní ojnice", nameEn: "Complete connecting rod", materialCategory: "RODS" },
  { legacyPartKey: "upper_rod_cage", nameCs: "Horní klec ojnice", nameEn: "Upper rod cage", materialCategory: null },
  { legacyPartKey: "cylinder_gasket", nameCs: "Těsnění válce", nameEn: "Cylinder gasket", materialCategory: "GASKETS" },
  { legacyPartKey: "head_gasket", nameCs: "Těsnění hlavy", nameEn: "Head gasket", materialCategory: "GASKETS" },
];

const MINI_SERVICE_TYPE_SEED: Array<{ code: string; nameCs: string; nameEn: string }> = [
  { code: "1.A", nameCs: "1.A", nameEn: "1.A" },
  { code: "1.B", nameCs: "1.B", nameEn: "1.B" },
  { code: "1.C", nameCs: "1.C", nameEn: "1.C" },
  { code: "1.D", nameCs: "1.D", nameEn: "1.D" },
  { code: "PRE", nameCs: "Přestavba", nameEn: "Rebuild" },
  { code: "KON", nameCs: "Kontrola", nameEn: "Inspection" },
];

/** Material categories. `key` is seed-local only — it wires card items to their category below
 *  and is not persisted. Attributes belong to a category, never to the catalogue as a whole. */
const MATERIAL_SEED: Array<{
  key: string;
  nameCs: string;
  nameEn: string;
  attributes: Array<{ nameCs: string; nameEn: string; type: "dropdown" | "number" | "text"; unit: string }>;
}> = [
  {
    key: "PISTONS", nameCs: "Písty", nameEn: "Pistons",
    attributes: [
      { nameCs: "Značka", nameEn: "Brand", type: "dropdown", unit: "" },
      { nameCs: "Rozměr", nameEn: "Size", type: "number", unit: "mm" },
    ],
  },
  {
    key: "GASKETS", nameCs: "Těsnění", nameEn: "Gaskets",
    attributes: [
      { nameCs: "Typ", nameEn: "Type", type: "dropdown", unit: "" },
      { nameCs: "Síla", nameEn: "Thickness", type: "number", unit: "mm" },
    ],
  },
  { key: "BEARINGS", nameCs: "Ložiska", nameEn: "Bearings", attributes: [] },
  { key: "OIL_SEALS", nameCs: "Gufera", nameEn: "Oil seals", attributes: [] },
  { key: "SPARK_PLUGS", nameCs: "Svíčky", nameEn: "Spark plugs", attributes: [] },
  { key: "RODS", nameCs: "Ojnice", nameEn: "Connecting rods", attributes: [] },
];

/** sort_order is written in steps of 10 so inserting between two rows rewrites one row, not all. */
const SORT_STEP = 10;

/**
 * Rozměry pístu, které do teď žily natvrdo v kódu (`pistonSizeOptions` v app/mm-dashboard.tsx
 * a `pistonSizes` v app/api/engine-records/route.ts) a nikdo je nemohl upravit bez zásahu do
 * repozitáře. Seedují se jako varianty katalogu materiálu v kategorii „Písty", odkud si je
 * bere formulář servisu i validace na serveru.
 *
 * Seznam je opsaný 1:1 včetně toho, že 53.84 v něm nikdy nebylo. MINI má vlastní řadu (41.xx),
 * kterou si superadmin nastavil sám — ta se neseeduje, aby se nepřepsala.
 */
const OK_FAMILY_PISTON_SIZES = ["53.83", "53.85", "53.86", "53.87", "53.88", "53.89", "53.90", "53.91", "53.92", "53.93", "53.94", "53.95"];
const PISTON_SIZE_SEED: Record<string, string[]> = {
  OKJ: OK_FAMILY_PISTON_SIZES,
  OKN: OK_FAMILY_PISTON_SIZES,
  "OKN-J": OK_FAMILY_PISTON_SIZES,
  OK: OK_FAMILY_PISTON_SIZES,
};

// Seeds the Nastavení → Servisní karta dictionaries. Idempotent: each block is skipped once its
// table holds anything, so an operator's later edits are never overwritten on the next boot.
async function ensureServiceCardSeed(d1: ReturnType<typeof getD1>) {
  const now = Date.now();

  const categoryCount = await d1.prepare("SELECT COUNT(*) AS count FROM engine_categories").first<{ count: number }>();
  if ((categoryCount?.count ?? 0) === 0) {
    await d1.batch(SERVICE_CARD_CATEGORY_SEED.map((category, index) =>
      d1.prepare(`
        INSERT INTO engine_categories (id, code, name_cs, name_en, sort_order, counter_unit, service_card_migrated, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'system', ?, ?)
      `).bind(crypto.randomUUID(), category.code, category.nameCs, category.nameEn, (index + 1) * SORT_STEP, category.counterUnit, category.migrated ? 1 : 0, now, now)
    ));
  }

  const categories = await d1.prepare("SELECT id, code FROM engine_categories").all<{ id: string; code: string }>();
  for (const category of categories.results) {
    await seedCategoryDictionaries(d1, category, now);
  }
}

/** Materiál, položky karty a (u MINI) typy servisu pro jednu kategorii. Každý blok se přeskočí,
 *  jakmile jeho tabulka pro tu kategorii něco obsahuje — pozdější úpravy se nikdy nepřepíšou. */
async function seedCategoryDictionaries(d1: ReturnType<typeof getD1>, category: { id: string; code: string }, now: number) {
  const materialCount = await d1.prepare("SELECT COUNT(*) AS count FROM material_categories WHERE engine_category_id = ?").bind(category.id).first<{ count: number }>();
  const materialIdByKey = new Map<string, string>();
  if ((materialCount?.count ?? 0) === 0) {
    const statements: ReturnType<typeof d1.prepare>[] = [];
    MATERIAL_SEED.forEach((material, materialIndex) => {
      const materialId = crypto.randomUUID();
      materialIdByKey.set(material.key, materialId);
      statements.push(d1.prepare(`
        INSERT INTO material_categories (id, engine_category_id, name_cs, name_en, sort_order, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'system', ?, ?)
      `).bind(materialId, category.id, material.nameCs, material.nameEn, (materialIndex + 1) * SORT_STEP, now, now));
      material.attributes.forEach((attribute, attributeIndex) => {
        statements.push(d1.prepare(`
          INSERT INTO material_attributes (id, material_category_id, name_cs, name_en, attribute_type, unit, options, sort_order, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, '[]', ?, 'system', ?, ?)
        `).bind(crypto.randomUUID(), materialId, attribute.nameCs, attribute.nameEn, attribute.type, attribute.unit, (attributeIndex + 1) * SORT_STEP, now, now));
      });
    });
    await d1.batch(statements);
  } else {
    const existing = await d1.prepare("SELECT id, name_cs AS nameCs FROM material_categories WHERE engine_category_id = ?").bind(category.id).all<{ id: string; nameCs: string }>();
    for (const seed of MATERIAL_SEED) {
      const match = existing.results.find((row) => row.nameCs === seed.nameCs);
      if (match) materialIdByKey.set(seed.key, match.id);
    }
  }

  const itemCount = await d1.prepare("SELECT COUNT(*) AS count FROM service_card_items WHERE engine_category_id = ?").bind(category.id).first<{ count: number }>();
  if ((itemCount?.count ?? 0) === 0) {
    // Bez intervalů — u kategorií s počítadlem si je superadmin doplní před přepnutím na novou kartu.
    await d1.batch(CARD_ITEM_SEED.map((item, index) =>
      d1.prepare(`
        INSERT INTO service_card_items (id, engine_category_id, name_cs, name_en, material_category_id, interval_minutes, warn_percent, legacy_part_key, sort_order, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, 80, ?, ?, 'system', ?, ?)
      `).bind(crypto.randomUUID(), category.id, item.nameCs, item.nameEn, item.materialCategory ? materialIdByKey.get(item.materialCategory) ?? null : null, item.legacyPartKey, (index + 1) * SORT_STEP, now, now)
    ));
  }

  await seedPistonSizes(d1, category, materialIdByKey.get("PISTONS"), now);

  // Typy servisu zatím seedujeme jen pro MINI — ostatní kategorie si je nadefinují v UI.
  if (category.code !== "MINI") return;
  const typeCount = await d1.prepare("SELECT COUNT(*) AS count FROM service_types WHERE engine_category_id = ?").bind(category.id).first<{ count: number }>();
  if ((typeCount?.count ?? 0) === 0) {
    // Záměrně bez výchozích položek — ty si superadmin zaškrtá v UI.
    await d1.batch(MINI_SERVICE_TYPE_SEED.map((type, index) =>
      d1.prepare(`
        INSERT INTO service_types (id, engine_category_id, code, name_cs, name_en, description_cs, description_en, sort_order, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '', '', ?, 'system', ?, ?)
      `).bind(crypto.randomUUID(), category.id, type.code, type.nameCs, type.nameEn, (index + 1) * SORT_STEP, now, now)
    ));
  }
}

/**
 * Převede hardcoded rozměry pístu do katalogu materiálu. Idempotentní: jakmile kategorie Písty
 * dané rodiny nějakou variantu má, seed se nespustí — ruční úpravy se nikdy nepřepisují.
 */
async function seedPistonSizes(d1: ReturnType<typeof getD1>, category: { id: string; code: string }, pistonCategoryId: string | undefined, now: number) {
  const sizes = PISTON_SIZE_SEED[category.code];
  if (!sizes || !pistonCategoryId) return;

  const existing = await d1.prepare("SELECT COUNT(*) AS count FROM material_variants WHERE material_category_id = ?").bind(pistonCategoryId).first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) return;

  // Rozměr je atribut kategorie; varianta se jmenuje podle něj, stejně jako to dnes vypadá
  // ve formuláři servisu. Značka zůstává prázdná — doplní se, až ji někdo bude chtít evidovat.
  const sizeAttribute = await d1.prepare(`
    SELECT id FROM material_attributes WHERE material_category_id = ? AND name_en = 'Size' AND archived_at IS NULL
  `).bind(pistonCategoryId).first<{ id: string }>();
  if (!sizeAttribute) return;

  await d1.batch(sizes.map((size: string) =>
    d1.prepare(`
      INSERT INTO material_variants (id, material_category_id, name, attribute_values, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'system', ?, ?)
    `).bind(crypto.randomUUID(), pistonCategoryId, size, JSON.stringify({ [sizeAttribute.id]: size }), now, now)
  ));
}

/** Labels the four hardcoded legacy service types carried, kept only so migrated history
 *  still reads the way it did before. New records store their own snapshot instead. */
// Zvlášť pro každý jazyk, ne jeden slepený text — jinak by se podle přepínače jazyka
// nedalo vybrat, co zobrazit (stejná chyba, jaká byla u `serviceTypeSnapshot` v API zápisu).
const LEGACY_SERVICE_TYPE_LABELS: Record<string, { cs: string; en: string }> = {
  inspection: { cs: "Kontrola", en: "Inspection" },
  piston_service: { cs: "Servis pístu", en: "Piston service" },
  top_end: { cs: "Top end", en: "Top end" },
  full_service: { cs: "Kompletní servis", en: "Full service" },
};

type LegacyEntryRow = {
  id: string;
  engineId: string;
  engineCode: string;
  serviceDate: string;
  serviceType: string;
  replacedParts: string;
  replacedPartsSnapshot: string;
  notes: string;
  mechanicId: string | null;
  mechanicName: string;
  createdBy: string;
  createdAt: number;
};

/**
 * Odkud záznam pochází. Prázdný řetězec = běžný zápis mechanika, ten se nikdy hromadně nemaže.
 * Ostatní hodnoty označují dávkově založené záznamy, které jde vrátit zpět — to je jediná
 * záchranná brzda na produkci, kam se mimo aplikaci nedostaneme.
 */
export const IMPORT_SOURCE_LEGACY = "legacy_import";
export const IMPORT_SOURCE_COUNTER_CARRYOVER = "counter_carryover";

/** Souhrn jednoho běhu přenosu staré historie — stejný tvar pro náhled i ostrý zápis. */
export type LegacyMigrationSummary = {
  categoryCode: string;
  /** Kolik starých záznamů ještě čeká na přenos (u ostrého běhu kolik se přeneslo). */
  records: number;
  /** Kolik už přenesených záznamů v nové historii leží — přesně tolik vrátí „Vrátit přenos". */
  alreadyImported: number;
  /** Kolik z nich vzniklo položek. */
  items: number;
  /** part_key ze staré historie, ke kterému se nenašla položka karty — přenese se jen snapshot názvu. */
  unmatchedPartKeys: string[];
  /** Prvních pár záznamů na kontrolu proti tomu, co je vidět v UI. */
  samples: Array<{ engineCode: string; serviceDate: string; serviceType: string; items: string[] }>;
};

/**
 * Přenese starou historii z `engine_service_entries` do `service_records` + `service_record_items`
 * pro kategorie, které už jedou po nové servisní kartě.
 *
 * **Nespouští se automaticky při startu.** Nasazení nového kódu na produkci nesmí historii sáhnout
 * dřív, než si ji někdo prohlédne — proto se volá výhradně ručně: `dryRun: true` z náhledu
 * v Nastavení → Servisní karta (nic nezapisuje, jen spočítá a vrátí vzorek), `dryRun: false`
 * po potvrzení, a taky z přepnutí kategorie na novou kartu.
 *
 * Idempotentní přes `service_records.id` — přebírá se id starého řádku, takže druhý běh nic
 * nepřidá a dřív přenesené záznamy se v náhledu už neobjeví.
 */
export async function migrateLegacyServiceEntries(
  d1: ReturnType<typeof getD1>,
  options: { dryRun?: boolean } = {},
): Promise<LegacyMigrationSummary[]> {
  const dryRun = options.dryRun ?? false;
  const categories = await d1.prepare("SELECT id, code FROM engine_categories WHERE service_card_migrated = 1").all<{ id: string; code: string }>();
  const summaries: LegacyMigrationSummary[] = [];

  for (const category of categories.results) {
    const pending = await d1.prepare(`
      SELECT e.id, e.engine_id AS engineId, e.service_date AS serviceDate, e.service_type AS serviceType,
             e.replaced_parts AS replacedParts, e.replaced_parts_snapshot AS replacedPartsSnapshot,
             e.notes, e.mechanic_id AS mechanicId, e.mechanic_name_snapshot AS mechanicName,
             e.created_by AS createdBy, e.created_at AS createdAt, g.code AS engineCode
      FROM engine_service_entries e
      JOIN engines g ON g.id = e.engine_id
      WHERE g.family = ?
        AND NOT EXISTS (SELECT 1 FROM service_records r WHERE r.id = e.id)
      ORDER BY e.service_date DESC
    `).bind(category.code).all<LegacyEntryRow>();
    const imported = await d1.prepare(`
      SELECT COUNT(*) AS count FROM service_records r
      JOIN engines g ON g.id = r.engine_id
      WHERE g.family = ? AND r.import_source = ?
    `).bind(category.code, IMPORT_SOURCE_LEGACY).first<{ count: number }>();
    const alreadyImported = imported?.count ?? 0;

    if (pending.results.length === 0) {
      summaries.push({ categoryCode: category.code, records: 0, alreadyImported, items: 0, unmatchedPartKeys: [], samples: [] });
      continue;
    }

    const items = await d1.prepare(`
      SELECT id, name_cs AS nameCs, name_en AS nameEn, legacy_part_key AS legacyPartKey
      FROM service_card_items WHERE engine_category_id = ? AND legacy_part_key IS NOT NULL
    `).bind(category.id).all<{ id: string; nameCs: string; nameEn: string; legacyPartKey: string }>();
    const itemByKey = new Map(items.results.map((item) => [item.legacyPartKey, item]));

    const statements: ReturnType<typeof d1.prepare>[] = [];
    const unmatched = new Set<string>();
    const samples: LegacyMigrationSummary["samples"] = [];
    let itemCount = 0;

    for (const entry of pending.results) {
      const serviceTypeLabel = LEGACY_SERVICE_TYPE_LABELS[entry.serviceType] ?? { cs: entry.serviceType, en: entry.serviceType };
      statements.push(d1.prepare(`
        INSERT INTO service_records (
          id, engine_id, service_type_id, service_type_snapshot, service_type_snapshot_cs, service_type_snapshot_en,
          service_date, counter_minutes, mechanic_id, mechanic_name_snapshot, note, import_source, created_by, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
      `).bind(entry.id, entry.engineId, serviceTypeLabel.cs, serviceTypeLabel.cs, serviceTypeLabel.en, entry.serviceDate, entry.mechanicId,
        entry.mechanicName, entry.notes, IMPORT_SOURCE_LEGACY, entry.createdBy, entry.createdAt, entry.createdAt));

      // Přednost má snapshot, který starý řádek nesl; teprve pak seznam klíčů + dnešní katalog,
      // aby se nic neztratilo ani u řádků zapsaných dřív, než snapshoty vůbec existovaly.
      const snapshot = parseJsonArray<{ partKey: string; labelCs: string; labelEn: string }>(entry.replacedPartsSnapshot);
      const partKeys = snapshot.length > 0 ? snapshot.map((part) => part.partKey) : parseJsonArray<string>(entry.replacedParts);
      const sampleItems: string[] = [];
      partKeys.forEach((partKey, index) => {
        const snapshotEntry = snapshot.find((part) => part.partKey === partKey);
        const item = itemByKey.get(partKey);
        if (!item) unmatched.add(partKey);
        const nameCs = snapshotEntry?.labelCs || item?.nameCs || partKey;
        const nameEn = snapshotEntry?.labelEn || item?.nameEn || partKey;
        sampleItems.push(nameCs);
        itemCount += 1;
        statements.push(d1.prepare(`
          INSERT INTO service_record_items (
            id, service_record_id, service_card_item_id, item_name_cs_snapshot, item_name_en_snapshot,
            material_variant_id, material_snapshot, sort_order, created_at
          ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        `).bind(crypto.randomUUID(), entry.id, item?.id ?? null, nameCs, nameEn, (index + 1) * SORT_STEP, entry.createdAt));
      });

      if (samples.length < 5) {
        samples.push({ engineCode: entry.engineCode, serviceDate: entry.serviceDate, serviceType: serviceTypeLabel.cs, items: sampleItems });
      }
    }

    if (!dryRun) {
      // D1 má strop na velikost dávky; po částech, ať to unese i motor s dlouhou historií.
      for (let offset = 0; offset < statements.length; offset += 50) {
        await d1.batch(statements.slice(offset, offset + 50));
      }
      console.log(`[service-card] migrated ${pending.results.length} legacy service entries for category ${category.code}`);
    }

    summaries.push({
      categoryCode: category.code,
      records: pending.results.length,
      alreadyImported,
      items: itemCount,
      unmatchedPartKeys: [...unmatched],
      samples,
    });
  }

  return summaries;
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

// Starting catalog for MINI — mirrors the parts this family already used from the old hardcoded
// serviceParts/allowedParts lists (app/mm-dashboard.tsx, app/api/engine-records/route.ts). Seeded
// once; from here on the catalog is managed via its own CRUD, not this file.
async function ensureMiniServicePartCatalogSeed(d1: ReturnType<typeof getD1>) {
  const existing = await d1.prepare("SELECT COUNT(*) AS count FROM engine_service_part_catalog WHERE family = 'MINI'").first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) return;

  const now = Date.now();
  const defaults: Array<[string, string, string]> = [
    ["piston", "Píst", "Piston"],
    ["oil_seals", "Gufera", "Oil seals"],
    ["crank_bearings", "Ložiska kliky", "Crank bearings"],
    ["connecting_rod", "Kompletní ojnice", "Complete connecting rod"],
    ["upper_rod_cage", "Horní klec ojnice", "Upper rod cage"],
    ["cylinder_gasket", "Těsnění válce", "Cylinder gasket"],
    ["head_gasket", "Těsnění hlavy", "Head gasket"],
  ];
  await d1.batch(defaults.map(([partKey, labelCs, labelEn], index) =>
    d1.prepare(`
      INSERT INTO engine_service_part_catalog (id, family, part_key, label_cs, label_en, sort_order, created_by, created_at, updated_at)
      VALUES (?, 'MINI', ?, ?, ?, ?, 'system', ?, ?)
    `).bind(crypto.randomUUID(), partKey, labelCs, labelEn, index, now, now)
  ));
}

/**
 * `source_type` původně připouštěl jen 'race' a 'loan'. SQLite neumí CHECK změnit `ALTER`em,
 * takže se tabulka přestaví — stejný postup jako `ensureRaceTeamVisitsOilType` níže.
 */
async function ensureQueueResolutionManualSource(d1: ReturnType<typeof getD1>) {
  const table = await d1.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'engine_service_queue_resolutions'").first<{ sql: string }>();
  if (!table || table.sql.includes("'manual'")) return;
  await d1.batch([
    d1.prepare("DROP TABLE IF EXISTS engine_service_queue_resolutions_migration"),
    d1.prepare(`
      CREATE TABLE engine_service_queue_resolutions_migration (
        id TEXT PRIMARY KEY NOT NULL,
        engine_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('race', 'loan', 'manual')),
        source_id TEXT NOT NULL,
        resolution TEXT NOT NULL CHECK (resolution IN ('serviced', 'skipped')),
        service_record_id TEXT,
        resolved_by TEXT NOT NULL,
        resolved_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      INSERT INTO engine_service_queue_resolutions_migration (id, engine_id, source_type, source_id, resolution, service_record_id, resolved_by, resolved_at)
      SELECT id, engine_id, source_type, source_id, resolution, service_record_id, resolved_by, resolved_at
      FROM engine_service_queue_resolutions
    `),
    d1.prepare("DROP TABLE engine_service_queue_resolutions"),
    d1.prepare("ALTER TABLE engine_service_queue_resolutions_migration RENAME TO engine_service_queue_resolutions"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS engine_service_queue_resolutions_unique_idx ON engine_service_queue_resolutions (engine_id, source_type, source_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS engine_service_queue_resolutions_engine_idx ON engine_service_queue_resolutions (engine_id)"),
  ]);
}

async function ensureRaceTeamVisitsOilType(d1: ReturnType<typeof getD1>) {
  const table = await d1.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'race_team_visits'").first<{ sql: string }>();
  if (!table || table.sql.includes("'oil'")) return;
  await d1.batch([
    d1.prepare("DROP TABLE IF EXISTS race_team_visits_oil_migration"),
    d1.prepare(`
      CREATE TABLE race_team_visits_oil_migration (
        id TEXT PRIMARY KEY NOT NULL,
        race_id TEXT NOT NULL,
        team_id TEXT,
        team_name TEXT NOT NULL,
        driver_id TEXT,
        driver_name TEXT NOT NULL DEFAULT '',
        item_type TEXT NOT NULL DEFAULT 'part' CHECK (item_type IN ('part', 'service', 'stock', 'oil', 'other')),
        resource_id TEXT,
        description TEXT NOT NULL DEFAULT '',
        visit_date TEXT NOT NULL DEFAULT '',
        mechanic_id TEXT,
        mechanic_name TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR')),
        amount_cents INTEGER,
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    d1.prepare(`
      INSERT INTO race_team_visits_oil_migration (
        id, race_id, team_id, team_name, driver_id, driver_name, item_type, resource_id,
        description, visit_date, mechanic_id, mechanic_name, currency, amount_cents, notes,
        created_by, created_at, updated_at
      )
      SELECT
        id, race_id, team_id, team_name, driver_id, driver_name, item_type, resource_id,
        description, visit_date, mechanic_id, mechanic_name, currency, amount_cents, notes,
        created_by, created_at, updated_at
      FROM race_team_visits
    `),
    d1.prepare("DROP TABLE race_team_visits"),
    d1.prepare("ALTER TABLE race_team_visits_oil_migration RENAME TO race_team_visits"),
    d1.prepare("CREATE INDEX IF NOT EXISTS race_team_visits_race_idx ON race_team_visits (race_id, created_at)"),
  ]);
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

/**
 * Vrátí přenos staré historie — smaže výhradně záznamy s `import_source = 'legacy_import'`
 * a jejich položky.
 *
 * Ruční zápisy mechaniků (prázdný `import_source`) i záznamy dopočítané při přepnutí kategorie
 * (`counter_carryover`) zůstávají nedotčené. `engine_service_entries` se nečte ani nemění —
 * původní data tam leželi celou dobu, takže po vrácení jde přenos spustit znovu.
 *
 * Pozor: pokud někdo přenesený záznam mezitím upravil nebo stornoval, zmizí i ta změna.
 */
export async function revertLegacyServiceImport(d1: ReturnType<typeof getD1>): Promise<number> {
  const affected = await d1.prepare("SELECT COUNT(*) AS count FROM service_records WHERE import_source = ?")
    .bind(IMPORT_SOURCE_LEGACY).first<{ count: number }>();
  const count = affected?.count ?? 0;
  if (count === 0) return 0;

  await d1.batch([
    d1.prepare(`
      DELETE FROM service_record_items
      WHERE service_record_id IN (SELECT id FROM service_records WHERE import_source = ?)
    `).bind(IMPORT_SOURCE_LEGACY),
    d1.prepare("DELETE FROM service_records WHERE import_source = ?").bind(IMPORT_SOURCE_LEGACY),
  ]);
  console.log(`[service-card] reverted ${count} imported legacy service records`);
  return count;
}
