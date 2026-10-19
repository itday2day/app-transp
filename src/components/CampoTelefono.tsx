import React, { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { SelectorBuscable } from "./SelectorBuscable";
import { CampoTexto } from "./CampoTexto";
import { PAISES } from "@/data/paises";
import { Pais } from "@/types";
import { separarTelefono, combinarTelefono, codigoMarcacion } from "@/utils/telefonoPais";

interface Props {
  etiqueta: string;
  valor: string; // E.164 completo ("" si vacío)
  onCambiar: (e164: string) => void;
  error?: string;
}

// spec_app_registro_paso5.md, paso 2c-3: selector de país (SelectorBuscable<Pais>, genérico, ya
// existente) + número suelto -- NO SelectorPais.tsx (ese devuelve el nombre del país, no el
// código de marcación que necesita este campo). libphonenumber-js/min YA está instalado y
// aprobado (decisión 3, Fase 1c) -- sin módulo nativo nuevo.
export function CampoTelefono({ etiqueta, valor, onCambiar, error }: Props) {
  const { t } = useTranslation();
  const [inicial] = useState(() => separarTelefono(valor));
  const [pais, setPais] = useState(inicial.pais);
  const [numero, setNumero] = useState(inicial.numero);

  function actualizarPais(nuevoPais: string) {
    setPais(nuevoPais);
    onCambiar(combinarTelefono(nuevoPais, numero));
  }

  function actualizarNumero(textoCrudo: string) {
    const limpio = textoCrudo.replace(/\D/g, "");
    setNumero(limpio);
    onCambiar(combinarTelefono(pais, limpio));
  }

  const paisSeleccionado = PAISES.find((p) => p.nombre === pais) ?? null;

  return (
    <View>
      <SelectorBuscable<Pais>
        etiqueta={etiqueta}
        placeholder={t("campoTelefono.paisPlaceholder")}
        valor={paisSeleccionado}
        opciones={PAISES}
        obtenerEtiqueta={(p) => `${p.nombre} (+${codigoMarcacion(p.nombre)})`}
        obtenerClave={(p) => p.codigo}
        onSeleccionar={(p) => actualizarPais(p.nombre)}
      />
      <CampoTexto
        etiqueta={t("campoTelefono.numeroEtiqueta")}
        placeholder={t("campoTelefono.numeroPlaceholder")}
        keyboardType="phone-pad"
        value={numero}
        onChangeText={actualizarNumero}
        error={error}
      />
    </View>
  );
}
