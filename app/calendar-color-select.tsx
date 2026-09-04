"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { raceCalendarColors } from "./race-calendar-colors";

export function CalendarColorSelect({ name, defaultValue = "sky", locale }: { name: string; defaultValue?: string; locale: "cs" | "en" }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = raceCalendarColors.find((color) => color.id === value) ?? raceCalendarColors[0];
  const locKey = locale === "cs" ? "cs" : "en";
  const normalizedQuery = query.trim().toLocaleLowerCase(locKey);
  const filtered = normalizedQuery
    ? raceCalendarColors.filter((color) => (locale === "cs" ? color.labelCs : color.labelEn).toLocaleLowerCase(locKey).includes(normalizedQuery))
    : raceCalendarColors;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) { setOpen(false); setQuery(""); }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function commit(id: string) {
    setValue(id);
    setOpen(false);
    setQuery("");
  }

  function dotStyle(color: (typeof raceCalendarColors)[number]) {
    return { "--dot-accent": color.accent } as CSSProperties;
  }

  return <div className={`country-select calendar-color-select${open ? " is-open" : ""}`} ref={rootRef}>
    <input type="hidden" name={name} value={value} />
    <button type="button" className="country-select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span><i className="calendar-color-swatch-dot" style={dotStyle(selected)} />{locale === "cs" ? selected.labelCs : selected.labelEn}</span><b>⌄</b>
    </button>
    {open && <div className="country-select-menu" role="listbox" aria-label={locale === "cs" ? "Barva v kalendáři" : "Calendar color"}>
      <input type="text" className="country-select-search" autoFocus placeholder={locale === "cs" ? "Hledat barvu…" : "Search color…"} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); setQuery(""); }
        if (event.key === "Enter") { event.preventDefault(); if (filtered.length > 0) commit(filtered[0].id); }
      }} />
      <div className="country-select-options">
        {filtered.length === 0 && <p className="country-select-empty">{locale === "cs" ? "Žádná barva nenalezena" : "No color found"}</p>}
        {filtered.map((color) => <button key={color.id} type="button" role="option" aria-selected={color.id === value} className={color.id === value ? "selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => commit(color.id)}>
          <i className="calendar-color-swatch-dot" style={dotStyle(color)} />{locale === "cs" ? color.labelCs : color.labelEn}
        </button>)}
      </div>
    </div>}
  </div>;
}
