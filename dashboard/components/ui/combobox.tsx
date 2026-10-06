"use client";

import { Command } from "cmdk";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ComboboxProps {
  etiqueta: string;
  valor: string;
  opciones: string[];
  placeholder?: string;
  deshabilitado?: boolean;
  /** Se muestra en vez del placeholder cuando `deshabilitado` -- ej. "Elegí una empresa primero". */
  textoDeshabilitado?: string;
  /** Texto del botón para dar de alta lo que el usuario escribió, cuando no matchea ninguna
   * opción existente (ej. "Agregar empresa nueva"). */
  textoAgregar: string;
  onSeleccionar: (valor: string) => void;
  idPrefix: string;
}

/** Selector con búsqueda + "agregar nueva" (spec_catalogo_empresas_rutas.md, Hallazgo #48) —
 * cmdk da la lógica de filtrado/teclado, el panel flotante es un <div absolute> propio en vez de
 * sumar @radix-ui/react-popover (solo se aprobó cmdk): mismo criterio liviano que ya usa el resto
 * del Dashboard (Dialog/Select son wrappers finos sin una librería de posicionamiento aparte).
 * Reutiliza el estilo visual de Input/Select (radius-md, border-border, bg-card) para que no se
 * note que es un componente distinto. */
export function Combobox({
  etiqueta,
  valor,
  opciones,
  placeholder,
  deshabilitado,
  textoDeshabilitado,
  textoAgregar,
  onSeleccionar,
  idPrefix,
}: ComboboxProps) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function manejarClickFuera(evento: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", manejarClickFuera);
    return () => document.removeEventListener("mousedown", manejarClickFuera);
  }, [abierto]);

  const busquedaNormalizada = busqueda.trim().toLocaleLowerCase("es");
  const yaExiste = opciones.some((o) => o.toLocaleLowerCase("es") === busquedaNormalizada);
  const mostrarAgregar = busqueda.trim() !== "" && !yaExiste;

  function elegir(nuevoValor: string) {
    onSeleccionar(nuevoValor);
    setAbierto(false);
  }

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        id={`${idPrefix}-trigger`}
        disabled={deshabilitado}
        onClick={() => {
          setBusqueda("");
          setAbierto((a) => !a);
        }}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-md border border-border bg-card px-3 py-1 text-left text-base text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:text-sm"
        )}
      >
        <span className={cn(!valor && "text-muted-foreground")}>
          {valor || (deshabilitado ? textoDeshabilitado : placeholder) || etiqueta}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {abierto && !deshabilitado && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card shadow-md">
          <Command loop shouldFilter={false}>
            <Command.Input
              autoFocus
              value={busqueda}
              onValueChange={setBusqueda}
              placeholder={placeholder}
              className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <Command.List className="max-h-56 overflow-y-auto p-1">
              {opciones
                .filter((o) => o.toLocaleLowerCase("es").includes(busquedaNormalizada))
                .map((opcion) => (
                  <Command.Item
                    key={opcion}
                    value={opcion}
                    onSelect={() => elegir(opcion)}
                    className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm text-foreground data-[selected=true]:bg-muted"
                  >
                    {opcion}
                    {opcion === valor && <Check className="h-4 w-4 text-primary" />}
                  </Command.Item>
                ))}

              {mostrarAgregar && (
                <Command.Item
                  value={`__agregar__${busqueda}`}
                  onSelect={() => elegir(busqueda.trim())}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary data-[selected=true]:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                  {textoAgregar} &quot;{busqueda.trim()}&quot;
                </Command.Item>
              )}

              {opciones.length === 0 && !mostrarAgregar && (
                <Command.Empty className="px-2 py-1.5 text-sm text-muted-foreground">
                  Sin opciones todavía.
                </Command.Empty>
              )}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  );
}
