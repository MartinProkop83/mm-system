"use client";

import { useMemo, type ChangeEvent } from "react";
import { localizedCountries } from "./countries";

export function CountrySelect({ name, defaultValue = "", value, onChange, locale, required = false, autoFocus = false }: { name: string; defaultValue?: string | null; value?: string; onChange?: (event: ChangeEvent<HTMLSelectElement>) => void; locale: "cs" | "en"; required?: boolean; autoFocus?: boolean }) {
  const options = useMemo(() => localizedCountries(locale), [locale]);
  const controlled = value === undefined ? { defaultValue: defaultValue ?? "" } : { value, onChange };
  return <select name={name} {...controlled} required={required} autoFocus={autoFocus}>
    <option value="">{locale === "cs" ? "Vyber zemi…" : "Select country…"}</option>
    {options.map((country) => <option key={country.code} value={country.code}>{country.flag} {country.name} · {country.code}</option>)}
  </select>;
}
