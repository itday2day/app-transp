"use client";

import { ClipboardList, Map as MapIcon, Truck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ENLACES = [
  { href: "/mapa", label: "Mapa en vivo", icon: MapIcon },
  { href: "/jornadas", label: "Jornadas", icon: ClipboardList },
  { href: "/flota", label: "Flota", icon: Truck },
];

export function SidebarNav({ horizontal = false }: { horizontal?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "flex gap-1",
        // landscape:max-lg:flex-col — este mismo componente se renderiza dos
        // veces con horizontal=true (Hallazgo #14/#15): una vez en la fila
        // horizontal de arriba (oculta en teléfono horizontal) y otra en la
        // columna vertical del costado (visible solo ahí) — no hace falta un
        // tercer modo/prop, la orientación de columna solo importa cuando
        // esta instancia es la visible.
        horizontal
          ? "flex-row p-0 landscape:max-lg:w-full landscape:max-lg:flex-col"
          : "flex-1 flex-col p-2"
      )}
    >
      {ENLACES.map(({ href, label, icon: Icon }) => {
        const activo = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className={cn(
              // max-lg:h-11 (las dos orientaciones, no solo landscape): en
              // vertical este pill también estaba por debajo del piso de
              // 44px de área de toque (Hallazgo #11, Parte D — quedó
              // pendiente de esa corrección porque no estaba en su alcance).
              // Alto explícito en vez de inflar el padding, que además se
              // comparte con el modo vertical del sidebar de escritorio (sin
              // tocar, `max-lg` no llega a `lg`). En la columna del Hallazgo
              // #15 (landscape únicamente), w-full + justify-center centra
              // el ícono en el ancho angosto disponible.
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors max-lg:h-11 landscape:max-lg:w-full landscape:max-lg:justify-center",
              activo
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {/* Ícono solo en la columna angosta (Hallazgo #15) — "Mapa en
                vivo" no entra en una línea a ~120px de ancho. El nombre
                accesible (`aria-label` arriba) no depende de que este texto
                esté visible. */}
            <span className="landscape:max-lg:hidden">{label}</span>
          </Link>
        );
      })}
      {!horizontal && (
        <div className="mt-auto flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Truck className="h-4 w-4 shrink-0" />
          app-transp
        </div>
      )}
    </nav>
  );
}
