import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colores } from "@/theme/colors";
import { familias } from "@/theme/typography";

interface Props {
  texto: string;
  onPress: () => void;
  /** El enlace sale de la app (ej. abre la app de mapas) -- lleva el ícono de "abre fuera" además
   * del color, nunca solo el color (spec_mejoras_carga_jornada_fotos_enlaces.md, Pedido 4). */
  externo?: boolean;
}

/** Único componente de enlace de toda la app (mismo criterio que #20/#21/#24: un solo patrón de
 * estilo, nunca dos compitiendo). Reemplaza el texto en negrita con `colores.primario` que usaban
 * "¿Olvidaste...?" y "Ver en mapa" -- ninguno de los dos se leía como "esto se puede tocar". */
export function TextoEnlace({ texto, onPress, externo }: Props) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={externo ? `${texto}. ${t("comun.abreFuera")}` : texto}
      onPress={onPress}
      style={estilos.area}
      hitSlop={8}
    >
      <View style={estilos.contenido}>
        <Text style={estilos.texto}>{texto}</Text>
        {externo && <Ionicons name="open-outline" size={16} color={colores.link} />}
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  area: {
    minHeight: 44,
    justifyContent: "center",
  },
  contenido: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  texto: {
    fontFamily: familias.sansSemiBold,
    fontSize: 15,
    fontWeight: "600",
    color: colores.link,
    textAlign: "center",
  },
});
