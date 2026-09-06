import { useRef, useState } from "react";
import { Crop, X } from "lucide-react";
import { OUTPUT_MAX_DIM, MAX_IMAGE_KB } from "../lib/image";
import { useEscapeClose, useEnterAction } from "./ui";

const RATIOS = [
  { label: "Libre", v: "free" },
  { label: "Paysage", v: 4 / 3 },
  { label: "Carré", v: 1 },
  { label: "Portrait", v: 3 / 4 },
];
const FRAME_MAX = 264;

const resolveRatio = (r, nat) => (r === "free" ? (nat ? nat.w / nat.h : 4 / 3) : r);
const frameDims = (r, nat) => {
  const er = resolveRatio(r, nat);
  return er >= 1
    ? { fw: FRAME_MAX, fh: Math.round(FRAME_MAX / er) }
    : { fw: Math.round(FRAME_MAX * er), fh: FRAME_MAX };
};

/*
 * Recadreur : cadre au format choisi, image déplaçable (pan) + zoom.
 * onConfirm(blob, previewUrl) renvoie un JPEG recadré ; la compression
 * finale sous MAX_IMAGE_KB est faite au moment de l'upload (lib/image.js).
 */
export default function CropModal({ src, onCancel, onConfirm }) {
  const imgRef = useRef(null);
  const drag = useRef(null);
  const [nat, setNat] = useState(null);
  const [ratio, setRatio] = useState("free");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  // Échap annule, Entrée valide (overlay propre, hors composant Modal).
  useEscapeClose(busy ? null : onCancel);
  const confirmRef = useRef(null);
  useEnterAction(() => { if (!busy && nat) confirmRef.current?.click(); });

  const { fw: frameW, fh: frameH } = frameDims(ratio, nat);
  const baseScale = nat ? Math.max(frameW / nat.w, frameH / nat.h) : 1;
  const dispScale = baseScale * zoom;
  const dispW = nat ? nat.w * dispScale : 0;
  const dispH = nat ? nat.h * dispScale : 0;

  const clamp = (o, dw = dispW, dh = dispH, fw = frameW, fh = frameH) => ({
    x: Math.min(0, Math.max(fw - dw, o.x)),
    y: Math.min(0, Math.max(fh - dh, o.y)),
  });

  const fit = (natSize, r) => {
    const { fw, fh } = frameDims(r, natSize);
    const bs = Math.max(fw / natSize.w, fh / natSize.h);
    setZoom(1);
    setOffset({ x: (fw - natSize.w * bs) / 2, y: (fh - natSize.h * bs) / 2 });
  };

  const onLoad = (e) => {
    const size = { w: e.target.naturalWidth, h: e.target.naturalHeight };
    setNat(size);
    fit(size, ratio);
  };

  const pickRatio = (r) => { setRatio(r); if (nat) fit(nat, r); };

  const zoomTo = (z) => {
    if (!nat) { setZoom(z); return; }
    const cx = frameW / 2, cy = frameH / 2;
    const oldScale = baseScale * zoom;
    const newScale = baseScale * z;
    const imgX = (cx - offset.x) / oldScale;
    const imgY = (cy - offset.y) / oldScale;
    setZoom(z);
    setOffset(clamp({ x: cx - imgX * newScale, y: cy - imgY * newScale }, nat.w * newScale, nat.h * newScale));
  };

  const down = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!drag.current) return;
    setOffset(clamp({ x: drag.current.ox + (e.clientX - drag.current.sx), y: drag.current.oy + (e.clientY - drag.current.sy) }));
  };
  const up = () => { drag.current = null; };

  const confirm = async () => {
    if (!nat || !imgRef.current) return;
    setBusy(true);
    const sw = frameW / dispScale;
    const sh = frameH / dispScale;
    const sx = -offset.x / dispScale;
    const sy = -offset.y / dispScale;
    const ar = sw / sh;
    let outW, outH;
    if (ar >= 1) { outW = Math.min(OUTPUT_MAX_DIM, Math.round(sw)); outH = Math.round(outW / ar); }
    else { outH = Math.min(OUTPUT_MAX_DIM, Math.round(sh)); outW = Math.round(outH * ar); }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(24, outW);
    canvas.height = Math.max(24, outH);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      setBusy(false);
      onConfirm(blob, URL.createObjectURL(blob));
    }, "image/jpeg", 0.92);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-4" onClick={onCancel}>
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-2xl sm:max-h-[85dvh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100"><Crop size={18} /> Recadrer l'image</h2>
          <button onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
        </div>

        <div className="modal-body soft-scroll flex flex-col items-center p-5">
          <div className="mb-4 flex flex-wrap justify-center gap-1.5">
            {RATIOS.map((r) => (
              <button
                key={r.label}
                onClick={() => pickRatio(r.v)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  (r.v === "free" ? ratio === "free" : ratio !== "free" && Math.abs(ratio - r.v) < 0.001)
                    ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center" style={{ height: FRAME_MAX }}>
            <div
              className="relative touch-none overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700"
              style={{ width: frameW, height: frameH, cursor: "grab" }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerLeave={up}
            >
              <img
                ref={imgRef}
                src={src}
                alt=""
                onLoad={onLoad}
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{ left: offset.x, top: offset.y, width: dispW || "auto", height: dispH || "auto" }}
              />
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/40">
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
              </div>
            </div>
          </div>

          <div className="mt-4 flex w-full max-w-xs items-center gap-3">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Zoom</span>
            <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(e) => zoomTo(parseFloat(e.target.value))} className="flex-1 accent-violet-600" />
          </div>
          <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
            Glissez pour cadrer. L'image sera compressée sous {MAX_IMAGE_KB} Ko à l'envoi.
          </p>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <button onClick={onCancel} className="flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 sm:flex-none sm:py-2">Annuler</button>
          <button ref={confirmRef} onClick={confirm} disabled={busy || !nat} className="flex-1 whitespace-nowrap rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40 sm:flex-none sm:py-2">
            {busy ? "Traitement…" : "Recadrer et ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
