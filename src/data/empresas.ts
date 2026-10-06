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

// Rutas predeterminadas por empresa -- respaldo de CheckInForm.tsx para cuando todavía no hay
// caché del catálogo de Supabase (spec_catalogo_empresas_rutas.md, Hallazgo #48: primer uso sin
// red, antes de la primera descarga). Las empresas que no aparecen aquí (o que no tienen rutas
// cargadas) solo mostrarán la opción de agregar la ruta a mano.
export const RUTAS_POR_EMPRESA: Record<string, string[]> = {
  FREDIST: ["Barcelona", "Valles Oriental", "Mataro", "Terrasa"],
  "BTS-MAKRO": ["Sede Prat", "Sede Tarragona"],
};
