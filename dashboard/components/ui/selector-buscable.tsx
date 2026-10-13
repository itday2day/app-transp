"use client";

import { Command } from "cmdk";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SelectorBuscableProps<T> {
  idPrefix: string;
  /** Lista ya filtrada por el llamador (p.ej. solo `activo`) y en el orden en que debe mostrarse
   * (p.ej. ya ordenada por apellidos) -- este componente no decide ni "activo" ni el orden, solo
   * busca dentro de lo que recibe (ajuste del 2026-10-13, Parte B, criterio 11). */
  items: T[];
  valorId: string | null;
  getId: (item: T) => string;
  /** Texto principal de la opción ("Apellidos, Nombre"). */
  getPrimario: (item: T) => string;
  /** Texto secundario (DNI) en su propio espacio, o `null` si no hay. */
  getSecundario: (item: T) => string | null;
  /** Función pura de filtrado (p.ej. filtrarChoferes) -- este componente no decide CÓMO se busca,
   * solo la aplica sobre `items` con el texto que el usuario escribe. */
  filtrar: (items: T[], texto: string) => T[];
  onSeleccionar: (item: T) => void;
  placeholder?: string;
  /** Mensaje cuando `items` está vacío de entrada (p.ej. "No hay choferes activos") -- distinto
   * del mensaje de "sin resultados" de una búsqueda sin coincidencias. */
  textoSinOpciones: string;
  disabled?: boolean;
}

/**
 * Lista desplegable con buscador, genérica (ajuste del 2026-10-13, Parte B de
 * spec_ajuste_dni_columna_aparte_jornadas.md) -- mismo cimiento que ya usa
 * dashboard/components/ui/combobox.tsx (cmdk da rol/teclado/aria de combobox+listbox+option
 * gratis: confirmado en node_modules/cmdk que ya setea role="combobox"/"listbox"/"option",
 * aria-expanded y aria-activedescendant), generalizado para que cada opción pueda mostrar DOS
 * textos (nombre y DNI en su propio espacio) en vez de un solo string, que es lo que
 * `Combobox` (empresa/ruta) no necesitaba. No se copia esa lógica, se re-piensa para esto -- se
 * escribe reutilizable (puede usarse para cualquier T), aunque en este ajuste solo se conecta al
 * selector de chofer.
 *
 * ⚠️ Escape: a diferencia de `Combobox`, que no intercepta Escape (y por eso HOY, dentro de un
 * <Dialog>, Escape en el combobox de empresa/ruta cierra el diálogo entero -- comportamiento
 * heredado, no tocado acá porque está fuera de alcance de esta spec), este componente SÍ llama
 * `e.stopPropagation()` cuando la lista está abierta, antes de que el evento llegue al listener
 * de `document` que Dialog usa para cerrarse (criterio 8: "Escape cierra primero la lista y NO
 * el diálogo").
 */
export function SelectorBuscable<T>({
  idPrefix,
  items,
  valorId,
  getId,
  getPrimario,
  getSecundario,
  filtrar,
  onSeleccionar,
  placeholder,
  textoSinOpciones,
  disabled,
}: SelectorBuscableProps<T>) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  const itemSeleccionado = valorId != null ? items.find((i) => getId(i) === valorId) : undefined;
  const resultados = filtrar(items, busqueda);

  function abrir() {
    if (disabled) return;
    setBusqueda("");
    setAbierto(true);
  }

  function elegir(item: T) {
    onSeleccionar(item);
    setAbierto(false);
    // "al elegir, el foco vuelve al campo del formulario" (criterio 13) -- el trigger ES el
    // campo del formulario acá (no hay un <input> aparte que represente la elección ya hecha).
    triggerRef.current?.focus();
  }

  function manejarTeclaEnContenedor(evento: React.KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape" && abierto) {
      // Corta ACÁ: sin esto, el mismo Escape sigue burbujeando hasta el listener de `document`
      // que <Dialog> usa para cerrarse (dashboard/components/ui/dialog.tsx) -- cerraría el
      // diálogo entero en vez de solo esta lista.
      evento.stopPropagation();
      setAbierto(false);
      triggerRef.current?.focus();
    }
  }

  // El foco sale del selector entero (p.ej. Tab al siguiente campo) -> cierra la lista (retoque
  // del 2026-10-13). `relatedTarget` es el elemento que RECIBE el foco; si sigue dentro de
  // `contenedorRef` (el trigger, el input de búsqueda) no hay que cerrar nada.
  function manejarBlurEnContenedor(evento: React.FocusEvent<HTMLDivElement>) {
    const siguienteFoco = evento.relatedTarget as Node | null;
    if (!contenedorRef.current?.contains(siguienteFoco)) {
      setAbierto(false);
    }
  }

  // Sin esto, el mousedown sobre una opción (que cmdk no vuelve focuseable) le quita el foco al
  // input de búsqueda ANTES de que el click dispare onSelect -- eso activaría manejarBlurEnContenedor
  // y cerraría la lista sin elegir nada. preventDefault en mousedown conserva el foco en el input;
  // el click posterior sigue llegando normal y dispara `elegir` (que cierra a propósito, al elegir).
  function manejarMouseDownEnLista(evento: React.MouseEvent<HTMLDivElement>) {
    evento.preventDefault();
  }

  return (
    <div
      ref={contenedorRef}
      className="relative"
      onKeyDown={manejarTeclaEnContenedor}
      onBlur={manejarBlurEnContenedor}
    >
      <button
        ref={triggerRef}
        type="button"
        id={`${idPrefix}-trigger`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-1 text-left text-base text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:text-sm"
        )}
      >
        {itemSeleccionado ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate">
            <span className="truncate">{getPrimario(itemSeleccionado)}</span>
            {getSecundario(itemSeleccionado) && (
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {getSecundario(itemSeleccionado)}
              </span>
            )}
          </span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {abierto && !disabled && (
        <div
          className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card shadow-md"
          onMouseDown={manejarMouseDownEnLista}
        >
          <Command loop shouldFilter={false}>
            <Command.Input
              autoFocus
              value={busqueda}
              onValueChange={setBusqueda}
              placeholder={placeholder}
              className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <Command.List className="max-h-56 overflow-y-auto p-1">
              {items.length === 0 ? (
                <Command.Empty className="px-2 py-1.5 text-sm text-muted-foreground">
                  {textoSinOpciones}
                </Command.Empty>
              ) : resultados.length === 0 ? (
                <Command.Empty className="px-2 py-1.5 text-sm text-muted-foreground">
                  Sin resultados
                </Command.Empty>
              ) : (
                resultados.map((item) => {
                  const id = getId(item);
                  const secundario = getSecundario(item);
                  return (
                    <Command.Item
                      key={id}
                      value={id}
                      onSelect={() => elegir(item)}
                      className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-2 text-sm text-foreground data-[selected=true]:bg-muted"
                    >
                      <span className="truncate">{getPrimario(item)}</span>
                      {secundario && (
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {secundario}
                        </span>
                      )}
                    </Command.Item>
                  );
                })
              )}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  );
}
