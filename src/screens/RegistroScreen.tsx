import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { BotonPrimario } from "@/components/BotonPrimario";
import { RootStackNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

// El registro propio se deshabilitó (spec_alta_choferes_dashboard.md): el alta ahora la hace el
// administrador desde el Dashboard, que genera una contraseña temporal y se la entrega al
// chofer. Esta pantalla ya no es un formulario — es un mensaje, para no dejar un camino muerto
// donde alguien cargue datos que no van a ningún lado (condición explícita de la spec). Se
// mantiene el enlace desde LoginScreen.tsx en vez de borrarlo: sigue siendo la respuesta a "no
// tengo cuenta", solo que la respuesta ya no es un formulario.
export default function RegistroScreen() {
  const navigation = useNavigation<RootStackNavigationProp>();
  const { t } = useTranslation();

  return (
    <View style={estilos.pantalla}>
      <Text style={estilos.titulo}>{t("registro.titulo")}</Text>
      <Text style={estilos.mensaje}>{t("registro.mensajeDeshabilitado")}</Text>
      <BotonPrimario
        titulo={t("registro.botonVolver")}
        onPress={() => navigation.goBack()}
        estilo={estilos.boton}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
    justifyContent: "center",
    padding: espaciado.lg,
  },
  titulo: {
    ...tipografia.titulo,
    textAlign: "center",
  },
  mensaje: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    textAlign: "center",
    marginTop: espaciado.md,
    marginBottom: espaciado.xl,
  },
  boton: {
    marginTop: espaciado.sm,
  },
});
