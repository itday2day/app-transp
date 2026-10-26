// Pruebas de lib/catalogo.ts, sin red ni Supabase real -- solo la lógica pura de normalización.
// Ejecutar desde dashboard/: npx tsx scripts/pruebas-catalogo.ts
import { claveNormalizada, normalizarNombreEmpresa, normalizarNombreRuta } from "@/lib/catalogo";

let fallos = 0;

function verificar(descripcion: string, obtenido: string, esperado: string): void {
  if (obtenido === esperado) {
    console.log(`OK   ${descripcion}`);
  } else {
    fallos++;
    console.error(`FAIL ${descripcion} -- obtenido "${obtenido}", esperado "${esperado}"`);
  }
}

// Los 12 casos medidos contra la base real (clave_normalizada), spec_catalogo_por_chofer.md Etapa 2.
const CASOS_CLAVE_NORMALIZADA: Array<[string, string]> = [
  ["Ñandú", "NANDU"],
  ["Çeuta", "CEUTA"],
  ["ÜBER", "UBER"],
  ["Straße", "STRASSE"],
  ["ÆON", "AEON"],
  ["Œuvre", "OEUVRE"],
  ["O’Brien", "O'BRIEN"],
  ["São Paulo", "SAO PAULO"],
  ["Łódź", "LODZ"],
  ["İstanbul", "ISTANBUL"],
  ["Ørsted", "ORSTED"],
  ["Đồng", "DONG"],
];

for (const [entrada, esperado] of CASOS_CLAVE_NORMALIZADA) {
  verificar(`claveNormalizada(${JSON.stringify(entrada)})`, claveNormalizada(entrada), esperado);
}

// ß: toUpperCase() de JS ya lo convierte a "SS" -- confirmado explícitamente, no asumido.
verificar('claveNormalizada("ß") usa toUpperCase para dar "SS"', claveNormalizada("ß"), "SS");

// Casos de colisión por acento -- la clave normalizada debe igualar dos grafías distintas del
// mismo nombre (lo que permite reencontrar "ÁLAMO" al buscar por la clave de "ALAMO").
verificar(
  'claveNormalizada("ALAMO") === claveNormalizada("ÁLAMO")',
  claveNormalizada("ALAMO") === claveNormalizada("ÁLAMO") ? "igual" : "distinto",
  "igual"
);
verificar(
  'claveNormalizada("Alamo") === claveNormalizada("  álamo  ")',
  claveNormalizada("Alamo") === claveNormalizada("  álamo  ") ? "igual" : "distinto",
  "igual"
);
verificar(
  'claveNormalizada ignora espacios colapsados ("JOPRIMSA  SUR" vs "joprimsa sur")',
  claveNormalizada("JOPRIMSA  SUR") === claveNormalizada("joprimsa sur") ? "igual" : "distinto",
  "igual"
);

// Idempotencia y colapso de espacios: mismas garantías que ya pedía normalizarNombreEmpresa/Ruta.
verificar(
  "normalizarNombreEmpresa colapsa espacios y pasa a mayúsculas",
  normalizarNombreEmpresa("  joprimsa   sur  "),
  "JOPRIMSA SUR"
);
verificar(
  "normalizarNombreRuta colapsa espacios y pasa a mayúsculas",
  normalizarNombreRuta("  ruta   400  "),
  "RUTA 400"
);

if (fallos > 0) {
  console.error(`\n${fallos} prueba(s) fallaron.`);
  process.exit(1);
}
console.log(
  `\nTodas las pruebas de catalogo.ts pasaron (${CASOS_CLAVE_NORMALIZADA.length + 6} en total).`
);
