import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Linking } from "react-native";
import { useTranslation } from "react-i18next";
import * as Application from "expo-application";
import { supabase } from "@/lib/supabase";
import {
  obtenerFilaAppVersion,
  debeMostrarAviso,
  debeRevisarAvisoVersionEsteArranque,
  marcarAvisoVersionRevisadoEsteArranque,
  liberarRevisionAvisoVersionEsteArranque,
} from "@/services/avisoVersionCore";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

// spec_aviso_version_y_pagina_actualizar.md, Fase 2, criterios 4-8: franja NO bloqueante arriba de
// las tres pestañas (se monta en PrincipalTabs, RootNavigator.tsx -- nunca en Login, decisión de
// César del 2026-11-03 que reemplaza el criterio 7 original). Una vez por arranque, con conexión,
// si Application.nativeBuildVersion (entero) es menor que build_recomendado. Sin conexión, con
// error o con la fila ausente: no se muestra nada y no hay demora al abrir (por eso el efecto NUNCA
// bloquea el primer render -- arranca en null/false y solo cambia si la lectura resuelve a "sí
// avisar"). «Más tarde» solo oculta el estado en memoria -- no toca ninguna cola de sincronización
// ni cierra sesión, y no vuelve a aparecer hasta el siguiente arranque real del proceso (misma
// garantía que debeRevisarAvisoVersionEsteArranque()).
export function AvisoVersionFranja() {
  const { t } = useTranslation();
  const [urlDescarga, setUrlDescarga] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!debeRevisarAvisoVersionEsteArranque()) return;

    (async () => {
      try {
        const resultado = await obtenerFilaAppVersion(supabase);

        // Sin respuesta (sin red, timeout): NO se consume el único chequeo del arranque -- queda
        // disponible para un próximo montaje de este componente en el mismo arranque (ajuste de
        // César, 2026-11-04).
        if (resultado.tipo === "sinRespuesta") {
          liberarRevisionAvisoVersionEsteArranque();
          return;
        }

        marcarAvisoVersionRevisadoEsteArranque();

        if (debeMostrarAviso(Application.nativeBuildVersion, resultado.fila)) {
          setUrlDescarga(resultado.fila!.urlDescarga);
          setVisible(true);
        }
      } catch {
        // Mejor esfuerzo (criterio 8): un fallo inesperado acá nunca debe molestar al chofer --
        // tampoco debe dejar la revisión "en curso" para siempre.
        liberarRevisionAvisoVersionEsteArranque();
      }
    })();
    // Solo al montar -- "una vez por arranque" ya lo garantiza debeRevisarAvisoVersionEsteArranque().
  }, []);

  if (!visible || !urlDescarga) return null;

  return (
    <View style={estilos.franja}>
      <View style={estilos.textos}>
        <Text style={estilos.titulo}>{t("avisoVersion.titulo")}</Text>
        <Text style={estilos.cuerpo}>{t("avisoVersion.cuerpo")}</Text>
      </View>
      <View style={estilos.botones}>
        <Pressable onPress={() => setVisible(false)} hitSlop={espaciado.sm}>
          <Text style={estilos.botonSecundario}>{t("avisoVersion.botonMasTarde")}</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(urlDescarga)} hitSlop={espaciado.sm}>
          <Text style={estilos.botonPrimario}>{t("avisoVersion.botonActualizar")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  franja: {
    backgroundColor: colores.advertenciaFondo,
    borderBottomWidth: 1,
    borderBottomColor: colores.advertencia,
    paddingVertical: espaciado.sm,
    paddingHorizontal: espaciado.md,
    gap: espaciado.xs,
  },
  textos: {
    gap: 2,
  },
  titulo: {
    ...tipografia.ayuda,
    fontFamily: tipografia.subtitulo.fontFamily,
    color: colores.advertencia,
  },
  cuerpo: {
    ...tipografia.ayuda,
    color: colores.advertencia,
  },
  botones: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: espaciado.lg,
    marginTop: espaciado.xs,
  },
  botonSecundario: {
    ...tipografia.ayuda,
    fontFamily: tipografia.subtitulo.fontFamily,
    color: colores.textoSecundario,
  },
  botonPrimario: {
    ...tipografia.ayuda,
    fontFamily: tipografia.subtitulo.fontFamily,
    color: colores.link,
  },
});
