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
import { FotoConMetadata } from "@/types";

interface Props {
  fotos: FotoConMetadata[];
  onCambiar: (fotos: FotoConMetadata[]) => void;
}

// A diferencia de CapturaFoto (una sola uri, se reemplaza), este componente
// administra un arreglo — cada captura se agrega, no reemplaza, y cada
// miniatura tiene su propia ✕ para eliminarla individualmente.
export function GaleriaFotosIncidencia({ fotos, onCambiar }: Props) {
  const { t } = useTranslation();
  const [procesando, setProcesando] = useState(false);
  const [indiceVisor, setIndiceVisor] = useState<number | null>(null);

  async function agregarFoto() {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(t("capturaFoto.permisoTitulo"), t("capturaFoto.permisoMensaje"));
      return;
    }

    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (resultado.canceled || !resultado.assets?.[0]) return;

    // Criterio 4 (spec_copia_fotos_en_galeria.md): mismo uri CRUDO que CapturaFoto.tsx, antes de
    // comprimirImagen(). Sin `await`: no retrasa la captura.
    void guardarCopiaEnGaleria(resultado.assets[0].uri);

    const fechaOriginal = formatearFechaOriginalLocal(new Date());
    setProcesando(true);
    try {
      const uriComprimida = await comprimirImagen(resultado.assets[0].uri);
      onCambiar([...fotos, { uri: uriComprimida, origen: "camara", fechaOriginal }]);
    } finally {
      setProcesando(false);
    }
  }

  // spec_adjuntar_foto_galeria.md: no llama a guardarCopiaEnGaleria() -- la foto ya está en la
  // galería del chofer, copiarla de nuevo sería un duplicado sin sentido.
  async function agregarDeGaleria() {
    const resultado = await ImagePicker.launchImageLibraryAsync({
      selectionLimit: 1,
      exif: true,
      allowsEditing: false,
      quality: 1,
    });
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const activo = resultado.assets[0];

    let fechaOriginal: string | null = null;
    try {
      fechaOriginal = leerFechaOriginalExif(activo.exif);
    } catch {
      fechaOriginal = null;
    }

    setProcesando(true);
    try {
      const uriComprimida = await comprimirImagen(activo.uri);
      onCambiar([...fotos, { uri: uriComprimida, origen: "galeria", fechaOriginal }]);
    } finally {
      setProcesando(false);
    }
  }

  // spec_foto_reemplazar_quitar_antes_de_registrar.md: reemplaza la foto EN SU MISMA POSICIÓN de
  // la lista -- a diferencia de "quitar" + "agregar", no la manda al final.
  async function repetirFoto(indice: number) {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(t("capturaFoto.permisoTitulo"), t("capturaFoto.permisoMensaje"));
      return;
    }

    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (resultado.canceled || !resultado.assets?.[0]) return;

    void guardarCopiaEnGaleria(resultado.assets[0].uri);

    const fechaOriginal = formatearFechaOriginalLocal(new Date());
    setProcesando(true);
    try {
      const uriComprimida = await comprimirImagen(resultado.assets[0].uri);
      const nuevasFotos = [...fotos];
      nuevasFotos[indice] = { uri: uriComprimida, origen: "camara", fechaOriginal };
      onCambiar(nuevasFotos);
    } finally {
      setProcesando(false);
    }
  }

  function eliminarFoto(indice: number) {
    onCambiar(fotos.filter((_, i) => i !== indice));
  }

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{t("incidencias.fotosEtiqueta")}</Text>
      <Text style={estilos.ayuda}>{t("incidencias.fotosAyuda")}</Text>

      <View style={estilos.grilla}>
        {fotos.map((foto, indice) => (
          <View key={foto.uri} style={estilos.miniaturaContenedor}>
            <Pressable accessibilityRole="button" onPress={() => setIndiceVisor(indice)}>
              <Image source={{ uri: foto.uri }} style={estilos.miniatura} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("incidencias.fotoRepetir")}
              onPress={() => repetirFoto(indice)}
              style={estilos.botonRepetir}
            >
              <Ionicons name="refresh" size={14} color={colores.superficie} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("incidencias.fotoEliminar")}
              onPress={() => eliminarFoto(indice)}
              style={estilos.botonEliminar}
            >
              <Ionicons name="close" size={14} color={colores.superficie} />
            </Pressable>
          </View>
        ))}

        <Pressable onPress={agregarFoto} style={estilos.botonAgregar}>
          <Ionicons name="camera-outline" size={24} color={colores.textoSecundario} />
          <Text style={estilos.textoBotonAgregar}>
            {procesando ? t("capturaFoto.procesando") : t("incidencias.fotoAgregar")}
          </Text>
        </Pressable>

        <Pressable onPress={agregarDeGaleria} style={estilos.botonAgregar}>
          <Ionicons name="images-outline" size={24} color={colores.textoSecundario} />
          <Text style={estilos.textoBotonAgregar}>
            {procesando ? t("capturaFoto.procesando") : t("capturaFoto.elegirDeGaleria")}
          </Text>
        </Pressable>
      </View>

      <VisorFotoAmpliada
        visible={indiceVisor != null}
        fotos={fotos.map((foto) => ({ uri: foto.uri }))}
        indiceInicial={indiceVisor ?? 0}
        onCerrar={() => setIndiceVisor(null)}
      />
    </View>
  );
}

const TAMANO_MINIATURA = 88;

const estilos = StyleSheet.create({
  contenedor: {
    marginTop: espaciado.md,
  },
  etiqueta: {
    ...tipografia.cuerpo,
    fontWeight: "600",
  },
  ayuda: {
    ...tipografia.ayuda,
    marginBottom: espaciado.sm,
  },
  grilla: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: espaciado.sm,
  },
  miniaturaContenedor: {
    width: TAMANO_MINIATURA,
    height: TAMANO_MINIATURA,
  },
  miniatura: {
    width: "100%",
    height: "100%",
    borderRadius: radios.sm,
  },
  botonEliminar: {
    position: "absolute",
    top: -espaciado.xs,
    right: -espaciado.xs,
    width: 22,
    height: 22,
    borderRadius: radios.full,
    backgroundColor: colores.peligro,
    alignItems: "center",
    justifyContent: "center",
  },
  botonRepetir: {
    position: "absolute",
    top: -espaciado.xs,
    left: -espaciado.xs,
    width: 22,
    height: 22,
    borderRadius: radios.full,
    backgroundColor: colores.primario,
    alignItems: "center",
    justifyContent: "center",
  },
  botonAgregar: {
    width: TAMANO_MINIATURA,
    height: TAMANO_MINIATURA,
    borderRadius: radios.sm,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
    alignItems: "center",
    justifyContent: "center",
    gap: espaciado.xs,
  },
  textoBotonAgregar: {
    ...tipografia.ayuda,
    textAlign: "center",
  },
});
