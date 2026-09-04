import { Truck } from "lucide-react";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <Truck className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">app-transp</span>
        </div>
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:justify-end">
          <div className="flex items-center gap-2 md:hidden">
            <Truck className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">app-transp</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>

        <div className="overflow-x-auto border-b border-border bg-card px-2 py-2 md:hidden">
          <SidebarNav horizontal />
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
