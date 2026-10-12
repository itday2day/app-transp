import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El repo tiene otro package-lock.json en la carpeta padre (server/mock es
  // hermano de este proyecto); esto fija explícitamente la raíz del
  // workspace en dashboard/ para que Turbopack no la infiera mal.
  turbopack: {
    root: path.join(__dirname),
  },
  // Hallazgo #51, criterio 14: la pantalla pública de invitación lleva el token en la URL -- un
  // Referer que viajara a otro sitio (un enlace externo clickeado desde ahí, o una carga de
  // recurso de terceros) filtraría ese token fuera de nuestro control. Header HTTP real (no solo
  // un <meta name="referrer">): cubre cualquier request que el navegador dispare para esa página,
  // no solo lo que el propio HTML declara. X-Robots-Tag acompaña al `robots` de la metadata de la
  // página (los dos, no uno solo) -- un rastreador que ignore el meta tag todavía ve el header.
  // Cache-Control: no-store -- una invitación cambia de estado (usada/revocada/vencida) y el
  // token es sensible; un proxy o el propio navegador guardando una respuesta vieja en caché
  // podría mostrar "válida" (o la empresa/ruta de otra invitación) después de que ya no lo es, o
  // dejar el HTML con el token dando vueltas en una caché compartida más tiempo del necesario.
  async headers() {
    return [
      {
        source: "/invitacion/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
