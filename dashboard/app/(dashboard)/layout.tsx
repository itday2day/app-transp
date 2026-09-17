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
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:justify-end">
          <div className="flex items-center gap-2 lg:hidden">
            <Truck className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">app-transp</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>

        <div className="overflow-x-auto border-b border-border bg-card px-2 py-2 lg:hidden">
          <SidebarNav horizontal />
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
