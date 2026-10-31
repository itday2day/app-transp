import React, { useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";
import { comprimirImagen } from "@/services/imageService";
import { guardarCopiaEnGaleria } from "@/services/galeriaService";
import { VisorFotoAmpliada } from "@/components/VisorFotoAmpliada";
import { formatearFechaOriginalLocal, leerFechaOriginalExif } from "@/utils/fotoOrigenMetadata";
import { OrigenFoto } from "@/types";

export interface ResultadoCaptura {
  uriComprimida: string;
  origen: OrigenFoto;
  fechaOriginal: string | null;
}

interface Props {
  etiqueta: string;
  ayuda?: string;
  uri: string | null;
  onCapturada: (resultado: ResultadoCaptura) => void;
  error?: string;
  /** spec_ajustes_previos_apk.md, B: velocímetro junto a "Foto del tablero"/"Foto del tacómetro".
   * Decorativo -- `accessible={false}`, nunca lo lee el lector de pantalla; la etiqueta de texto
   * sigue siendo lo único que se anuncia. */
  icono?: keyof typeof Ionicons.glyphMap;
  /** spec_foto_reemplazar_quitar_antes_de_registrar.md: agrega el botón "Quitar foto" -- SOLO
   * para fotos opcionales (la de ruta). Nunca en tacómetros, que son obligatorios. */
  permiteQuitar?: boolean;
  onQuitar?: () => void;
}

export function CapturaFoto({
  etiqueta,
  ayuda,
  uri,
  onCapturada,
  error,
  icono,
  permiteQuitar = false,
  onQuitar,
}: Props) {
  const { t } = useTranslation();
  const [procesando, setProcesando] = useState(false);
  const [visorAbierto, setVisorAbierto] = useState(false);

  async function tomarFoto() {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(t("capturaFoto.permisoTitulo"), t("capturaFoto.permisoMensaje"));
      return;
    }

    const resultado = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });

    if (resultado.canceled || !resultado.assets?.[0]) return;

    // Criterio 4 (spec_copia_fotos_en_galeria.md): el uri CRUDO que entrega la cámara, antes de
    // que comprimirImagen() lo reduzca a 1280px/0.6 -- es lo más cercano a "sin ningún cambio"
    // que existe en la app (la propia cámara ya comprime a 0.6, Fase 1 punto 2). Sin `await`: no
    // retrasa la captura ni el flujo normal de la foto hacia SQLite/subida (criterio 2).
    void guardarCopiaEnGaleria(resultado.assets[0].uri);

    const fechaOriginal = formatearFechaOriginalLocal(new Date());
    setProcesando(true);
    try {
      const uriComprimida = await comprimirImagen(resultado.assets[0].uri);
      onCapturada({ uriComprimida, origen: "camara", fechaOriginal });
    } finally {
      setProcesando(false);
    }
  }

  // spec_adjuntar_foto_galeria.md: launchImageLibraryAsync no exige permiso de runtime (ver
  // documentación de Expo citada en la spec). exif:true + quality:1 + allowsEditing:false para
  // que el selector no recomprima ni recorte antes de poder leer el EXIF.
  async function elegirDeGaleria() {
    const resultado = await ImagePicker.launchImageLibraryAsync({
      selectionLimit: 1,
      exif: true,
      allowsEditing: false,
      quality: 1,
    });

    if (resultado.canceled || !resultado.assets?.[0]) return;
    const activo = resultado.assets[0];

    // El EXIF se lee ANTES de comprimir (comprimirImagen() lo descarta, Fase 1 de la spec). Un
    // fallo leyendo EXIF nunca bloquea la foto -- se guarda con fechaOriginal null, igual que una
    // foto sin EXIF real (captura de pantalla, reenvío de WhatsApp).
    let fechaOriginal: string | null = null;
    try {
      fechaOriginal = leerFechaOriginalExif(activo.exif);
    } catch {
      fechaOriginal = null;
    }

    setProcesando(true);
    try {
      const uriComprimida = await comprimirImagen(activo.uri);
      onCapturada({ uriComprimida, origen: "galeria", fechaOriginal });
    } finally {
      setProcesando(false);
    }
  }

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.filaEtiqueta}>
        {icono ? (
          <Ionicons
            name={icono}
            size={16}
            color={colores.textoPrincipal}
            accessible={false}
            importantForAccessibility="no"
          />
        ) : null}
        <Text style={estilos.etiqueta}>{etiqueta}</Text>
      </View>
      {ayuda ? <Text style={estilos.ayuda}>{ayuda}</Text> : null}

      <Pressable
        onPress={uri ? () => setVisorAbierto(true) : tomarFoto}
        style={[estilos.zonaCaptura, Boolean(error) && estilos.zonaConError]}
      >
        {uri ? (
          <Image source={{ uri }} style={estilos.imagen} />
        ) : (
          <View style={estilos.marcador}>
            <Ionicons name="camera-outline" size={32} color={colores.textoSecundario} />
            <Text style={estilos.textoMarcador}>
              {procesando ? t("capturaFoto.procesando") : t("capturaFoto.tocaParaTomar")}
            </Text>
          </View>
        )}
      </Pressable>

      {!uri ? (
        <Pressable onPress={elegirDeGaleria}>
          <Text style={estilos.enlaceSecundario}>{t("capturaFoto.elegirDeGaleria")}</Text>
        </Pressable>
      ) : null}

      {uri ? (
        // spec_foto_reemplazar_quitar_antes_de_registrar.md, Fase 1: el enlace de texto ya
        // existía pero no se notaba en un dispositivo real -- botones visibles, no texto suelto.
        <View style={estilos.filaAcciones}>
          <Pressable onPress={tomarFoto} style={estilos.botonAccion}>
            <Text style={estilos.textoBotonAccion}>{t("capturaFoto.tomarOtra")}</Text>
          </Pressable>
          <Pressable onPress={elegirDeGaleria} style={estilos.botonAccion}>
            <Text style={estilos.textoBotonAccion}>{t("capturaFoto.elegirDeGaleria")}</Text>
          </Pressable>
          {permiteQuitar ? (
            <Pressable onPress={onQuitar} style={estilos.botonAccion}>
              <Text style={estilos.textoBotonQuitar}>{t("capturaFoto.quitarFoto")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {error ? <Text style={estilos.textoError}>{error}</Text> : null}

      <VisorFotoAmpliada
        visible={visorAbierto}
        fotos={uri ? [{ uri }] : []}
        indiceInicial={0}
        onCerrar={() => setVisorAbierto(false)}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    marginBottom: espaciado.md,
  },
  filaEtiqueta: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaciado.xs,
    marginBottom: espaciado.xs,
  },
  etiqueta: {
    ...tipografia.cuerpo,
    fontWeight: "600",
  },
  ayuda: {
    ...tipografia.ayuda,
    marginBottom: espaciado.sm,
  },
  zonaCaptura: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.md,
    overflow: "hidden",
    backgroundColor: colores.superficie,
  },
  zonaConError: {
    borderColor: colores.peligro,
  },
  textoError: {
    ...tipografia.ayuda,
    color: colores.peligro,
    marginTop: espaciado.xs,
  },
  marcador: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: espaciado.xs,
  },
  textoMarcador: {
    ...tipografia.ayuda,
  },
  imagen: {
    width: "100%",
    height: 200,
  },
  enlaceSecundario: {
    ...tipografia.ayuda,
    color: colores.primario,
    fontWeight: "600",
    marginTop: espaciado.xs,
    textAlign: "center",
  },
  filaAcciones: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: espaciado.sm,
    marginTop: espaciado.sm,
  },
  botonAccion: {
    paddingVertical: espaciado.xs,
    paddingHorizontal: espaciado.sm,
    borderRadius: radios.sm,
    borderWidth: 1,
    borderColor: colores.primario,
  },
  textoBotonAccion: {
    ...tipografia.ayuda,
    color: colores.primario,
    fontWeight: "600",
  },
  textoBotonQuitar: {
    ...tipografia.ayuda,
    color: colores.peligro,
    fontWeight: "600",
  },
});
