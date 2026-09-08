import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  contenido: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Tooltip mínimo sin dependencias (sin Radix): `group-hover`/`group-focus`
 * puro de Tailwind, sin JS ni portal. Alcanza para textos cortos de
 * información (ver Badge "Editado" en TablaJornadas) sin sumar una librería
 * más — mismo criterio que Dialog.
 */
export function Tooltip({ contenido, children, className }: TooltipProps) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      <span tabIndex={0} className="inline-flex outline-none">
        {children}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-max max-w-64 -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {contenido}
      </span>
    </span>
  );
}
