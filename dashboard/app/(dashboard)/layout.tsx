import { Truck } from "lucide-react";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <Truck className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">app-transp</span>
        </div>
        <SidebarNav />
      </aside>

      {/* landscape:max-lg:flex-row — en teléfono horizontal el alto es el
          recurso escaso (~390px) y el ancho sobra (~850px); compactar el
          header y la nav en barras horizontales (Hallazgo #14) no alcanzó.
          Acá los mismos controles pasan a una columna angosta pegada al
          borde derecho (más abajo), y el contenido pasa a ocupar el alto
          completo del viewport — sin barras arriba. En vertical y en
          escritorio esta fila no se activa, sin ningún cambio. */}
      <div className="flex min-w-0 flex-1 flex-col landscape:max-lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col landscape:max-lg:order-1">
          {/* landscape:max-lg:hidden — este header+nav (horizontales, arriba)
              se reemplazan por la columna vertical de abajo; se ocultan acá
              en vez de borrarlos, así vertical/escritorio no cambian nada. */}
          <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 landscape:max-lg:hidden lg:justify-end">
            <div className="flex items-center gap-2 lg:hidden">
              <Truck className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">app-transp</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <LogoutButton />
            </div>
          </header>

          <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-card px-2 py-2 landscape:max-lg:hidden lg:hidden">
            <SidebarNav horizontal />
          </div>

          {/* `flex flex-col` (no solo `flex-1`): una página como /mapa
              necesita que su hijo raíz llene el alto disponible con
              `flex-1` — un `height:100%` ahí, colgando de un `main` que NO
              es un contenedor flex, es percentage-height intercalado entre
              dos `flex-1`, que no está garantizado por spec como "definido"
              y fue la causa real de que el mapa quedara con alto 0 (ver
              contexto_proyecto.md §4). `pl-[env(safe-area-inset-left)]`:
              en horizontal, el notch/la cámara pueden quedar de este lado
              según hacia dónde se rote el teléfono. */}
          <main className="flex min-w-0 flex-1 flex-col landscape:max-lg:pl-[env(safe-area-inset-left)]">
            {children}
          </main>
        </div>

        {/* Columna vertical de controles — SOLO teléfono horizontal
            (Hallazgo #15). Jerarquía de arriba abajo (Hallazgo #16):
            identidad (icono del logo) → navegación + selector "Mapa/Lista"
            (el slot solo recibe algo en /mapa — createPortal desde
            mapa/page.tsx, mismo mecanismo del Hallazgo #14) → utilidades
            (tema/sesión) empujadas al pie con `mt-auto` y separadas por un
            divisor, porque no son navegación y mezcladas con la nav se veían
            desprolijas. overflow-y-auto: si algún día no entran los
            controles, esta columna scrollea por dentro — nunca reintroduce
            scroll de página (invariante del Hallazgo #13).
            pr-[env(safe-area-inset-right)]: columna pegada al borde
            derecho, mismo motivo que el padding izquierdo de `main` arriba. */}
        <div className="hidden landscape:max-lg:order-2 landscape:max-lg:flex landscape:max-lg:w-32 landscape:max-lg:shrink-0 landscape:max-lg:flex-col landscape:max-lg:gap-1 landscape:max-lg:overflow-y-auto landscape:max-lg:border-l landscape:max-lg:border-border landscape:max-lg:bg-card landscape:max-lg:p-2 landscape:max-lg:pr-[calc(0.5rem+env(safe-area-inset-right))]">
          {/* El ícono del logo que vivía acá (decorativo, Hallazgo #16) se sacó al agregar
              "Flota" como 3ª entrada de nav (spec_flota_vehiculos.md): calculado por el mismo
              método de #16 (aritmética de clases Tailwind, sin dispositivo real), la columna
              pasaba de ~340px a ~388px sobre los ~390px disponibles — dentro del margen de error
              de esas cifras aproximadas. Sacar el logo (lo primero previsto para este caso,
              nunca fue un control) devuelve ~32px, dejando ~356px. El icono del header de arriba
              (visible siempre, no solo en esta columna) sigue cumpliendo el rol de identidad. */}
          <SidebarNav horizontal />
          <div id="selector-movil-horizontal" className="contents" />

          <div className="mt-auto flex flex-col gap-1 border-t border-border pt-2">
            <div className="flex justify-center">
              <ThemeToggle />
            </div>
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  );
}
