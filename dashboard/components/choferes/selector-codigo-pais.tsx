"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { normalizarParaComparar } from "@/lib/choferes";
import { ISO_POR_PAIS, PAISES } from "@/lib/paises";
import { codigoMarcacion } from "@/lib/telefono-pais";

interface Props {
  /** Nombre de PAISES (dashboard/lib/paises.ts) — nunca el código ISO ni el de marcación. */
  value: string;
  onChange: (pais: string) => void;
  disabled?: boolean;
}

/** spec_telefono_pais_selector.md, Fase 1 punto 3: no había ningún listbox filtrable en el
 * Dashboard para reusar — el desplegable de país de nacimiento (Hallazgo #35) es un `<select>`
 * nativo, sin filtro por texto. Este componente es nuevo, scoped acá (no en `components/ui/`)
 * porque todavía no hay un segundo uso — mismo criterio que ya siguió la app móvil con
 * `SelectorPais.tsx`/`SelectorBuscable.tsx` (Hallazgo #10): generalizar recién cuando aparezca un
 * segundo caso real, no antes.
 *
 * El "adorno" (botón cerrado) muestra el ISO alpha-2 en texto + el código de marcación — nunca un
 * emoji de bandera (no se renderiza en Windows) y nunca el nombre completo del país, que solo
 * aparece dentro del panel filtrable. Por eso la fila [selector + número] nunca necesita un
 * layout de columna en pantallas angostas: lo que ocupa espacio en la fila es un rótulo corto
 * ("ES +34"), no un nombre de país que pueda truncar. */
export function SelectorCodigoPais({ value, onChange, disabled }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputBusquedaRef = useRef<HTMLInputElement>(null);

  function cerrar() {
    setAbierto(false);
    setBusqueda("");
  }

  useEffect(() => {
    if (!abierto) return;
    function manejarClickFuera(evento: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target as Node)) {
        cerrar();
      }
    }
    function manejarTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") cerrar();
    }
    document.addEventListener("mousedown", manejarClickFuera);
    document.addEventListener("keydown", manejarTeclado);
    return () => {
      document.removeEventListener("mousedown", manejarClickFuera);
      document.removeEventListener("keydown", manejarTeclado);
    };
  }, [abierto]);

  useEffect(() => {
    if (abierto) inputBusquedaRef.current?.focus();
  }, [abierto]);

  const consulta = normalizarParaComparar(busqueda.trim());
  const opcionesFiltradas = consulta
    ? PAISES.filter((pais) => normalizarParaComparar(pais).includes(consulta))
    : PAISES;

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setAbierto((actual) => !actual)}
        disabled={disabled}
        aria-label="Elegir país para el código de marcación"
        className="flex h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:h-9"
      >
        <span className="font-medium">{ISO_POR_PAIS[value] ?? "—"}</span>
        <span className="text-muted-foreground">+{codigoMarcacion(value) || "—"}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {abierto && (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputBusquedaRef}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar país…"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {opcionesFiltradas.map((pais) => (
              <li key={pais}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(pais);
                    cerrar();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted",
                    pais === value && "bg-muted font-medium"
                  )}
                >
                  <span className="w-6 shrink-0 text-xs text-muted-foreground">
                    {ISO_POR_PAIS[pais]}
                  </span>
                  <span className="flex-1 truncate">{pais}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    +{codigoMarcacion(pais)}
                  </span>
                </button>
              </li>
            ))}
            {opcionesFiltradas.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
