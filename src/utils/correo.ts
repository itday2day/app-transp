// ⚠️ COPIA LITERAL de dashboard/lib/correo.ts (app-transp-project, dashboard) -- mismo criterio
// que numeroEmpleadoAEmail() en src/services/authService.ts o la lista de países en
// src/data/paises.ts: duplicada a propósito (son dos proyectos independientes, cada uno con su
// propio bundle), no inventada acá. Si se toca un lado, tocar el otro en el mismo commit. La
// ÚNICA diferencia sintáctica con el original del Dashboard es el tipo de
// CASOS_PRUEBA_SUGERENCIA_CORREO más abajo (`readonly {...}[]` en vez de `ReadonlyArray<{...}>`
// -- misma forma, para que el `eslint` de la app, que prohíbe `ReadonlyArray<T>`, quede sin
// avisos); el Dashboard tiene su propio `eslint` y no exige esa regla.
// spec_bloque_b_alta_asistida_enlace_unico.md (ajuste al Hallazgo #51), "Resolución de la Fase 1"
// (2026-10-14), criterio 39 -- aviso de posible errata en el dominio del correo, NUNCA bloqueante
// (quien llama decide qué hacer con la sugerencia).
export const DOMINIOS_POPULARES = [
  "gmail.com",
  "hotmail.com",
  "hotmail.es",
  "outlook.com",
  "outlook.es",
  "yahoo.com",
  "yahoo.es",
  "icloud.com",
  "live.com",
  "msn.com",
  "protonmail.com",
  "proton.me",
  "movistar.es",
  "telefonica.net",
  "orange.es",
  "vodafone.es",
  "yoigo.com",
] as const;

/** Distancia de Levenshtein, sin dependencia nueva -- programación dinámica clásica, O(n·m). */
export function distanciaEdicion(a: string, b: string): number {
  const filas = a.length + 1;
  const columnas = b.length + 1;
  const dp: number[][] = Array.from({ length: filas }, () => new Array(columnas).fill(0));
  for (let i = 0; i < filas; i++) dp[i][0] = i;
  for (let j = 0; j < columnas; j++) dp[0][j] = j;
  for (let i = 1; i < filas; i++) {
    for (let j = 1; j < columnas; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + costo);
    }
  }
  return dp[filas - 1][columnas - 1];
}

// Umbral por longitud del dominio POPULAR (el de la lista, no el que escribió la persona): 1
// para los de hasta 8 caracteres, 2 para los más largos -- regla literal de la "Resolución de la
// Fase 1" de la spec, no un número elegido acá.
function umbralPermitido(dominioPopular: string): number {
  return dominioPopular.length <= 8 ? 1 : 2;
}

/** Si el dominio del correo se parece a uno de la lista, devuelve el correo completo con ese
 * dominio corregido. Devuelve `null` si: no hay `@`; el dominio ya coincide EXACTO con uno de la
 * lista (nunca se sugiere una coincidencia exacta); ningún dominio de la lista queda dentro de su
 * umbral permitido; o dos o más dominios empatan en la distancia mínima (ambiguo -- no se
 * sugiere, para no arriesgar una sugerencia equivocada). Nunca lanza, nunca bloquea: es una
 * sugerencia, quien llama decide qué hacer con ella (criterio 39). */
export function sugerirCorreccionCorreo(correo: string): string | null {
  const arroba = correo.lastIndexOf("@");
  if (arroba === -1) return null;

  const local = correo.slice(0, arroba);
  const dominio = correo
    .slice(arroba + 1)
    .trim()
    .toLowerCase();
  if (!dominio) return null;

  if ((DOMINIOS_POPULARES as readonly string[]).includes(dominio)) return null;

  let mejorDistancia = Infinity;
  let mejoresDominios: string[] = [];
  for (const candidato of DOMINIOS_POPULARES) {
    const distancia = distanciaEdicion(dominio, candidato);
    if (distancia === 0 || distancia > umbralPermitido(candidato)) continue;
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia;
      mejoresDominios = [candidato];
    } else if (distancia === mejorDistancia) {
      mejoresDominios.push(candidato);
    }
  }

  if (mejoresDominios.length !== 1) return null;
  return `${local}@${mejoresDominios[0]}`;
}

// Forma básica de un correo (criterio 31) -- no pretende validar que el dominio exista de
// verdad: eso lo decide el envío real del código de verificación, no esta regex.
export const CORREO_VALIDO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Los ~12 casos de prueba de `sugerirCorreccionCorreo()` (ajuste del Hallazgo #51, "Resolución
 * de la Fase 1", 2026-10-14) -- tabla LITERAL, para que `src/` copie exactamente esta misma tabla
 * en su propia implementación (duplicada a propósito, los dos proyectos son independientes) y
 * las dos queden corridas contra los mismos casos, sin desincronizarse. `sugerencia: null`
 * significa "no se sugiere nada" (coincidencia exacta, sin ningún dominio dentro del umbral, o
 * empate ambiguo entre dos o más). El caso 12 es un EMPATE REAL, no inventado: encontrado por
 * búsqueda exhaustiva de mutaciones de hasta 2 ediciones sobre los 17 dominios de
 * DOMINIOS_POPULARES -- "hamail.com" queda a distancia 2 de "gmail.com" Y de "hotmail.com" a la
 * vez. */
export const CASOS_PRUEBA_SUGERENCIA_CORREO: readonly {
  correo: string;
  sugerencia: string | null;
  motivo: string;
}[] = [
  {
    correo: "juan@gmial.com",
    sugerencia: "juan@gmail.com",
    motivo: "transposición, distancia 2, dominio de 9 caracteres -> umbral 2",
  },
  {
    correo: "ana@hotmial.com",
    sugerencia: "ana@hotmail.com",
    motivo: "transposición, distancia 2, dominio de 11 caracteres -> umbral 2",
  },
  {
    correo: "pepe@gmail.con",
    sugerencia: "pepe@gmail.com",
    motivo: "sustitución final, distancia 1",
  },
  {
    correo: "maria@gmail.com",
    sugerencia: null,
    motivo: "coincidencia EXACTA -- nunca se sugiere lo mismo que ya está",
  },
  {
    correo: "carla@example.com",
    sugerencia: null,
    motivo: "demasiado lejos de cualquier dominio de la lista",
  },
  {
    correo: "luis@msn.con",
    sugerencia: "luis@msn.com",
    motivo: "dominio de 7 caracteres (<=8) -> umbral 1, distancia 1",
  },
  {
    correo: "sofia@liv.com",
    sugerencia: "sofia@live.com",
    motivo: "dominio de 8 caracteres (<=8) -> umbral 1, distancia 1 (inserción)",
  },
  {
    correo: "pedro@mdn.cox",
    sugerencia: null,
    motivo: "dominio de 7 caracteres (<=8) -> umbral 1, pero distancia 2 a msn.com: se pasa",
  },
  {
    correo: "laura@Gmail.COM",
    sugerencia: null,
    motivo: "coincide exacto tras normalizar a minúsculas",
  },
  {
    correo: "diego@acme.org",
    sugerencia: null,
    motivo: "sin ningún dominio de la lista dentro de su umbral",
  },
  {
    correo: "nora@protonmail.con",
    sugerencia: "nora@protonmail.com",
    motivo: "dominio de 14 caracteres (>8) -> umbral 2, distancia 1",
  },
  {
    correo: "lucas@hamail.com",
    sugerencia: null,
    motivo: "EMPATE real: distancia 2 a la vez a gmail.com y a hotmail.com -- ambiguo, no sugiere",
  },
];
