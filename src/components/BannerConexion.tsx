import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useNetwork } from "@/context/NetworkContext";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

export function BannerConexion() {
  const { t } = useTranslation();
  const { conectado, sincronizando } = useNetwork();

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
