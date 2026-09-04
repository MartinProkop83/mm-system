"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { localizedCountries } from "./countries";

export function CountrySelect({ name, defaultValue = "", value, onChange, locale, required = false, autoFocus = false }: { name: string; defaultValue?: string | null; value?: string; onChange?: (event: ChangeEvent<HTMLSelectElement>) => void; locale: "cs" | "en"; required?: boolean; autoFocus?: boolean }) {
  const options = useMemo(() => localizedCountries(locale), [locale]);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = isControlled ? value : internalValue;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((country) => country.code === currentValue);
  const normalizedQuery = query.trim().toLocaleLowerCase(locale === "cs" ? "cs" : "en");
  const filtered = normalizedQuery
    ? options.filter((country) => country.name.toLocaleLowerCase(locale === "cs" ? "cs" : "en").includes(normalizedQuery) || country.code.toLowerCase().includes(normalizedQuery))
    : options;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) { setOpen(false); setQuery(""); }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function commit(code: string) {
    setOpen(false);
    setQuery("");
    if (isControlled) onChange?.({ target: { value: code, name } } as unknown as ChangeEvent<HTMLSelectElement>);
    else setInternalValue(code);
  }

  return <div className={`country-select${open ? " is-open" : ""}`} ref={rootRef}>
    <input type="hidden" name={name} value={currentValue} />
    <button type="button" className="country-select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-required={required} autoFocus={autoFocus} onClick={() => setOpen((current) => !current)}>
      <span>{selected ? `${selected.flag} ${selected.name} · ${selected.code}` : (locale === "cs" ? "Vyber zemi…" : "Select country…")}</span><b>⌄</b>
    </button>
    {open && <div className="country-select-menu" role="listbox" aria-label={locale === "cs" ? "Země" : "Country"}>
      <input type="text" className="country-select-search" autoFocus placeholder={locale === "cs" ? "Hledat zemi…" : "Search country…"} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); setQuery(""); }
        if (event.key === "Enter") { event.preventDefault(); if (filtered.length > 0) commit(filtered[0].code); }
      }} />
      <div className="country-select-options">
        {filtered.length === 0 && <p className="country-select-empty">{locale === "cs" ? "Žádná země nenalezena" : "No country found"}</p>}
        {filtered.map((country) => <button key={country.code} type="button" role="option" aria-selected={country.code === currentValue} className={country.code === currentValue ? "selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => commit(country.code)}>{country.flag} {country.name} · {country.code}</button>)}
      </div>
    </div>}
  </div>;
}
