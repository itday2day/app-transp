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
  etiqueta: string;
  ayuda?: string;
  uri: string | null;
  onCapturada: (uriComprimida: string) => void;
}

export function CapturaFoto({ etiqueta, ayuda, uri, onCapturada }: Props) {
  const { t } = useTranslation();
  const [procesando, setProcesando] = useState(false);

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

    setProcesando(true);
    try {
      const uriComprimida = await comprimirImagen(resultado.assets[0].uri);
      onCapturada(uriComprimida);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      {ayuda ? <Text style={estilos.ayuda}>{ayuda}</Text> : null}

      <Pressable onPress={tomarFoto} style={estilos.zonaCaptura}>
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

      {uri ? (
        <Pressable onPress={tomarFoto}>
          <Text style={estilos.enlaceRepetir}>{t("capturaFoto.tomarOtra")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    marginBottom: espaciado.md,
  },
  etiqueta: {
    ...tipografia.cuerpo,
    fontWeight: "600",
    marginBottom: espaciado.xs,
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
  enlaceRepetir: {
    ...tipografia.ayuda,
    color: colores.primario,
    fontWeight: "600",
    marginTop: espaciado.xs,
    textAlign: "center",
  },
});
