import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { SelectorSexo } from "@/components/SelectorSexo";
import { SelectorPais } from "@/components/SelectorPais";
import { SelectorFecha } from "@/components/SelectorFecha";
import { BotonPrimario } from "@/components/BotonPrimario";
import { registrarCuenta } from "@/services/authService";
import { ErrorApi } from "@/services/api";
import { RootStackNavigationProp } from "@/navigation/types";
import { Sexo } from "@/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

// El DNI/documento de identidad varía de formato según el país de origen del
// chofer (la app admite cualquier nacionalidad vía SelectorPais), así que la
// validación es genérica: alfanumérico, sin exigir un patrón de país específico.
const DNI_VALIDO = /^[A-Z0-9]{5,20}$/;

export default function RegistroScreen() {
  const navigation = useNavigation<RootStackNavigationProp>();
  const { t } = useTranslation();

  const [numeroEmpleado, setNumeroEmpleado] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [dni, setDni] = useState("");
  const [sexo, setSexo] = useState<Sexo | null>(null);
  const [fechaNacimiento, setFechaNacimiento] = useState<string | null>(null);
  const [paisNacimiento, setPaisNacimiento] = useState<string | null>(null);
  const [contrasena, setContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dniValido = DNI_VALIDO.test(dni.trim().toUpperCase());
  const contrasenasCoinciden = confirmarContrasena.length === 0 || confirmarContrasena === contrasena;

  const formularioValido =
    numeroEmpleado.trim().length > 0 &&
    nombre.trim().length > 0 &&
    apellidos.trim().length > 0 &&
    dniValido &&
    sexo !== null &&
    fechaNacimiento !== null &&
    paisNacimiento !== null &&
    contrasena.length >= 6 &&
    confirmarContrasena === contrasena;

  async function manejarRegistro() {
    if (!formularioValido || !sexo || !fechaNacimiento || !paisNacimiento) return;
    setError(null);
    setEnviando(true);
    try {
      await registrarCuenta({
        numeroEmpleado: numeroEmpleado.trim(),
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
        dni: dni.trim().toUpperCase(),
        fechaNacimiento,
        paisNacimiento,
        contrasena,
        sexo,
      });

      Alert.alert(t("registro.exitoTitulo"), t("registro.exitoMensaje"));
      navigation.goBack();
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 409) {
        setError(t("registro.errorNumeroDuplicado"));
      } else if (err instanceof ErrorApi && err.status === 429) {
        setError(t("registro.errorLimite"));
      } else {
        setError(t("registro.errorGenerico"));
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>{t("registro.titulo")}</Text>
        <Text style={estilos.subtitulo}>{t("registro.subtitulo")}</Text>

        <CampoTexto
          etiqueta={t("registro.numeroEmpleadoEtiqueta")}
          placeholder={t("registro.numeroEmpleadoPlaceholder")}
          keyboardType="number-pad"
          autoCapitalize="none"
          value={numeroEmpleado}
          onChangeText={setNumeroEmpleado}
        />

        <View style={estilos.divisor} />

        {/* Paso 1: identidad personal. */}
        <View>
          <CampoTexto
            etiqueta={t("registro.nombreEtiqueta")}
            placeholder={t("registro.nombrePlaceholder")}
            value={nombre}
            onChangeText={setNombre}
          />

          <CampoTexto
            etiqueta={t("registro.apellidosEtiqueta")}
            placeholder={t("registro.apellidosPlaceholder")}
            value={apellidos}
            onChangeText={setApellidos}
          />

          <CampoTexto
            etiqueta={t("registro.dniEtiqueta")}
            placeholder={t("registro.dniPlaceholder")}
            autoCapitalize="characters"
            value={dni}
            onChangeText={(texto) => setDni(texto.toUpperCase())}
            error={dni.trim().length > 0 && !dniValido ? t("registro.dniError") : undefined}
          />

          <SelectorSexo etiqueta={t("registro.sexoEtiqueta")} valor={sexo} onCambiar={setSexo} />
        </View>

        <View style={estilos.divisor} />

        {/* Paso 2: información de contacto y origen. */}
        <View>
          <SelectorFecha
            etiqueta={t("registro.fechaNacimientoEtiqueta")}
            valor={fechaNacimiento}
            onCambiar={setFechaNacimiento}
          />

          <SelectorPais
            etiqueta={t("registro.nacionalidadEtiqueta")}
            placeholder={t("registro.nacionalidadPlaceholder")}
            valor={paisNacimiento}
            onSeleccionar={setPaisNacimiento}
          />
        </View>

        <View style={estilos.divisor} />

        {/* Paso 3: credenciales y seguridad. */}
        <View>
          <CampoTexto
            etiqueta={t("registro.contrasenaEtiqueta")}
            placeholder={t("registro.contrasenaPlaceholder")}
            secureTextEntry
            autoCapitalize="none"
            value={contrasena}
            onChangeText={setContrasena}
          />

          <CampoTexto
            etiqueta={t("registro.confirmarContrasenaEtiqueta")}
            placeholder={t("registro.confirmarContrasenaPlaceholder")}
            secureTextEntry
            autoCapitalize="none"
            value={confirmarContrasena}
            onChangeText={setConfirmarContrasena}
            error={!contrasenasCoinciden ? t("registro.contrasenasNoCoinciden") : undefined}
          />
        </View>

        {error ? <Text style={estilos.error}>{error}</Text> : null}

        <BotonPrimario
          titulo={t("registro.botonCrear")}
          onPress={manejarRegistro}
          cargando={enviando}
          deshabilitado={!formularioValido}
          estilo={estilos.boton}
        />

        <BotonPrimario
          titulo={t("registro.botonVolver")}
          onPress={() => navigation.goBack()}
          variante="secundario"
          estilo={estilos.botonSecundario}
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
  subtitulo: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    marginBottom: espaciado.lg,
  },
  divisor: {
    height: 1,
    backgroundColor: colores.borde,
    marginTop: espaciado.sm,
    marginBottom: espaciado.lg,
  },
  boton: {
    marginTop: espaciado.sm,
  },
  botonSecundario: {
    marginTop: espaciado.sm,
  },
  error: {
    ...tipografia.cuerpo,
    color: colores.peligro,
    marginBottom: espaciado.md,
    textAlign: "center",
  },
});
