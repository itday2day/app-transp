import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useIdioma } from "@/hooks/useIdioma";
import { IDIOMAS_DISPONIBLES, Idioma, ClaveTraduccion } from "@/i18n";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

const BANDERAS: Record<Idioma, string> = {
  es: "🇪🇸",
  en: "🇬🇧",
};

const CLAVE_ETIQUETA: Record<Idioma, ClaveTraduccion> = {
  es: "selectorIdioma.etiquetaEs",
  en: "selectorIdioma.etiquetaEn",
};

export function LanguageSelector() {
  const { t } = useTranslation();
  const { idioma, cambiarIdioma } = useIdioma();

  return (
    <View style={estilos.fila}>
      {IDIOMAS_DISPONIBLES.map((opcion) => {
        const seleccionado = idioma === opcion;
        return (
          <Pressable
            key={opcion}
            accessibilityRole="button"
            accessibilityLabel={t(CLAVE_ETIQUETA[opcion])}
            accessibilityHint={t("selectorIdioma.hint")}
            accessibilityState={{ selected: seleccionado }}
            onPress={() => cambiarIdioma(opcion)}
            style={[estilos.chip, seleccionado && estilos.chipSeleccionado]}
          >
            <Text style={estilos.bandera}>{BANDERAS[opcion]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: {
    flexDirection: "row",
    gap: espaciado.sm,
  },
  chip: {
    paddingVertical: espaciado.xs,
    paddingHorizontal: espaciado.sm,
    borderRadius: radios.full,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
    opacity: 0.5,
  },
  chipSeleccionado: {
    borderWidth: 2,
    borderColor: colores.primario,
    opacity: 1,
  },
  bandera: {
    fontSize: tipografia.titulo.fontSize,
  },
});
