import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type LayoutRow = { family: string; columnCount: number; updatedBy: string; updatedAt: number };
type SectionRow = { id: string; family: string; labelCs: string; labelEn: string; sortOrder: number; archivedAt: number | null };
type FieldRow = { id: string; sectionId: string; labelCs: string; labelEn: string; fieldType: "select" | "text"; showOnOverview: boolean; sortOrder: number; archivedAt: number | null; legacyKey: string | null };
type OptionRow = { id: string; fieldId: string; valueCs: string; valueEn: string; sortOrder: number; archivedAt: number | null };

// The 10 free-text `engines` columns the technical-structure feature replaces. Used only to validate
// `legacyKey` on the one-time migration-draft confirmation — see POST kind "confirmMigration".
const legacyTechnicalColumns = new Set([
  "pistonSpec", "cylinderCode", "cylinderUpgrade", "liner", "degree",
  "timing", "carter", "reeds", "spacer", "squish",
]);

type DraftField = { labelCs?: string; labelEn?: string; showOnOverview?: boolean; legacyKey?: string };
type DraftSection = { labelCs?: string; labelEn?: string; fields?: DraftField[] };

type Payload = {
  kind?: "layout" | "section" | "field" | "option" | "confirmMigration";
  id?: string;
  family?: string;
  sectionId?: string;
  fieldId?: string;
  labelCs?: string;
  labelEn?: string;
  fieldType?: string;
  showOnOverview?: boolean;
  valueCs?: string;
  valueEn?: string;
  sortOrder?: number;
  columnCount?: number;
  sections?: DraftSection[];
};

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

