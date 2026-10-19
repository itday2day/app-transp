import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useNetwork } from "@/context/NetworkContext";
import { useAuth } from "@/context/AuthContext";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

// Ajuste a 2 (spec_ajustes_pantalla_registro_limites_campos.md, 2026-10-20): UNA sola condición,
// sin ninguna lista de pantallas -- "sin sesión" se define como `cargando || usuario === null`,
// leído directo de AuthContext (disponible acá porque App.tsx envuelve AuthProvider por fuera de
// NetworkProvider/BannerConexion). En esas pantallas cada acción ya muestra su propio "Sin
// conexión..." al fallar; "tus registros se guardan en el dispositivo" solo es verdad para las
// jornadas, que viven todas con sesión.
export function BannerConexion() {
  const { t } = useTranslation();
  const { conectado, sincronizando } = useNetwork();
  const { cargando, usuario } = useAuth();

  if (cargando || usuario === null) return null;
  if (conectado && !sincronizando) return null;

  return (
    <View style={[estilos.banner, !conectado && estilos.bannerOffline]}>
      <Ionicons
        name={conectado ? "sync-outline" : "cloud-offline-outline"}
        size={16}
        color={colores.superficie}
      />
      <Text style={estilos.texto}>
        {conectado ? t("bannerConexion.sincronizando") : t("bannerConexion.sinConexion")}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaciado.xs,
    backgroundColor: colores.primario,
    paddingVertical: espaciado.sm,
    paddingHorizontal: espaciado.md,
  },
  bannerOffline: {
    backgroundColor: colores.offline,
  },
  texto: {
    ...tipografia.ayuda,
    color: colores.superficie,
    flexShrink: 1,
  },
});
