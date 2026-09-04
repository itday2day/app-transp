import React, { useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";
import { comprimirImagen } from "@/services/imageService";

interface Props {
  fotos: string[];
  onCambiar: (fotos: string[]) => void;
}

// A diferencia de CapturaFoto (una sola uri, se reemplaza), este componente
// administra un arreglo — cada captura se agrega, no reemplaza, y cada
// miniatura tiene su propia ✕ para eliminarla individualmente.
export function GaleriaFotosIncidencia({ fotos, onCambiar }: Props) {
  const { t } = useTranslation();
  const [procesando, setProcesando] = useState(false);

  async function agregarFoto() {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(t("capturaFoto.permisoTitulo"), t("capturaFoto.permisoMensaje"));
      return;
    }

    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (resultado.canceled || !resultado.assets?.[0]) return;

    setProcesando(true);
    try {
      const uriComprimida = await comprimirImagen(resultado.assets[0].uri);
      onCambiar([...fotos, uriComprimida]);
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
        {fotos.map((uri, indice) => (
          <View key={uri} style={estilos.miniaturaContenedor}>
            <Image source={{ uri }} style={estilos.miniatura} />
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
      </View>
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
