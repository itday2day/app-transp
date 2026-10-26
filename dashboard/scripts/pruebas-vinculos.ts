// Pruebas de la lógica PURA de diferencias de lib/vinculos.ts, sin Supabase.
// Ejecutar desde dashboard/: npx tsx scripts/pruebas-vinculos.ts
import { empresasImplicitasAValidar, normalizarDiferencias } from "@/lib/vinculos";

let fallos = 0;

function verificar(descripcion: string, obtenido: unknown, esperado: unknown): void {
  const obtenidoTexto = JSON.stringify(obtenido);
  const esperadoTexto = JSON.stringify(esperado);
  if (obtenidoTexto === esperadoTexto) {
    console.log(`OK   ${descripcion}`);
  } else {
    fallos++;
    console.error(`FAIL ${descripcion} -- obtenido ${obtenidoTexto}, esperado ${esperadoTexto}`);
  }
}

verificar("sin diferencias -> listas vacías", normalizarDiferencias({}), {
  empresasAgregar: [],
  empresasQuitar: [],
  rutasAgregar: [],
  rutasQuitar: [],
});

verificar(
  "quita duplicados dentro de la misma lista",
  normalizarDiferencias({ empresasAgregar: ["a", "a", "b"] }).empresasAgregar,
  ["a", "b"]
);

verificar(
  "un id en agregar Y quitar a la vez -- gana agregar (estado más reciente)",
  normalizarDiferencias({ empresasAgregar: ["a"], empresasQuitar: ["a", "b"] }),
  { empresasAgregar: ["a"], empresasQuitar: ["b"], rutasAgregar: [], rutasQuitar: [] }
);

verificar(
  "empresas y rutas se normalizan de forma independiente",
  normalizarDiferencias({
    empresasAgregar: ["e1"],
    rutasAgregar: ["r1", "r1"],
    rutasQuitar: ["r2"],
  }),
  { empresasAgregar: ["e1"], empresasQuitar: [], rutasAgregar: ["r1"], rutasQuitar: ["r2"] }
);

verificar(
  "conjunto deseado completo NO es el contrato -- un id que no aparece en ningún lado no se toca",
  normalizarDiferencias({ empresasAgregar: ["e1"] }).empresasQuitar,
  []
);

// Corrección C1: empresa vinculada implícitamente al agregar una ruta -- si el chofer ya la
// tenía, NO se valida (D3: desactivar no afecta vínculos ya creados); si es un vínculo nuevo de
// verdad, sí hace falta validarla (activo).
verificar(
  "empresa implícita YA vinculada antes -- no se valida de nuevo",
  empresasImplicitasAValidar(["e1", "e2"], new Set(["e1"]), []),
  ["e2"]
);

verificar(
  "empresa implícita ya pedida explícitamente en empresasAgregar -- no se revalida dos veces",
  empresasImplicitasAValidar(["e1", "e2"], new Set(), ["e1"]),
  ["e2"]
);

verificar(
  "empresa implícita nueva de verdad (ni vinculada, ni en agregar) -- sí se valida",
  empresasImplicitasAValidar(["e1"], new Set(), []),
  ["e1"]
);

verificar(
  "ninguna empresa implícita hace falta validar si todas ya estaban cubiertas",
  empresasImplicitasAValidar(["e1"], new Set(["e1"]), []),
  []
);

if (fallos > 0) {
  console.error(`\n${fallos} prueba(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las pruebas de vinculos.ts pasaron (9 en total).");
