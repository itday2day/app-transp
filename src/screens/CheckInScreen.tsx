import React from "react";
import { Text, ScrollView, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { BotonPrimario } from "@/components/BotonPrimario";
import { TabsNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

// spec_bloque_a_pantallas_checkin_checkout.md (Hallazgo #50): esta pantalla ya no lista "Rutas
// activas" (eso se mudó a CheckOutScreen, pantalla nueva) -- queda con un único botón, "Iniciar
// ruta", que abre el formulario (NuevoCheckInScreen, sin cambios). El botón que de verdad guarda
// sigue llamándose "Registrar check-in" (CheckInForm.tsx), para no tener dos botones con el mismo
// nombre.
export default function CheckInScreen() {
  const navigation = useNavigation<TabsNavigationProp<"CheckIn">>();
  const { t } = useTranslation();
  const { usuario } = useAuth();

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.titulo}>{t("checkIn.titulo")}</Text>
      <Text style={estilos.chofer}>{t("checkIn.chofer", { nombre: usuario?.nombre ?? "" })}</Text>

      <BotonPrimario
        titulo={t("checkIn.botonIniciarRuta")}
        onPress={() => navigation.navigate("NuevoCheckIn")}
        estilo={estilos.botonNuevaRuta}
      />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
  },
  contenido: {
    padding: espaciado.lg,
    paddingBottom: espaciado.xl,
  },
  titulo: {
    ...tipografia.titulo,
  },
  chofer: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    marginTop: espaciado.xs,
    marginBottom: espaciado.lg,
  },
  botonNuevaRuta: {
    marginTop: espaciado.sm,
  },
});
