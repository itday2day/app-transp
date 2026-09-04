"use client";

import { ClipboardList, Map as MapIcon, Truck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ENLACES = [
  { href: "/mapa", label: "Mapa en vivo", icon: MapIcon },
  { href: "/jornadas", label: "Jornadas", icon: ClipboardList },
];

export function SidebarNav({ horizontal = false }: { horizontal?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex gap-1", horizontal ? "w-full flex-row p-0" : "flex-1 flex-col p-2")}>
      {ENLACES.map(({ href, label, icon: Icon }) => {
        const activo = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activo
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
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
