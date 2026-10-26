// Pruebas de los constructores puros de lib/peticiones-catalogo.ts, sin red -- verifican que el
// cuerpo que arma el cliente tiene EXACTAMENTE las claves que el servidor exige (bug real del
// 2026-10-26: RenombrarInline mandaba `{ nombreNuevo }` sin `id`, y nada lo frenó hasta producción
// porque el objeto nunca pasó por un tipo ni por una función compartida).
// Ejecutar desde dashboard/: npx tsx scripts/pruebas-peticiones-catalogo.ts
import {
  construirCuerpoActivar,
  construirCuerpoCrearEmpresa,
  construirCuerpoCrearRuta,
  construirCuerpoFusionar,
  construirCuerpoRenombrar,
  construirCuerpoRevisar,
  construirCuerpoVinculosChofer,
} from "@/lib/peticiones-catalogo";

let fallos = 0;

function verificarClaves(descripcion: string, obtenido: object, esperadas: string[]): void {
  const clavesObtenidas = Object.keys(obtenido).sort();
  const clavesEsperadas = [...esperadas].sort();
  if (JSON.stringify(clavesObtenidas) === JSON.stringify(clavesEsperadas)) {
    console.log(`OK   ${descripcion}`);
  } else {
    fallos++;
    console.error(
      `FAIL ${descripcion} -- claves obtenidas ${JSON.stringify(clavesObtenidas)}, esperadas ${JSON.stringify(clavesEsperadas)}`
    );
  }
}

verificarClaves(
  "construirCuerpoRenombrar incluye id y nombreNuevo",
  construirCuerpoRenombrar("emp-1", "NUEVO NOMBRE"),
  ["id", "nombreNuevo"]
);

verificarClaves(
  "construirCuerpoFusionar incluye origenId y destinoId",
  construirCuerpoFusionar("origen-1", "destino-1"),
  ["origenId", "destinoId"]
);

verificarClaves(
  "construirCuerpoActivar incluye id y activo",
  construirCuerpoActivar("emp-1", false),
  ["id", "activo"]
);

verificarClaves("construirCuerpoRevisar incluye id", construirCuerpoRevisar("emp-1"), ["id"]);

verificarClaves(
  "construirCuerpoCrearEmpresa incluye nombre",
  construirCuerpoCrearEmpresa("JOPRIMSA"),
  ["nombre"]
);

verificarClaves(
  "construirCuerpoCrearRuta incluye empresaId y nombre",
  construirCuerpoCrearRuta("emp-1", "RUTA 400"),
  ["empresaId", "nombre"]
);

verificarClaves(
  "construirCuerpoVinculosChofer incluye choferId + las diferencias pedidas",
  construirCuerpoVinculosChofer("chofer-1", { empresasAgregar: ["emp-1"] }),
  ["choferId", "empresasAgregar"]
);

verificarClaves(
  "construirCuerpoVinculosChofer sin diferencias -- solo choferId",
  construirCuerpoVinculosChofer("chofer-1", {}),
  ["choferId"]
);

if (fallos > 0) {
  console.error(`\n${fallos} prueba(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las pruebas de peticiones-catalogo.ts pasaron (8 en total).");
