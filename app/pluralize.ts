export type Locale = "cs" | "en";

const csRules = new Intl.PluralRules("cs");
const enRules = new Intl.PluralRules("en");

export type PluralForms = {
  cs: [one: string, few: string, many: string]; // 1 / 2-4 / 0, 5+
  en: [one: string, other: string]; // 1 / everything else
};

export function pluralForm(count: number, locale: Locale, forms: PluralForms): string {
  if (locale === "cs") {
    const [one, few, many] = forms.cs;
    const category = csRules.select(count);
    if (category === "one") return one;
    if (category === "few") return few;
    return many;
  }
  const [one, other] = forms.en;
  return enRules.select(count) === "one" ? one : other;
}

export function formatCount(count: number, locale: Locale, forms: PluralForms): string {
  return `${count} ${pluralForm(count, locale, forms)}`;
}
