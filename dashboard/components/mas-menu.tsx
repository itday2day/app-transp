"use client";

import { Menu as MenuIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface EntradaMasMenu {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ANCHO_MENU_PX = 192;

/**
 * Menú "Más" de la navegación (spec_catalogo_por_chofer.md, Etapa 2, decisión D6): portal a
 * document.body con `position: fixed`, posición calculada desde getBoundingClientRect() del
 * botón -- nunca un `absolute` dentro de un contenedor con `overflow`, que lo recortaría en la
 * columna de 128px de teléfono horizontal (landscape:max-lg:w-32 en layout.tsx). Esa columna está
 * pegada al borde DERECHO de la pantalla: si no entra abierto hacia la derecha, se alinea por el
 * borde derecho del botón en vez de por el izquierdo, para no salirse de la pantalla.
 *
 * Cierra con Escape, con click/touch fuera, y también en scroll (capturado en toda la jerarquía,
 * no solo window -- la columna angosta tiene su propio overflow-y-auto), resize y
 * orientationchange. Al abrir mueve el foco al primer ítem; al cerrar lo devuelve al botón.
 */
export function MasMenu({ entradas }: { entradas: EntradaMasMenu[] }) {
  const pathname = usePathname();
  // Corrección C2(a): "activo" también cuando la ruta actual es una de las que viven DENTRO del
  // menú (criterio 10 de la spec) -- no solo mientras está abierto, igual que los demás ítems de
  // la barra.
  const activoPorRuta = entradas.some(
    (entrada) => pathname === entrada.href || pathname.startsWith(`${entrada.href}/`)
  );
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<{ top: number; left?: number; right?: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const primerItemRef = useRef<HTMLAnchorElement>(null);

  function calcularPosicion() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const espacioDerecha = window.innerWidth - rect.left;
    if (espacioDerecha >= ANCHO_MENU_PX) {
      setPosicion({ top: rect.bottom + 4, left: rect.left });
    } else {
      setPosicion({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }

  function abrir() {
    calcularPosicion();
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!abierto) return;
    // Corrección C2(d): preventScroll evita que el propio navegador haga scroll para traer el
    // elemento enfocado a la vista -- sin esto, ESE scroll disparaba el listener de "cerrar en
    // scroll" de más abajo en el mismo tick en que el menú se acababa de abrir.
    primerItemRef.current?.focus({ preventScroll: true });

    function onKeyDown(evento: KeyboardEvent) {
      if (evento.key === "Escape") cerrar();
    }
    function onClickFuera(evento: PointerEvent) {
      const objetivo = evento.target as Node;
      if (menuRef.current?.contains(objetivo) || triggerRef.current?.contains(objetivo)) return;
      cerrar();
    }
    function onScrollOCambio() {
      cerrar();
    }

    document.addEventListener("keydown", onKeyDown);
    // pointerdown, no mousedown (corrección C2(c)) -- cubre touch y mouse con el mismo evento.
    document.addEventListener("pointerdown", onClickFuera);
    // capture: true -- el scroll de un contenedor interno (la columna angosta de teléfono
    // horizontal) no burbujea hasta window como evento "scroll" normal.
    window.addEventListener("scroll", onScrollOCambio, true);
    window.addEventListener("resize", onScrollOCambio);
    window.addEventListener("orientationchange", onScrollOCambio);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onClickFuera);
      window.removeEventListener("scroll", onScrollOCambio, true);
      window.removeEventListener("resize", onScrollOCambio);
      window.removeEventListener("orientationchange", onScrollOCambio);
    };
  }, [abierto]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Más"
        onClick={() => (abierto ? cerrar() : abrir())}
        className={cn(
          "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors landscape:max-lg:w-full landscape:max-lg:justify-center",
          abierto || activoPorRuta
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <MenuIcon className="h-4 w-4 shrink-0" />
        <span className="landscape:max-lg:hidden">Más</span>
      </button>

      {abierto &&
        posicion &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: posicion.top,
              left: posicion.left,
              right: posicion.right,
            }}
            className="z-50 w-48 rounded-md border border-border bg-card p-1 shadow-md"
          >
            {entradas.map((entrada, indice) => {
              const activo = pathname === entrada.href || pathname.startsWith(`${entrada.href}/`);
              const Icon = entrada.icon;
              return (
                <Link
                  key={entrada.href}
                  href={entrada.href}
                  role="menuitem"
                  ref={indice === 0 ? primerItemRef : undefined}
                  onClick={cerrar}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-sm px-3 text-sm",
                    activo ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {entrada.label}
                </Link>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
