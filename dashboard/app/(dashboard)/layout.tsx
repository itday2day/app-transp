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

      <div className="flex min-w-0 flex-1 flex-col">
        {/* landscape:max-lg:py-1 — en teléfono horizontal, header + nav +
            selector (este último solo en /mapa, ver mapa/page.tsx) sumaban
            183px de un viewport de ~390px, sin dejar alto usable para el
            mapa/la lista (Hallazgo #14, medido en el dispositivo). Compactar
            padding no toca vertical ni escritorio — el corte es `max-lg` +
            `landscape` a la vez, así que una tablet o ventana de escritorio
            angosta apaisada no entra en esta rama. */}
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 landscape:max-lg:py-1 lg:justify-end">
          <div className="flex items-center gap-2 lg:hidden">
            <Truck className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold landscape:max-lg:hidden">app-transp</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>

        <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-card px-2 py-2 landscape:max-lg:py-1 lg:hidden">
          <SidebarNav horizontal />
          {/* Slot para que /mapa fusione ahí su selector "Mapa/Lista" en
              teléfono horizontal, vía createPortal (mapa/page.tsx) — evita
              que este layout compartido por todas las rutas necesite conocer
              cuál es la ruta actual. En cualquier otra pantalla (ej.
              /jornadas) el slot queda vacío: `display: contents` no agrega
              ninguna caja ni ocupa espacio por sí solo. */}
          <div id="selector-movil-horizontal" className="contents" />
        </div>

        {/* `flex flex-col` (no solo `flex-1`): una página como /mapa necesita
            que su hijo raíz llene el alto disponible con `flex-1` — un
            `height:100%` ahí, colgando de un `main` que NO es un contenedor
            flex, es percentage-height intercalado entre dos `flex-1`, que no
            está garantizado por spec como "definido" y fue la causa real de
            que el mapa quedara con alto 0 (ver contexto_proyecto.md §4). */}
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
