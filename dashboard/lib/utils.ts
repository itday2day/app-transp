import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formatea un ISO 8601 a fecha+hora corta en es-ES. */
export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** "hace X s/min/h" a partir de un ISO 8601, para el panel de choferes activos. */
export function formatHaceTiempo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const entonces = new Date(iso).getTime();
  if (Number.isNaN(entonces)) return "—";
  const segundos = Math.max(0, Math.floor((Date.now() - entonces) / 1000));
  if (segundos < 5) return "justo ahora";
  if (segundos < 60) return `hace ${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIsoDate(days: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - days);
  return fecha.toISOString().slice(0, 10);
}
