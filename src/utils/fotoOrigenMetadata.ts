/**
 * spec_adjuntar_foto_galeria.md: `fechaOriginal` se guarda tal cual la marcó el dispositivo, sin
 * convertir zona horaria -- se elige el formato de EXIF `DateTimeOriginal` ("YYYY:MM:DD HH:MM:SS")
 * como forma única sin importar el origen de la foto, para que el Dashboard tenga un solo formato
 * que parsear (ver dashboard/lib/hooks/use-fotos-metadata.ts).
 */

/** Hora local del dispositivo en el instante de la captura -- getters LOCALES de Date (nunca
 * toISOString(), que es UTC), para que una foto de cámara y una de galería queden en el mismo
 * formato y la misma noción de "hora tal cual, sin convertir". */
export function formatearFechaOriginalLocal(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}:${dos(fecha.getMonth() + 1)}:${dos(fecha.getDate())} ${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:${dos(fecha.getSeconds())}`;
}

/** EXIF `DateTimeOriginal` ya viene en ese mismo formato -- se guarda tal cual, sin parsear ni
 * reformatear. `undefined`/vacío (sin EXIF: capturas de pantalla, fotos reenviadas por WhatsApp)
 * se guarda como `null`, nunca como error -- la foto se sube igual. */
export function leerFechaOriginalExif(exif: Record<string, unknown> | null | undefined): string | null {
  const valor = exif?.DateTimeOriginal;
  return typeof valor === "string" && valor.trim().length > 0 ? valor : null;
}
