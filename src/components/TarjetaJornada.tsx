import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Jornada } from "@/types";
import { ClaveTraduccion } from "@/i18n";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

interface Props {
  jornada: Jornada;
  onPress: () => void;
}

const CLAVE_SINCRONIZACION: Record<Jornada["sincronizacion"], { clave: ClaveTraduccion; color: string }> = {
  pendiente: { clave: "tarjetaJornada.syncPendiente", color: colores.offline },
  sincronizando: { clave: "tarjetaJornada.syncEnviando", color: colores.primario },
  sincronizado: { clave: "tarjetaJornada.syncEnviado", color: colores.exito },
  error: { clave: "tarjetaJornada.syncError", color: colores.peligro },
};

function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  return (
    fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " +
    fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
  );
}

export function TarjetaJornada({ jornada, onPress }: Props) {
  const { t } = useTranslation();
  const estadoSync = CLAVE_SINCRONIZACION[jornada.sincronizacion];

  return (
    <Pressable onPress={onPress} style={estilos.tarjeta}>
      <View style={estilos.filaSuperior}>
        <Text style={estilos.matricula}>{jornada.matricula}</Text>
        <View style={[estilos.insignia, jornada.estado === "abierta" && estilos.insigniaAbierta]}>
          <Text style={estilos.textoInsignia}>
            {t(jornada.estado === "abierta" ? "tarjetaJornada.enCurso" : "tarjetaJornada.cerrada")}
          </Text>
        </View>
      </View>

      <Text style={estilos.chofer}>{jornada.choferNombre}</Text>
      <Text style={estilos.fecha}>{formatearFecha(jornada.fechaCheckIn)}</Text>

      <View style={estilos.filaInferior}>
        <Text style={estilos.km}>
          {jornada.kmInicial} km {jornada.kmFinal ? `→ ${jornada.kmFinal} km` : ""}
        </Text>
        <View style={estilos.filaSync}>
          <Ionicons
            name={jornada.sincronizacion === "sincronizado" ? "cloud-done-outline" : "cloud-offline-outline"}
            size={16}
            color={estadoSync.color}
          />
          <Text style={[estilos.textoSync, { color: estadoSync.color }]}>{t(estadoSync.clave)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radios.md,
    padding: espaciado.md,
    marginBottom: espaciado.sm,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  filaSuperior: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  matricula: {
    ...tipografia.subtitulo,
  },
  insignia: {
    backgroundColor: colores.fondo,
    borderRadius: radios.full,
    paddingHorizontal: espaciado.sm,
    paddingVertical: 2,
  },
  insigniaAbierta: {
    backgroundColor: colores.advertenciaFondo,
  },
  textoInsignia: {
    ...tipografia.ayuda,
    fontWeight: "600",
  },
  chofer: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    marginTop: espaciado.xs,
  },
  fecha: {
    ...tipografia.ayuda,
    marginTop: espaciado.xs,
  },
  filaInferior: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: espaciado.sm,
  },
  km: {
    ...tipografia.cuerpo,
  },
  filaSync: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  textoSync: {
    ...tipografia.ayuda,
    fontWeight: "600",
  },
});
