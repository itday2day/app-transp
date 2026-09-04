export const EMPRESAS = [
  "AMAZON",
  "AMETLLER",
  "ASSOLIM",
  "BTS-MAKRO",
  "COSAEN",
  "CULLIGAN",
  "EUROPATRY",
  "FREDIST",
  "FRIMAN",
  "IKEA BADALONA",
  "JOPRIMSA",
  "KEN FOODS - ALCORCON",
  "LOGIFRIO",
  "PRO A PRO HOSTELERIA",
  "PURATOS",
  "SABOR PROVISIONS",
  "SERTRANS",
  "SEUR",
  "VAMOS A COMER",
];

// Rutas predeterminadas por empresa. Las empresas que no aparecen aquí (o que
// no tienen rutas cargadas) solo mostrarán la opción de agregar la ruta a mano.
export const RUTAS_POR_EMPRESA: Record<string, string[]> = {
  FREDIST: ["Barcelona", "Valles Oriental", "Mataro", "Terrasa"],
  "BTS-MAKRO": ["Sede Prat", "Sede Tarragona"],
};

export function obtenerRutasDeEmpresa(empresa: string | null): string[] {
  if (!empresa) return [];
  return RUTAS_POR_EMPRESA[empresa] ?? [];
}
