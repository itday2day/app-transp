"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectorCodigoPais } from "@/components/choferes/selector-codigo-pais";
import { normalizarDni } from "@/lib/choferes";
import { siguienteNumeroTelefono } from "@/lib/telefono-pais";

// Mismas etiquetas que usa el registro de la app (es.json: registro.nombreEtiqueta,
// apellidosEtiqueta, dniEtiqueta, fechaNacimientoEtiqueta, telefonoEtiqueta, login.correoEtiqueta)
// -- spec_dashboard_choferes_limpieza.md, criterio 11.
const ETIQUETAS = {
  nombre: "Nombre",
  apellidos: "Apellidos",
  dni: "DNI",
  fechaNacimiento: "Fecha de nacimiento",
  telefono: "Número de teléfono",
  correo: "Correo electrónico",
} as const;

type CorreoCampo =
  | {
      modo: "editable";
      valor: string;
      onCambiar: (valor: string) => void;
      sugerencia: string | null;
      onUsarSugerencia: () => void;
    }
  | { modo: "solo-lectura"; valor: string };

interface CamposChoferOpcionales {
  nombre?: boolean;
  apellidos?: boolean;
  dni?: boolean;
  fechaNacimiento?: boolean;
  telefono?: boolean;
  /** Solo se usa con correo.modo === "editable" (Invitar chofer); en modo solo-lectura (Editar
   * chofer) la etiqueta nunca lleva esta marca, sea lo que sea que venga acá. */
  correo?: boolean;
}

interface CamposChoferProps {
  idPrefix: string;
  disabled?: boolean;
  /** Qué campos lleva la marca visual "(opcional)" -- la obligatoriedad real la sigue validando
   * cada diálogo que usa este componente (criterio 12), esto es solo la etiqueta. */
  opcional?: CamposChoferOpcionales;
  nombre: string;
  onCambiarNombre: (valor: string) => void;
  apellidos: string;
  onCambiarApellidos: (valor: string) => void;
  dni: string;
  onCambiarDni: (valor: string) => void;
  fechaNacimiento: string;
  onCambiarFechaNacimiento: (valor: string) => void;
  paisTelefono: string;
  onCambiarPaisTelefono: (valor: string) => void;
  numeroTelefono: string;
  onCambiarNumeroTelefono: (valor: string) => void;
  /** Sin esta prop, la fila de Correo no se dibuja (ej. todavía no cargó el estado del chofer). */
  correo?: CorreoCampo;
}

function etiquetaConOpcional(texto: string, esOpcional: boolean | undefined) {
  return esOpcional ? `${texto} (opcional)` : texto;
}

/** Campos del chofer compartidos entre "Invitar chofer" (modo "Con datos") y "Editar chofer"
 * (spec_dashboard_choferes_limpieza.md, criterio 11): mismo orden -- Nombre, Apellidos, DNI,
 * Fecha de nacimiento, Teléfono, Correo -- y mismas etiquetas que el registro de la app. */
export function CamposChofer({
  idPrefix,
  disabled,
  opcional = {},
  nombre,
  onCambiarNombre,
  apellidos,
  onCambiarApellidos,
  dni,
  onCambiarDni,
  fechaNacimiento,
  onCambiarFechaNacimiento,
  paisTelefono,
  onCambiarPaisTelefono,
  numeroTelefono,
  onCambiarNumeroTelefono,
  correo,
}: CamposChoferProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${idPrefix}-nombre`}>
            {etiquetaConOpcional(ETIQUETAS.nombre, opcional.nombre)}
          </Label>
          <Input
            id={`${idPrefix}-nombre`}
            value={nombre}
            onChange={(e) => onCambiarNombre(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-apellidos`}>
            {etiquetaConOpcional(ETIQUETAS.apellidos, opcional.apellidos)}
          </Label>
          <Input
            id={`${idPrefix}-apellidos`}
            value={apellidos}
            onChange={(e) => onCambiarApellidos(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${idPrefix}-dni`}>
            {etiquetaConOpcional(ETIQUETAS.dni, opcional.dni)}
          </Label>
          <Input
            id={`${idPrefix}-dni`}
            value={dni}
            onChange={(e) => onCambiarDni(normalizarDni(e.target.value))}
            maxLength={9}
            disabled={disabled}
          />
        </div>
        {/* Hallazgo #54: ancho explícito w-48 y fila propia por debajo de `lg` -- un
            <input type="date"> nativo ignora w-full. */}
        <div className="col-span-2 lg:col-span-1">
          <Label htmlFor={`${idPrefix}-fecha-nacimiento`}>
            {etiquetaConOpcional(ETIQUETAS.fechaNacimiento, opcional.fechaNacimiento)}
          </Label>
          <Input
            id={`${idPrefix}-fecha-nacimiento`}
            type="date"
            value={fechaNacimiento}
            onChange={(e) => onCambiarFechaNacimiento(e.target.value)}
            disabled={disabled}
            className="w-48 lg:w-full"
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-telefono-numero`}>
          {etiquetaConOpcional(ETIQUETAS.telefono, opcional.telefono)}
        </Label>
        {/* Sin maxLength -- recortaría los dígitos crudos a ciegas sin contar el prefijo
            nacional. El tope real es "al teclear" (siguienteNumeroTelefono()): nunca recorta,
            solo rechaza el dígito que haría superar el máximo nacional del país elegido. */}
        <div className="flex gap-2">
          <SelectorCodigoPais
            value={paisTelefono}
            onChange={onCambiarPaisTelefono}
            disabled={disabled}
          />
          <Input
            id={`${idPrefix}-telefono-numero`}
            value={numeroTelefono}
            onChange={(e) =>
              onCambiarNumeroTelefono(
                siguienteNumeroTelefono(paisTelefono, numeroTelefono, e.target.value)
              )
            }
            placeholder="612345678"
            className="flex-1"
            disabled={disabled}
          />
        </div>
      </div>

      {correo && (
        <div>
          <Label htmlFor={`${idPrefix}-correo`}>
            {correo.modo === "editable"
              ? etiquetaConOpcional(ETIQUETAS.correo, opcional.correo)
              : ETIQUETAS.correo}
          </Label>
          {correo.modo === "solo-lectura" ? (
            <Input id={`${idPrefix}-correo`} value={correo.valor} disabled />
          ) : (
            <>
              <Input
                id={`${idPrefix}-correo`}
                type="email"
                value={correo.valor}
                onChange={(e) => correo.onCambiar(e.target.value)}
                disabled={disabled}
              />
              {correo.sugerencia && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ¿Quisiste decir <strong>{correo.sugerencia}</strong>?{" "}
                  <button type="button" className="underline" onClick={correo.onUsarSugerencia}>
                    Usar esta
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
