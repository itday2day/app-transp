import React, { useState } from "react";
import { View, Text, FlatList, RefreshControl, ScrollView, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { useNetwork } from "@/context/NetworkContext";
import { useJornadasAbiertas } from "@/hooks/useJornadasAbiertas";
import { useSeguimientoGPS } from "@/hooks/useSeguimientoGPS";
import { TarjetaJornada } from "@/components/TarjetaJornada";
import { BotonPrimario } from "@/components/BotonPrimario";
import { TabsNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

// Solo lista las rutas activas del chofer. Iniciar una ruta nueva es una
// pantalla propia (NuevoCheckInScreen, con botón "Atrás" + "Cancelar") —
// antes el formulario se revelaba inline acá mismo, sin ninguna forma de
// cancelarlo salvo enviarlo.
export default function CheckInScreen() {
  const navigation = useNavigation<TabsNavigationProp<"CheckIn">>();
  const { t } = useTranslation();
  const { usuario } = useAuth();
  const { sincronizarAhora } = useNetwork();
  const {
    jornadas: viajesActivos,
    cargando: cargandoViajes,
    recargar: recargarViajes,
  } = useJornadasAbiertas();

  // Mientras haya al menos una ruta activa y la app esté en primer plano, se
  // envían pings de posición al Dashboard en tiempo real (ver useSeguimientoGPS).
  useSeguimientoGPS(viajesActivos.map((jornada) => jornada.id));

  // Pull-to-refresh: mismo criterio que HistorialScreen.tsx (forzar el
  // reintento de sincronización ignorando MAX_INTENTOS, es un pedido
  // explícito del chofer de "probá de nuevo"), pero con un estado de
  // `refrescando` propio en vez de reusar `cargandoViajes` del hook — a
  // diferencia de Historial, esta pantalla hace `if (cargandoViajes) return
  // null` más abajo, así que reusar esa misma bandera pondría la pantalla
  // en blanco en cada pull-to-refresh en vez de mostrar el spinner nativo
  // sobre el contenido ya visible.
  const [refrescando, setRefrescando] = useState(false);

  async function refrescar() {
    setRefrescando(true);
    try {
      await sincronizarAhora(true);
      await recargarViajes();
    } finally {
      setRefrescando(false);
    }
  }

  if (cargandoViajes) return null;

  return (
    <ScrollView
      style={estilos.pantalla}
      contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
    >
      <Text style={estilos.titulo}>{t("checkIn.titulo")}</Text>
      <Text style={estilos.chofer}>{t("checkIn.chofer", { nombre: usuario?.nombre ?? "" })}</Text>

      {viajesActivos.length > 0 ? (
        <View style={estilos.bloqueActivos}>
          <Text style={estilos.subtitulo}>
            {t("checkIn.rutasActivas", { cantidad: viajesActivos.length })}
          </Text>
          <FlatList
            data={viajesActivos}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TarjetaJornada
                jornada={item}
                onPress={() => navigation.navigate("DetalleJornada", { id: item.id })}
              />
            )}
          />
        </View>
      ) : null}

      <BotonPrimario
        titulo={t(viajesActivos.length > 0 ? "checkIn.botonNuevaRuta" : "checkIn.botonPrimeraRuta")}
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
  bloqueActivos: {
    marginBottom: espaciado.lg,
  },
  subtitulo: {
    ...tipografia.subtitulo,
    marginBottom: espaciado.sm,
  },
  botonNuevaRuta: {
    marginTop: espaciado.sm,
  },
});
