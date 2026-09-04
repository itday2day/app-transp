import { colores } from "./colors";

export const tipografia = {
  titulo: { fontSize: 24, fontWeight: "700" as const, color: colores.textoPrincipal },
  subtitulo: { fontSize: 18, fontWeight: "600" as const, color: colores.textoPrincipal },
  cuerpo: { fontSize: 15, fontWeight: "400" as const, color: colores.textoPrincipal },
  ayuda: { fontSize: 13, fontWeight: "400" as const, color: colores.textoSecundario },
  boton: { fontSize: 16, fontWeight: "600" as const, color: colores.superficie },
};
