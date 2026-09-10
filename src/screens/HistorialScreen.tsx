import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { useNetwork } from "@/context/NetworkContext";
import { listarHistorial } from "@/db/jornadasRepo";
import { Jornada } from "@/types";
import { TarjetaJornada } from "@/components/TarjetaJornada";
import { TabsNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

export default function HistorialScreen() {
  const navigation = useNavigation<TabsNavigationProp<"Historial">>();
  const { t } = useTranslation();
  const { usuario } = useAuth();
  const { sincronizarAhora } = useNetwork();
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    const datos = await listarHistorial(usuario.id, 30);
    setJornadas(datos);
    setCargando(false);
  }, [usuario]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  async function refrescar() {
    setCargando(true);
    // forzarReintento: true — el pull-to-refresh es un pedido explícito del
    // chofer de "probá de nuevo", así que debe poder reintentar una jornada
    // aunque ya haya agotado los reintentos automáticos de fondo (ver
    // comentario en sincronizarPendientes).
    await sincronizarAhora(true);
    await cargar();
  }

  return (
    <View style={estilos.pantalla}>
      <FlatList
        data={jornadas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={estilos.lista}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={refrescar} />}
        renderItem={({ item }) => (
          <TarjetaJornada
            jornada={item}
            onPress={() => navigation.navigate("DetalleJornada", { id: item.id })}
          />
        )}
        ListEmptyComponent={
          !cargando ? (
            <View style={estilos.vacio}>
              <Text style={estilos.vacioTitulo}>{t("historial.vacioTitulo")}</Text>
              <Text style={estilos.vacioTexto}>{t("historial.vacioTexto")}</Text>
            </View>
          ) : null
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
  lista: {
    padding: espaciado.lg,
    flexGrow: 1,
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
