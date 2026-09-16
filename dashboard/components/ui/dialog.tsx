"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Modal simple sin dependencias (sin Radix): overlay + panel montados por
 * portal en document.body, cierre con Escape/click-afuera/botón X. Alcanza
 * para el detalle de jornada de este Dashboard sin sumar una librería más.
 */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    // `lg` (no `sm`) a propósito: un teléfono en horizontal suele superar los
    // 640px de `sm`, así que con ese corte el modal volvía al tamaño
    // centrado de escritorio dentro de una pantalla angosta en alto — mismo
    // problema que el layout general (ver contexto_proyecto.md §4). El botón
    // de cerrar comparte el mismo corte que el propio modal: mientras esté a
    // pantalla completa (< lg) se queda con el área de toque grande; recién
    // vuelve a su tamaño chico cuando el modal también vuelve a ser el
    // centrado de escritorio (≥ lg).
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 lg:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 h-full w-full max-w-2xl overflow-y-auto rounded-none border-0 bg-card text-card-foreground shadow-xl lg:h-auto lg:max-h-[90dvh] lg:rounded-lg lg:border lg:border-border",
          className
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-3.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
