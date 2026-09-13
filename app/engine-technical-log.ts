import type { getD1 } from "../db";

/**
 * Zápis změn technických údajů motoru do `engine_technical_value_changes`.
 *
 * `engine_technical_values` drží jen poslední hodnotu — předchozí se přepíše. Bez tohohle logu
 * by nešlo zpětně zjistit, co na motoru bylo, a to je čím dál důležitější: hodnoty se teď
 * propisují i ze servisních záznamů, takže se mění často.
 *
 * Ukládá se **čitelný text**, ne id volby. Pole typu „výběr" drží v `engine_technical_values`
 * id z `engine_technical_field_options`; po archivaci volby by se historie stala nečitelnou.
 * Ze stejného důvodu se snapshotuje i název pole — přejmenování pole starý záznam nepřepíše.
 */

export type TechnicalChangeSource = "manual" | "service";

/** Co se má zapsat: pole a jeho nová hodnota. Starou si funkce zjistí sama. */
export type TechnicalValueWrite = { fieldId: string; value: string };

type FieldRow = { id: string; labelCs: string; labelEn: string; fieldType: string };
type CurrentRow = { fieldId: string; storedValue: string; readableValue: string };

/**
 * Porovná zamýšlené hodnoty se současným stavem a vrátí příkazy, které zapíšou jen skutečné
 * změny. Volá se **před** zápisem do `engine_technical_values`, jinak už je stará hodnota pryč.
 *
 * Vrací pole `d1.prepare(...)`, aby šlo zapsat ve stejném batchi jako samotná změna — log
 * a hodnota se tak nemůžou rozejít.
 */
export async function buildTechnicalChangeLog(
  d1: ReturnType<typeof getD1>,
  engineId: string,
  writes: TechnicalValueWrite[],
  actor: string,
  source: TechnicalChangeSource,
  now: number,
  /** U změny propsané ze servisu id toho záznamu — osa na něj odkáže. */
  serviceRecordId: string | null = null,
): Promise<ReturnType<ReturnType<typeof getD1>["prepare"]>[]> {
  const fieldIds = Array.from(new Set(writes.map((write) => write.fieldId).filter(Boolean)));
  if (fieldIds.length === 0) return [];

  const placeholders = fieldIds.map(() => "?").join(", ");
  const [fields, current] = await Promise.all([
    d1.prepare(`
      SELECT id, label_cs AS labelCs, label_en AS labelEn, field_type AS fieldType
      FROM engine_technical_fields WHERE id IN (${placeholders})
    `).bind(...fieldIds).all<FieldRow>(),
    // COALESCE přeloží id volby na text; u textových polí projde hodnota beze změny.
    d1.prepare(`
      SELECT v.field_id AS fieldId, v.value AS storedValue, COALESCE(o.value_cs, v.value) AS readableValue
      FROM engine_technical_values v
      LEFT JOIN engine_technical_field_options o ON o.id = v.value
      WHERE v.engine_id = ? AND v.field_id IN (${placeholders})
    `).bind(engineId, ...fieldIds).all<CurrentRow>(),
  ]);

  const fieldById = new Map(fields.results.map((field) => [field.id, field]));
  const currentById = new Map(current.results.map((row) => [row.fieldId, row]));

  // Nové hodnoty voleb přijdou taky jako id — přeložíme je na text stejným způsobem.
  const newOptionIds = writes
    .map((write) => write.value)
    .filter((value) => value && !currentById.has(value));
  const optionLabels = newOptionIds.length === 0 ? { results: [] } : await d1.prepare(`
    SELECT id, value_cs AS valueCs FROM engine_technical_field_options
    WHERE id IN (${newOptionIds.map(() => "?").join(", ")})
  `).bind(...newOptionIds).all<{ id: string; valueCs: string }>();
  const optionLabelById = new Map(optionLabels.results.map((row) => [row.id, row.valueCs]));

  const statements: ReturnType<ReturnType<typeof getD1>["prepare"]>[] = [];
  for (const write of writes) {
    const field = fieldById.get(write.fieldId);
    if (!field) continue;

    const previous = currentById.get(write.fieldId);
    // Beze změny se nic nezapisuje — jinak by uložení karty bez úprav zahltilo osu.
    if ((previous?.storedValue ?? "") === write.value) continue;

    const oldReadable = previous?.readableValue ?? "";
    const newReadable = optionLabelById.get(write.value) ?? write.value;
    if (oldReadable === newReadable) continue;

    statements.push(d1.prepare(`
      INSERT INTO engine_technical_value_changes
        (id, engine_id, field_id, field_label_cs, field_label_en, old_value, new_value, source, service_record_id, changed_by, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), engineId, field.id, field.labelCs, field.labelEn,
      oldReadable, newReadable, source, serviceRecordId, actor, now));
  }
  return statements;
}
