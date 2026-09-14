"use client";

import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";

/**
 * QR kódy motorů.
 *
 * Kód se generuje v prohlížeči při každém zobrazení, nikde se neukládá — základní adresa je
 * nastavení, takže po její změně se všechny kódy samy přegenerují a nikde nezbude neplatný
 * obrázek.
 *
 * Korekce chyb je schválně na úrovni Q (25 %): štítek v dílně se zamastí a oťuká a vyšší
 * korekce dovolí načíst i poškozený kód. Zaplatí se to hustší mřížkou, proto je u adresy
 * důležité, aby byla krátká.
 */

const ERROR_CORRECTION = "Q";
/** Klidová zóna kolem kódu v modulech; norma žádá 4 a bez ní čtečky selhávají. */
const QUIET_ZONE = 4;

type Matrix = { count: number; isDark: (row: number, column: number) => boolean };

function buildMatrix(value: string): Matrix {
  // 0 = knihovna sama zvolí nejmenší verzi, do které se text vejde.
  const code = qrcode(0, ERROR_CORRECTION);
  code.addData(value);
  code.make();
  return { count: code.getModuleCount(), isDark: (row, column) => code.isDark(row, column) };
}

/** Jedna SVG cesta přes všechny tmavé moduly — levnější než tisíc obdélníků. */
function buildPath(matrix: Matrix) {
  let path = "";
  for (let row = 0; row < matrix.count; row += 1) {
    for (let column = 0; column < matrix.count; column += 1) {
      if (matrix.isDark(row, column)) path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return path;
}

/**
 * Kód jako SVG. Vždycky černá na bílé, i v tmavém režimu — čtečka potřebuje kontrast a
 * inverzní kód řada telefonů nenačte. Proto tahle jedna věc barvy motivu nepřebírá.
 */
export function EngineQrCode({ value, size = 160, title }: { value: string; size?: number; title?: string }) {
  const matrix = useMemo(() => buildMatrix(value), [value]);
  const side = matrix.count + QUIET_ZONE * 2;
  return (
    <svg className="qr-code" viewBox={`0 0 ${side} ${side}`} width={size} height={size}
      role="img" aria-label={title ?? value} shapeRendering="crispEdges">
      <rect width={side} height={side} fill="#fff" />
      <path d={buildPath(matrix)} fill="#000" />
    </svg>
  );
}

/** Kolik modulů má strana kódu — čím míň, tím hrubší mřížka a tím líp se štítek skenuje. */
export function qrModuleCount(value: string) {
  return buildMatrix(value).count;
}

/**
 * Stažení kódu jako PNG. Kreslí se do canvasu ve velikosti vhodné na tisk štítku;
 * `scale` je počet pixelů na modul.
 */
export function downloadQrPng(value: string, fileName: string, scale = 12) {
  const matrix = buildMatrix(value);
  const side = (matrix.count + QUIET_ZONE * 2) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;

  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, side, side);
  context.fillStyle = "#000";
  for (let row = 0; row < matrix.count; row += 1) {
    for (let column = 0; column < matrix.count; column += 1) {
      if (matrix.isDark(row, column)) {
        context.fillRect((column + QUIET_ZONE) * scale, (row + QUIET_ZONE) * scale, scale, scale);
      }
    }
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    // Adresa objektu se musí uvolnit ručně, jinak blob drží paměť do zavření stránky.
    URL.revokeObjectURL(url);
  }, "image/png");
}

/**
 * Základní adresa pro odkazy v QR kódech.
 *
 * Bere se z nastavení; dokud ho superadmin nevyplní, použije se adresa, na které aplikace
 * zrovna běží. Na localhostu tak kódy fungují bez nastavování, a jakmile bude známá
 * skutečná doména, přepíše se na jednom místě.
 */
export function useQrBaseUrl() {
  const [configured, setConfigured] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/app-settings", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { settings?: Record<string, string> };
        if (alive) setConfigured(data.settings?.qr_base_url ?? "");
      } catch {
        // Bez nastavení se použije aktuální adresa — kódy fungují dál.
      }
    })();
    return () => { alive = false; };
  }, []);

  const fallback = typeof window === "undefined" ? "" : window.location.origin;
  return { baseUrl: (configured || fallback).replace(/\/+$/, ""), configured };
}

export function engineQrUrl(baseUrl: string, code: string) {
  return `${baseUrl}/m/${code}`;
}
