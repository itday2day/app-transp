import type { SexoChofer } from "@/lib/types";

// ⚠️ COPIA EXACTA de numeroEmpleadoAEmail() en src/services/authService.ts (app móvil) — NO
// reimplementar por separado. El Dashboard y la app viven en el mismo monorepo pero son dos
// proyectos npm distintos (React Native vs. Next.js, sin un lib compartido entre los dos), así
// que compartir la función en tiempo de build no es práctico — se copia, con el costo escrito
// acá y en el otro lado (mismo criterio que desfaseMinutos(), Hallazgo #20): si esta cadena
// difiere en un solo carácter entre los dos lados, el chofer que el Dashboard acaba de crear NO
// PUEDE ENTRAR a la app, y no hay ningún error que lo explique — solo credenciales que no
// funcionan. Si algún día se toca CUALQUIERA de los dos lados, hay que tocar el otro en el mismo
// commit.
export function numeroEmpleadoAEmail(numeroEmpleado: string): string {
  return `apptransp.chofer.${numeroEmpleado}.f83a1c@gmail.com`;
}

// Sin caracteres que se confundan al dictar por teléfono: sin l/1, sin O/0, sin I. Longitud 12 —
// arriba del mínimo de 6 que exige registrarCuenta() hoy, con margen.
const ALFABETO_CONTRASENA_TEMPORAL = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const LONGITUD_CONTRASENA_TEMPORAL = 12;

/** Genera del lado del servidor una contraseña temporal legible al dictarla — nunca se guarda en
 * ningún lado, se devuelve una sola vez en la respuesta HTTP de crear/resetear. */
export function generarContrasenaTemporal(): string {
  const bytes = new Uint8Array(LONGITUD_CONTRASENA_TEMPORAL);
  crypto.getRandomValues(bytes);
  let contrasena = "";
  for (const byte of bytes) {
    contrasena += ALFABETO_CONTRASENA_TEMPORAL[byte % ALFABETO_CONTRASENA_TEMPORAL.length];
  }
  return contrasena;
}

export const SEXOS: SexoChofer[] = ["Masculino", "Femenino", "Otro"];

// Mismo patrón que DNI_VALIDO en RegistroScreen.tsx (app móvil) — el documento de identidad
// varía de formato según el país de origen, así que la validación es genérica.
export const DNI_VALIDO_REGEX = /^[A-Z0-9]{5,20}$/;

/** Misma regla que SelectorFecha.tsx (edadMinima=18 por defecto, el caso real de este
 * formulario) — replicada acá porque el Dashboard no puede reusar un componente de React
 * Native. */
export function edadMinimaCumplida(fechaNacimientoIso: string, edadMinima = 18): boolean {
  const nacimiento = new Date(fechaNacimientoIso);
  if (Number.isNaN(nacimiento.getTime())) return false;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const noCumplioAnioTodavia =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
  if (noCumplioAnioTodavia) edad--;
  return edad >= edadMinima;
}
