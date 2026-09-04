"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const suscribirSinCambios = () => () => {};

/**
 * Evita mismatch de hidratación: el tema resuelto solo se conoce en el
 * cliente (depende de localStorage / prefers-color-scheme). Se usa
 * useSyncExternalStore (en vez de useState+useEffect) porque es el patrón
 * recomendado por React para exponer un valor que difiere entre servidor y
 * cliente sin disparar un setState síncrono dentro de un efecto.
 */
function useMontado(): boolean {
  return useSyncExternalStore(
    suscribirSinCambios,
    () => true,
    () => false
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const montado = useMontado();

  if (!montado) {
    return <Button variant="ghost" size="icon" aria-label="Cambiar tema" disabled />;
  }

  const esOscuro = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={esOscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      onClick={() => setTheme(esOscuro ? "light" : "dark")}
    >
      {esOscuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
