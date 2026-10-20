import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { SelectorBuscable } from "./SelectorBuscable";
import { CampoTexto } from "./CampoTexto";
import { PAISES } from "@/data/paises";
import { Pais } from "@/types";
import {
  separarTelefono,
  combinarTelefono,
  siguienteNumeroTelefono,
  codigoMarcacion,
} from "@/utils/telefonoPais";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

interface Props {
  etiqueta: string;
  valor: string; // E.164 completo ("" si vacío)
  onCambiar: (e164: string) => void;
  // R4 (menor, ronda de revisión): antes el llamador marcaba "tocado" desde onCambiar, mostrando
  // el error de formato apenas se escribía el primer dígito. onBlur separa el "cambió" (siempre,
  // para que el padre tenga el E.164 al día) del "el chofer ya terminó de tocar este campo" (solo
  // al salir), igual que CampoTexto.
  onBlur?: () => void;
  // Criterio 5: el aviso (P3) se muestra UNA sola vez, debajo de la fila completa -- CampoTelefono
  // ya no reenvía `error` a ninguno de los dos sub-controles (antes aparecía pegado solo al
  // número). RegistroScreen decide el texto (necesita el país, que deriva de `valor` con
  // separarTelefono() -- nunca de parsePhoneNumberFromString(valor).country, ver telefonoPais.ts).
  error?: string;
}

// spec_app_registro_paso5.md, paso 2c-3: selector de país (SelectorBuscable<Pais>, genérico, ya
// existente) + número suelto -- NO SelectorPais.tsx (ese devuelve el nombre del país, no el
// código de marcación que necesita este campo). libphonenumber-js/min YA está instalado y
// aprobado (decisión 3, Fase 1c) -- sin módulo nativo nuevo.
//
// Criterios 8-11 (spec_ajustes_pantalla_registro_limites_campos.md): un solo título visible
// ("Número de teléfono", la prop `etiqueta`) cubre TODA la fila -- ni el selector ni el campo de
// número muestran el suyo (`ocultarEtiquetaVisible`), cada uno con su propio
// `accessibilityLabel` para lectores de pantalla. Selector compacto (P2): cerrado muestra solo
// "+<prefijo>" (`obtenerEtiquetaCompacta`); la lista abierta sigue mostrando "País (+prefijo)",
// filtrable, sin cambios. Misma altura (52px) en los dos controles de la fila.
export function CampoTelefono({ etiqueta, valor, onCambiar, onBlur, error }: Props) {
  const { t } = useTranslation();
  const [inicial] = useState(() => separarTelefono(valor));
  const [pais, setPais] = useState(inicial.pais);
  const [numero, setNumero] = useState(inicial.numero);

  function actualizarPais(nuevoPais: string) {
    setPais(nuevoPais);
    // ⚠️ Criterio 13: cambiar de país NUNCA recorta los dígitos ya escritos -- combinarTelefono()
    // compone con los mismos `numero` tal cual, aunque el E.164 resultante deje de ser posible
    // para el país nuevo (el aviso del padre, vía `error`, es quien se encarga de avisarlo).
    onCambiar(combinarTelefono(nuevoPais, numero));
  }

  function actualizarNumero(textoCrudo: string) {
    // Ajuste a 13, "tope al teclear": un dígito nuevo solo entra si el número nacional que
    // resultaría no supera el máximo del país (siguienteNumeroTelefono(), telefonoPais.ts) --
    // nunca un corte a ciegas sobre los dígitos crudos.
    const limpio = siguienteNumeroTelefono(pais, numero, textoCrudo.replace(/\D/g, ""));
    setNumero(limpio);
    onCambiar(combinarTelefono(pais, limpio));
  }

  const paisSeleccionado = PAISES.find((p) => p.nombre === pais) ?? null;

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <View style={estilos.fila}>
        <View style={estilos.columnaPrefijo}>
          <SelectorBuscable<Pais>
            etiqueta={t("campoTelefono.prefijoEtiquetaAccesible")}
            ocultarEtiquetaVisible
            placeholder={t("campoTelefono.paisPlaceholder")}
            valor={paisSeleccionado}
            opciones={PAISES}
            obtenerEtiqueta={(p) => `${p.nombre} (+${codigoMarcacion(p.nombre)})`}
            obtenerEtiquetaCompacta={(p) => `+${codigoMarcacion(p.nombre)}`}
            obtenerClave={(p) => p.codigo}
            onSeleccionar={(p) => actualizarPais(p.nombre)}
          />
        </View>
        <View style={estilos.columnaNumero}>
          <CampoTexto
            etiqueta={t("campoTelefono.numeroEtiqueta")}
            ocultarEtiquetaVisible
            accessibilityLabel={t("campoTelefono.numeroEtiqueta")}
            placeholder={t("campoTelefono.numeroPlaceholder")}
            keyboardType="phone-pad"
            value={numero}
            onChangeText={actualizarNumero}
            onBlur={onBlur}
            style={estilos.inputNumero}
          />
        </View>
      </View>
      {error ? <Text style={estilos.textoError}>{error}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    marginBottom: espaciado.md,
  },
  etiqueta: {
    ...tipografia.cuerpo,
    marginBottom: espaciado.xs,
    fontWeight: "600",
  },
  fila: {
    flexDirection: "row",
    gap: espaciado.sm,
  },
  // P2: selector compacto -- ancho de contenido, no flex:1 (eso se lo lleva el número).
  columnaPrefijo: {
    width: 92,
  },
  columnaNumero: {
    flex: 1,
  },
  // Mismos 52px que el selector (SelectorBuscable.tsx: estilos.selector) -- criterio 8, "misma
  // altura" -- el default de CampoTexto queda por debajo de los 48px mínimos.
  inputNumero: {
    minHeight: 52,
  },
  textoError: {
    ...tipografia.ayuda,
    color: colores.peligro,
    marginTop: espaciado.xs,
  },
});
