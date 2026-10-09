import React, { useState } from "react";
import { View, Text, FlatList, RefreshControl, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import { useNetwork } from "@/context/NetworkContext";
import { useJornadasAbiertas } from "@/hooks/useJornadasAbiertas";
import { useSeguimientoGPS } from "@/hooks/useSeguimientoGPS";
import { useNavegarUnaVez } from "@/hooks/useNavegarUnaVez";
import { TarjetaJornada } from "@/components/TarjetaJornada";
import { TabsNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

/** spec_bloque_a_pantallas_checkin_checkout.md (Hallazgo #50): pantalla propia para cerrar
 * jornadas -- antes esta lista vivía en CheckInScreen ("Rutas activas"). Tocar una tarjeta lleva
 * al detalle de la jornada con el formulario de cierre YA VISIBLE (`abrirCheckOut: true`), sin un
 * botón intermedio -- `DetalleJornadaScreen` reusa `CheckOutForm` tal cual, no hay un formulario
 * nuevo. Nunca existió una pantalla de check-out propia antes de este hallazgo. */
export default function CheckOutScreen() {
  const navigation = useNavigation<TabsNavigationProp<"CheckOut">>();
  const navegarUnaVez = useNavegarUnaVez();
  const { t } = useTranslation();
  const { sincronizarAhora } = useNetwork();
  const { jornadas: rutasAbiertas, cargando, recargar } = useJornadasAbiertas();

  // Mientras haya al menos una ruta activa y la app esté en primer plano, se envían pings de
  // posición al Dashboard en tiempo real (ver useSeguimientoGPS) -- vive acá (ya no en
  // CheckInScreen, que dejó de listar jornadas abiertas) pero sigue corriendo igual sin importar
  // qué pestaña tenga el foco: react-navigation mantiene montadas las pantallas de los tabs, solo
  // oculta la que no está activa.
  useSeguimientoGPS(rutasAbiertas.map((jornada) => jornada.id));

  // Mismo criterio que CheckInScreen.tsx/HistorialScreen.tsx: un estado de `refrescando` propio
  // para el spinner del pull-to-refresh, en vez de reusar `cargando` del hook.
  const [refrescando, setRefrescando] = useState(false);

  async function refrescar() {
    setRefrescando(true);
    try {
      await sincronizarAhora(true);
      await recargar();
    } finally {
      setRefrescando(false);
    }
  }

  const alturaTabBar = useBottomTabBarHeight();

  // spec_bloque_a_pantallas_checkin_checkout.md (ampliación, criterio 21): indicador visible en
  // vez de `return null` -- con la lectura de SQLite primero (ver useJornadasAbiertas.ts), esta
  // ventana dura unos pocos milisegundos, pero sigue sin ser correcto mostrar nada mientras tanto.
  if (cargando) {
    return (
      <View style={[estilos.pantalla, estilos.cargando]}>
        <ActivityIndicator color={colores.primario} />
      </View>
    );
  }

  return (
    <View style={estilos.pantalla}>
      <FlatList
        data={rutasAbiertas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[estilos.lista, { paddingBottom: espaciado.lg + alturaTabBar }]}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
        ListHeaderComponent={
          rutasAbiertas.length > 0 ? (
            <Text style={estilos.contador}>{t("checkOut.contador", { cantidad: rutasAbiertas.length })}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TarjetaJornada
            jornada={item}
            onPress={() =>
              navegarUnaVez(() => navigation.navigate("DetalleJornada", { id: item.id, abrirCheckOut: true }))
            }
          />
        )}
        ListEmptyComponent={
          <View style={estilos.vacio}>
            <Text style={estilos.vacioTitulo}>{t("checkOut.vacioTitulo")}</Text>
            <Text style={estilos.vacioTexto}>{t("checkOut.vacioTexto")}</Text>
          </View>
        }
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
  },
  cargando: {
    alignItems: "center",
    justifyContent: "center",
  },
  lista: {
    padding: espaciado.lg,
    flexGrow: 1,
  },
  contador: {
    ...tipografia.subtitulo,
    marginBottom: espaciado.sm,
  },
  vacio: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: espaciado.xl,
  },
  vacioTitulo: {
    ...tipografia.subtitulo,
  },
  vacioTexto: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    marginTop: espaciado.xs,
    textAlign: "center",
  },
});
