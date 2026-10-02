import { colores } from "./colors";

/** spec_identidad_visual_day2day.md: nombres de familia tal como los registra `useFonts()` en
 * App.tsx (el nombre de la constante exportada por @expo-google-fonts/*, no un nombre de archivo).
 * Un solo peso por familia, el mismo que valida el canvas "Day2Day — Primera muestra" en cada
 * pantalla real (AppCheckIn/AppLogin), no toda la escala de tokens.json. */
export const familias = {
  display: "BigShouldersDisplay_700Bold",
  sans: "IBMPlexSans_400Regular",
  sansSemiBold: "IBMPlexSans_600SemiBold",
  mono: "IBMPlexMono_500Medium",
};

export const tipografia = {
  titulo: {
    fontFamily: familias.display,
    fontSize: 28,
    fontWeight: "700" as const,
    color: colores.textoPrincipal,
  },
  subtitulo: {
    fontFamily: familias.sansSemiBold,
    fontSize: 18,
    fontWeight: "600" as const,
    color: colores.textoPrincipal,
  },
  cuerpo: {
    fontFamily: familias.sans,
    fontSize: 15,
    fontWeight: "400" as const,
    color: colores.textoPrincipal,
  },
  ayuda: {
    fontFamily: familias.sans,
    fontSize: 13,
    fontWeight: "400" as const,
    color: colores.textoSecundario,
  },
  boton: {
    fontFamily: familias.sansSemiBold,
    fontSize: 16,
    fontWeight: "600" as const,
    color: colores.superficie,
  },
  // Nuevo — spec_identidad_visual_day2day.md: datos reales (DNI, matrícula, teléfono, km,
  // horarios) van en IBM Plex Mono, nunca en la familia de texto general.
  dato: {
    fontFamily: familias.mono,
    fontSize: 14,
    fontWeight: "500" as const,
    color: colores.textoPrincipal,
  },
  datoChico: {
    fontFamily: familias.mono,
    fontSize: 12,
    fontWeight: "500" as const,
    color: colores.textoSecundario,
  },
};
