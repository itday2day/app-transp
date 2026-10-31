"use client";

import { useQuery } from "@tanstack/react-query";

const BUCKET_EVIDENCIAS = "evidencias";

// Misma forma que devuelve /api/jornadas/fotos-metadata (ver ese Route Handler) -- duplicado a
// propósito en vez de importado desde app/api/**: un archivo de route.ts no es un módulo pensado
// para importarse desde el cliente.
export interface MetadatoFotoStorage {
  origen: "camara" | "galeria";
  fechaOriginal: string | null;
}

/** La ruta de Storage dentro del bucket `evidencias` a partir de la URL pública guardada en
 * `jornadas` -- el Route Handler nuevo (info()) necesita la ruta, no la URL completa. `null` si
 * la URL no tiene la forma esperada (no debería pasar con URLs que esta misma app generó, pero
 * nunca bloquea nada: esa foto simplemente no pide metadata). */
function rutaDesdeUrlPublica(url: string): string | null {
  const marcador = `/object/public/${BUCKET_EVIDENCIAS}/`;
  const indice = url.indexOf(marcador);
  return indice === -1 ? null : url.slice(indice + marcador.length);
}

async function obtenerMetadatos(
  urls: string[]
): Promise<Record<string, MetadatoFotoStorage | null>> {
  const pares = urls
    .map((url) => ({ url, ruta: rutaDesdeUrlPublica(url) }))
    .filter((par): par is { url: string; ruta: string } => par.ruta != null);

  if (pares.length === 0) return {};

  const respuesta = await fetch("/api/jornadas/fotos-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rutas: pares.map((p) => p.ruta) }),
  });
  // Un fallo de red/autenticación nunca bloquea el detalle de la jornada -- las fotos siguen
  // mostrándose, solo sin la etiqueta "Galería · ...".
  if (!respuesta.ok) return {};

  const cuerpo = (await respuesta.json()) as {
    metadatos: Record<string, MetadatoFotoStorage | null>;
  };
  const porUrl: Record<string, MetadatoFotoStorage | null> = {};
  for (const { url, ruta } of pares) {
    porUrl[url] = cuerpo.metadatos[ruta] ?? null;
  }
  return porUrl;
}

/**
 * Metadata (origen + fecha original) de cada foto de una jornada, por URL pública -- ver el
 * Route Handler /api/jornadas/fotos-metadata (info() del lado del servidor, service_role).
 * spec_adjuntar_foto_galeria.md. `staleTime` alto, mismo criterio que useDireccion: la metadata de
 * una foto ya subida no cambia.
 */
export function useFotosMetadata(urls: (string | null | undefined)[]) {
  const urlsValidas = Array.from(new Set(urls.filter((u): u is string => Boolean(u)))).sort();
  return useQuery({
    queryKey: ["fotos-metadata", urlsValidas],
    queryFn: () => obtenerMetadatos(urlsValidas),
    enabled: urlsValidas.length > 0,
    staleTime: 60 * 60 * 1000,
  });
}
