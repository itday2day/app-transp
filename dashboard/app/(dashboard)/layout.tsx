import Image from "next/image";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* spec_identidad_visual_day2day_enmienda.md: 134px (maqueta del canvas) no se vio bien en
          producción real — se revierte al ancho de siempre (224px, w-56, el mismo de los
          Hallazgos #13-#16), manteniendo el fondo negro y los tokens del Hallazgo #41. Los otros
          dos modos responsive de más abajo (tablet, teléfono horizontal) no se tocan. */}
      {/* bg-[#000000] literal, no bg-ink: mismo motivo que el panel de marca del login — esta
          barra es "chrome" de marca, siempre oscura, independiente del tema claro/oscuro. */}
      <aside className="hidden w-56 shrink-0 bg-[#000000] lg:flex lg:flex-col">
        {/* justify-center (Hallazgo #42): logo centrado en los 224px de la barra, sin estirarse
            — sigue siendo h-7 w-auto, solo cambia su alineación dentro del contenedor. */}
        <div className="flex justify-center px-4 py-6">
          {/* h-7 w-auto (altura fija, ancho automático), no h-auto w-full: a 224px de contenedor,
              un logo "w-full" se estira proporcionalmente mucho más grande de lo que se ve bien —
              decisión explícita de la enmienda, nunca width:100%/height:100% sin preservar el
              aspect ratio real del PNG. */}
          <Image
            src="/logo-blanco.png"
            alt="Day2Day Solutions"
            width={106}
            height={27}
            className="h-7 w-auto"
          />
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
          {/* grid grid-cols-[1fr_auto_1fr] por debajo de `lg` (tablet/teléfono vertical): el logo
              (columna "auto") queda matemáticamente centrado en el ancho del header sin importar
              cuánto ocupe el grupo de la derecha — las dos columnas "1fr" se reparten el resto en
              partes iguales. Verificado por aritmética (sin navegador real, mismo método que los
              Hallazgos #14-#16/#24): a 360px, el grupo derecho mide ~92px y cada columna 1fr tiene
              124px de sobra (>92px, no se aprieta) — centrado exacto, no aproximado, en los 4
              anchos medidos (360/390/768/1023). `lg:flex lg:justify-end`: en escritorio este
              header vuelve a su comportamiento de siempre (sin grid, logo oculto via `lg:hidden`
              de más abajo, controles pegados a la derecha) — el logo de esa pantalla es el de la
              barra lateral, no este. `landscape:max-lg:hidden`: teléfono horizontal sin cambios. */}
          <header className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-card px-4 py-3 landscape:max-lg:hidden lg:flex lg:justify-end">
            <div className="lg:hidden" />
            <Image
              src="/logo-negro.png"
              alt="Day2Day Solutions"
              width={96}
              height={25}
              className="h-auto w-24 justify-self-center lg:hidden"
            />
            <div className="flex items-center justify-end gap-2">
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