async function requireSuperadmin() {
  const user = await getAppUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (user.role !== "superadmin") return { error: Response.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { user } as const;
}

async function readPayload(request: Request): Promise<Payload | Response> {
  try {
    return (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

export async function GET() {
  const auth = await requireSuperadmin();
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const [layout, sections, fields, options] = await Promise.all([
    d1.prepare("SELECT family, column_count AS columnCount, updated_by AS updatedBy, updated_at AS updatedAt FROM engine_technical_layout").all<LayoutRow>(),
    d1.prepare("SELECT id, family, label_cs AS labelCs, label_en AS labelEn, sort_order AS sortOrder, archived_at AS archivedAt FROM engine_technical_sections ORDER BY family, archived_at IS NOT NULL, sort_order").all<SectionRow>(),
    d1.prepare("SELECT id, section_id AS sectionId, label_cs AS labelCs, label_en AS labelEn, field_type AS fieldType, show_on_overview AS showOnOverview, sort_order AS sortOrder, archived_at AS archivedAt, legacy_key AS legacyKey FROM engine_technical_fields ORDER BY section_id, archived_at IS NOT NULL, sort_order").all<Record<string, unknown>>(),
    d1.prepare("SELECT id, field_id AS fieldId, value_cs AS valueCs, value_en AS valueEn, sort_order AS sortOrder, archived_at AS archivedAt FROM engine_technical_field_options ORDER BY field_id, archived_at IS NOT NULL, sort_order").all<OptionRow>(),
  ]);

  const normalizedFields = fields.results.map((field) => ({ ...field, showOnOverview: Boolean(field.showOnOverview) }));

  return Response.json({ layout: layout.results, sections: sections.results, fields: normalizedFields, options: options.results });
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.error) return auth.error;
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const now = Date.now();

  if (payload.kind === "section") {
    const family = clean(payload.family, 20);
    const labelCs = clean(payload.labelCs, 160);
    const labelEn = clean(payload.labelEn, 160);
    if (!family || !labelCs || !labelEn) return Response.json({ error: "Family and both CZ/EN names are required" }, { status: 400 });
    const maxSort = await d1.prepare("SELECT MAX(sort_order) AS maxSort FROM engine_technical_sections WHERE family = ? AND archived_at IS NULL").bind(family).first<{ maxSort: number | null }>();
    const id = crypto.randomUUID();
    await d1.prepare(`
      INSERT INTO engine_technical_sections (id, family, label_cs, label_en, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, family, labelCs, labelEn, (maxSort?.maxSort ?? -1) + 1, auth.user.email, now, now).run();
    return Response.json({ id }, { status: 201 });
  }

  if (payload.kind === "field") {
    const sectionId = clean(payload.sectionId, 80);
    const labelCs = clean(payload.labelCs, 160);
    const labelEn = clean(payload.labelEn, 160);
    const fieldType = clean(payload.fieldType, 20);
    if (!["select", "text"].includes(fieldType)) return Response.json({ error: "Field type must be select or text" }, { status: 400 });
    if (!labelCs || !labelEn) return Response.json({ error: "Both CZ and EN names are required" }, { status: 400 });
    const section = await d1.prepare("SELECT id FROM engine_technical_sections WHERE id = ? AND archived_at IS NULL").bind(sectionId).first();
    if (!section) return Response.json({ error: "Section not found" }, { status: 404 });
    const maxSort = await d1.prepare("SELECT MAX(sort_order) AS maxSort FROM engine_technical_fields WHERE section_id = ? AND archived_at IS NULL").bind(sectionId).first<{ maxSort: number | null }>();
    const id = crypto.randomUUID();
    await d1.prepare(`
      INSERT INTO engine_technical_fields (id, section_id, label_cs, label_en, field_type, show_on_overview, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).bind(id, sectionId, labelCs, labelEn, fieldType, (maxSort?.maxSort ?? -1) + 1, auth.user.email, now, now).run();
    return Response.json({ id }, { status: 201 });
  }

  if (payload.kind === "option") {
    const fieldId = clean(payload.fieldId, 80);
    const valueCs = clean(payload.valueCs, 160);
    const valueEn = clean(payload.valueEn, 160);
    if (!valueCs || !valueEn) return Response.json({ error: "Both CZ and EN values are required" }, { status: 400 });
    const field = await d1.prepare("SELECT id, field_type AS fieldType FROM engine_technical_fields WHERE id = ? AND archived_at IS NULL").bind(fieldId).first<{ id: string; fieldType: string }>();
    if (!field) return Response.json({ error: "Field not found" }, { status: 404 });
    if (field.fieldType !== "select") return Response.json({ error: "Options can only be added to select fields" }, { status: 400 });
    const maxSort = await d1.prepare("SELECT MAX(sort_order) AS maxSort FROM engine_technical_field_options WHERE field_id = ? AND archived_at IS NULL").bind(fieldId).first<{ maxSort: number | null }>();
    const id = crypto.randomUUID();
    await d1.prepare(`
      INSERT INTO engine_technical_field_options (id, field_id, value_cs, value_en, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, fieldId, valueCs, valueEn, (maxSort?.maxSort ?? -1) + 1, now).run();
    return Response.json({ id }, { status: 201 });
  }

  if (payload.kind === "confirmMigration") {
    const family = clean(payload.family, 20);
    if (!family) return Response.json({ error: "Family is required" }, { status: 400 });

    const [existingSection, existingLayout] = await Promise.all([
      d1.prepare("SELECT id FROM engine_technical_sections WHERE family = ? LIMIT 1").bind(family).first(),
      d1.prepare("SELECT family FROM engine_technical_layout WHERE family = ? LIMIT 1").bind(family).first(),
    ]);
    if (existingSection || existingLayout) {
      return Response.json({ error: "This family already has a technical structure — the migration draft can only be confirmed once" }, { status: 409 });
    }

    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    if (!sections.length) return Response.json({ error: "At least one section is required" }, { status: 400 });

    const seenLegacyKeys = new Set<string>();
    for (const section of sections) {
      const labelCs = clean(section.labelCs, 160);
      const labelEn = clean(section.labelEn, 160);
      if (!labelCs || !labelEn) return Response.json({ error: "Every section needs both CZ and EN names" }, { status: 400 });
      for (const field of section.fields ?? []) {
        const fieldLabelCs = clean(field.labelCs, 160);
        const fieldLabelEn = clean(field.labelEn, 160);
        if (!fieldLabelCs || !fieldLabelEn) return Response.json({ error: "Every field needs both CZ and EN names" }, { status: 400 });
        if (field.legacyKey !== undefined && field.legacyKey !== null) {
          if (!legacyTechnicalColumns.has(field.legacyKey)) return Response.json({ error: "Invalid legacy field key" }, { status: 400 });
          if (seenLegacyKeys.has(field.legacyKey)) return Response.json({ error: "Duplicate legacy field key" }, { status: 400 });
          seenLegacyKeys.add(field.legacyKey);
        }
      }
    }

    const statements = [
      d1.prepare(`
        INSERT INTO engine_technical_layout (family, column_count, updated_by, updated_at)
        VALUES (?, 3, ?, ?)
      `).bind(family, auth.user.email, now),
    ];
    const fieldLegacyKeys: Array<{ fieldId: string; legacyKey: string }> = [];
    sections.forEach((section, sectionIndex) => {
      const sectionId = crypto.randomUUID();
      statements.push(d1.prepare(`
        INSERT INTO engine_technical_sections (id, family, label_cs, label_en, sort_order, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(sectionId, family, clean(section.labelCs, 160), clean(section.labelEn, 160), sectionIndex, auth.user.email, now, now));
      (section.fields ?? []).forEach((field, fieldIndex) => {
        const fieldId = crypto.randomUUID();
        const legacyKey = field.legacyKey && legacyTechnicalColumns.has(field.legacyKey) ? field.legacyKey : null;
        statements.push(d1.prepare(`
          INSERT INTO engine_technical_fields (id, section_id, label_cs, label_en, field_type, show_on_overview, sort_order, legacy_key, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'text', ?, ?, ?, ?, ?, ?)
        `).bind(fieldId, sectionId, clean(field.labelCs, 160), clean(field.labelEn, 160), field.showOnOverview ? 1 : 0, fieldIndex, legacyKey, auth.user.email, now, now));
        if (legacyKey) fieldLegacyKeys.push({ fieldId, legacyKey });
      });
    });

    if (fieldLegacyKeys.length) {
      const engines = await d1.prepare(`
        SELECT id, piston_spec AS pistonSpec, cylinder_code AS cylinderCode, cylinder_upgrade AS cylinderUpgrade,
               liner, degree, timing, carter, reeds, spacer, squish
        FROM engines WHERE family = ? AND archived_at IS NULL
      `).bind(family).all<Record<string, unknown>>();
      for (const engine of engines.results) {
        for (const { fieldId, legacyKey } of fieldLegacyKeys) {
          const value = String(engine[legacyKey] ?? "");
          statements.push(d1.prepare(`
            INSERT INTO engine_technical_values (id, engine_id, field_id, value, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(crypto.randomUUID(), String(engine.id), fieldId, value, auth.user.email, now));
        }
      }
    }

    await d1.batch(statements);
    return Response.json({ family }, { status: 201 });
  }

  return Response.json({ error: "Invalid kind" }, { status: 400 });
}

export async function PUT(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.error) return auth.error;
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const now = Date.now();

  if (payload.kind === "layout") {
    const family = clean(payload.family, 20);
    const columnCount = Number(payload.columnCount);
    if (!family || !Number.isInteger(columnCount) || columnCount < 1 || columnCount > 6) {
      return Response.json({ error: "Family and a column count between 1 and 6 are required" }, { status: 400 });
    }
    await d1.prepare(`
      INSERT INTO engine_technical_layout (family, column_count, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(family) DO UPDATE SET column_count = excluded.column_count, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).bind(family, columnCount, auth.user.email, now).run();
    return Response.json({ family, columnCount });
  }

  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Id is required" }, { status: 400 });

  if (payload.kind === "section") {
    const existing = await d1.prepare("SELECT id, label_cs AS labelCs, label_en AS labelEn, sort_order AS sortOrder FROM engine_technical_sections WHERE id = ?").bind(id).first<{ id: string; labelCs: string; labelEn: string; sortOrder: number }>();
    if (!existing) return Response.json({ error: "Section not found" }, { status: 404 });
    const labelCs = payload.labelCs !== undefined ? clean(payload.labelCs, 160) : existing.labelCs;
    const labelEn = payload.labelEn !== undefined ? clean(payload.labelEn, 160) : existing.labelEn;
    if (!labelCs || !labelEn) return Response.json({ error: "Both CZ and EN names are required" }, { status: 400 });
    const sortOrder = payload.sortOrder !== undefined && Number.isInteger(payload.sortOrder) ? payload.sortOrder : existing.sortOrder;
    await d1.prepare("UPDATE engine_technical_sections SET label_cs = ?, label_en = ?, sort_order = ?, updated_at = ? WHERE id = ?").bind(labelCs, labelEn, sortOrder, now, id).run();
    return Response.json({ id });
  }

  if (payload.kind === "field") {
    const existing = await d1.prepare("SELECT id, label_cs AS labelCs, label_en AS labelEn, sort_order AS sortOrder, show_on_overview AS showOnOverview FROM engine_technical_fields WHERE id = ?").bind(id).first<{ id: string; labelCs: string; labelEn: string; sortOrder: number; showOnOverview: number }>();
    if (!existing) return Response.json({ error: "Field not found" }, { status: 404 });
    const labelCs = payload.labelCs !== undefined ? clean(payload.labelCs, 160) : existing.labelCs;
    const labelEn = payload.labelEn !== undefined ? clean(payload.labelEn, 160) : existing.labelEn;
    if (!labelCs || !labelEn) return Response.json({ error: "Both CZ and EN names are required" }, { status: 400 });
    const sortOrder = payload.sortOrder !== undefined && Number.isInteger(payload.sortOrder) ? payload.sortOrder : existing.sortOrder;
    const showOnOverview = payload.showOnOverview !== undefined ? Boolean(payload.showOnOverview) : Boolean(existing.showOnOverview);
    await d1.prepare("UPDATE engine_technical_fields SET label_cs = ?, label_en = ?, sort_order = ?, show_on_overview = ?, updated_at = ? WHERE id = ?").bind(labelCs, labelEn, sortOrder, showOnOverview ? 1 : 0, now, id).run();
    return Response.json({ id });
  }

  if (payload.kind === "option") {
    const existing = await d1.prepare("SELECT id, value_cs AS valueCs, value_en AS valueEn, sort_order AS sortOrder FROM engine_technical_field_options WHERE id = ?").bind(id).first<{ id: string; valueCs: string; valueEn: string; sortOrder: number }>();
    if (!existing) return Response.json({ error: "Option not found" }, { status: 404 });
    const valueCs = payload.valueCs !== undefined ? clean(payload.valueCs, 160) : existing.valueCs;
    const valueEn = payload.valueEn !== undefined ? clean(payload.valueEn, 160) : existing.valueEn;
    if (!valueCs || !valueEn) return Response.json({ error: "Both CZ and EN values are required" }, { status: 400 });
    const sortOrder = payload.sortOrder !== undefined && Number.isInteger(payload.sortOrder) ? payload.sortOrder : existing.sortOrder;
    await d1.prepare("UPDATE engine_technical_field_options SET value_cs = ?, value_en = ?, sort_order = ? WHERE id = ?").bind(valueCs, valueEn, sortOrder, id).run();
    return Response.json({ id });
  }

  return Response.json({ error: "Invalid kind" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.error) return auth.error;
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;

  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const now = Date.now();
  const table = ({ section: "engine_technical_sections", field: "engine_technical_fields", option: "engine_technical_field_options" } as const)[payload.kind as "section" | "field" | "option"];
  if (!table) return Response.json({ error: "Invalid kind" }, { status: 400 });

  const result = await d1.prepare(`UPDATE ${table} SET archived_at = ? WHERE id = ? AND archived_at IS NULL`).bind(now, id).run();
  return result.meta.changes ? Response.json({ id }) : Response.json({ error: "Not found" }, { status: 404 });
}
