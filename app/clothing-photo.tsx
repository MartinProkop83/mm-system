"use client";

import { useEffect } from "react";

export type ClothingPhotoPreview = { imageUrl: string; name: string };

export function ClothingPhoto({ imageUrl, name, fallback, className = "", onOpen }: { imageUrl?: string; name: string; fallback?: string; className?: string; onOpen?: (preview: ClothingPhotoPreview) => void }) {
  if (!imageUrl) return <span className={`clothing-photo-fallback ${className}`} aria-hidden="true">{fallback || name.slice(0, 2).toUpperCase()}</span>;
  return <button className={`clothing-photo-button ${className}`} type="button" onClick={() => onOpen?.({ imageUrl, name })} aria-label={`Zvětšit fotografii: ${name}`}>
    {/* Images are served by the authenticated clothing image route. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={imageUrl} alt={name} />
    {onOpen && <span aria-hidden="true">＋</span>}
  </button>;
}

export function ClothingLightbox({ preview, onClose }: { preview: ClothingPhotoPreview; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div className="clothing-lightbox" role="dialog" aria-modal="true" aria-label={preview.name} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div>
      <header><strong>{preview.name}</strong><button type="button" onClick={onClose} aria-label="Zavřít">×</button></header>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview.imageUrl} alt={preview.name} />
    </div>
  </div>;
}
