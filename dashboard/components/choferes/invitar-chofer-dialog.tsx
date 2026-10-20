"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { SelectorCodigoPais } from "@/components/choferes/selector-codigo-pais";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { normalizarDni } from "@/lib/choferes";
import { sugerirCorreccionCorreo } from "@/lib/correo";
import { useEmpresas } from "@/lib/hooks/use-empresas";
import { useRutas } from "@/lib/hooks/use-rutas";
import { validarDatosInvitacion } from "@/lib/invitaciones";
import { combinarTelefono, limiteDigitosDelPais, PAIS_TELEFONO_DEFECTO } from "@/lib/telefono-pais";
import type {
  CrearInvitacionRequest,
  CrearInvitacionResponse,
  InvitacionConEstado,
} from "@/lib/types";

interface InvitarChoferDialogProps {
  onClose: () => void;
  onCreada: (invitacion: InvitacionConEstado) => void;
}

// Dos modos en el mismo diálogo (criterio 31, Decisión del Paso B, Actualización 5 de
// spec_bloque_b_alta_asistida_enlace_unico.md, 2026-10-14).
type ModoInvitacion = "abierta" | "con_datos";

function mensajeDeError(cuerpo: unknown, fallback: string): string {
  return cuerpo && typeof cuerpo === "object" && "mensaje" in cuerpo
    ? String((cuerpo as { mensaje: unknown }).mensaje)
    : fallback;
}

// El servidor solo manda este campo en el 409 de "invitación pendiente" (nunca en el de "ya hay
// un chofer con ese DNI", que no tiene nada que revocar) -- ver app/api/invitaciones/route.ts.
function idInvitacionPendiente(cuerpo: unknown): string | null {
  return cuerpo && typeof cuerpo === "object" && "invitacionPendienteId" in cuerpo
    ? String((cuerpo as { invitacionPendienteId: unknown }).invitacionPendienteId)
    : null;
}

/** Mismo patrón que ContrasenaTemporal en chofer-dialog.tsx: el texto se puede volver a leer
 * mientras el diálogo esté abierto (a diferencia de la contraseña, acá no hay ningún secreto que
 * perder), pero el botón "Copiar" es el gesto esperado antes de cerrar y pegarlo donde
 * Administración avise al chofer. */
function MensajeParaCopiar({ mensaje }: { mensaje: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el texto sigue visible para copiarlo a mano.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
      <pre className="whitespace-pre-wrap font-sans">{mensaje}</pre>
      <Button type="button" variant="outline" onClick={copiar} className="self-start">
        {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copiado ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

export function InvitarChoferDialog({ onClose, onCreada }: InvitarChoferDialogProps) {
  const { data: empresasResp } = useEmpresas();
  const { data: rutasResp } = useRutas();
  const empresas = useMemo(
    () => (empresasResp?.data ?? []).filter((e) => e.activo),
    [empresasResp]
  );

  const [modo, setModo] = useState<ModoInvitacion>("abierta");
  const [empresaId, setEmpresaId] = useState("");
  const [rutaId, setRutaId] = useState("");
  const rutasDeLaEmpresa = useMemo(() => {
    if (!empresaId) return [];
    return (rutasResp?.data ?? []).filter((r) => r.empresa_id === empresaId && r.activo);
  }, [rutasResp, empresaId]);

  // Campos del modo "Con datos del chofer" -- todos opcionales uno por uno (criterio 31): el
  // encargado puede llenar solo el DNI, o solo el correo, lo que tenga a mano.
  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [paisTelefono, setPaisTelefono] = useState(PAIS_TELEFONO_DEFECTO);
  const [numeroTelefono, setNumeroTelefono] = useState("");
  const [email, setEmail] = useState("");
  // Aviso de posible errata (criterio 39/31) -- nunca bloquea: es una sugerencia aparte del
  // valor real de `email`, que solo se reemplaza si el encargado toca "Usar esta".
  const [sugerenciaCorreo, setSugerenciaCorreo] = useState<string | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // DNI duplicado contra una invitación pendiente (criterio 32): el id para poder revocarla sin
  // salir del diálogo. Si el duplicado es contra un chofer ya existente, el servidor no manda
  // ningún id (nada que revocar) y este campo queda en null.
  const [invitacionPendienteId, setInvitacionPendienteId] = useState<string | null>(null);
  const [revocando, setRevocando] = useState(false);
  const [mensajeParaCopiar, setMensajeParaCopiar] = useState<string | null>(null);

  const bloqueado = !!mensajeParaCopiar;
  const telefono = numeroTelefono.trim() ? combinarTelefono(paisTelefono, numeroTelefono) : "";

  function manejarCambioEmpresa(nuevaEmpresaId: string) {
    setEmpresaId(nuevaEmpresaId);
    setRutaId("");
  }

  function manejarCambioModo(nuevoModo: ModoInvitacion) {
    setModo(nuevoModo);
    setError(null);
    setInvitacionPendienteId(null);
  }

  function manejarCambioCorreo(valor: string) {
    setEmail(valor);
    setInvitacionPendienteId(null);
    setSugerenciaCorreo(valor.trim() ? sugerirCorreccionCorreo(valor.trim()) : null);
  }

  async function onSubmit() {
    setError(null);
    setInvitacionPendienteId(null);

    // Mismas validaciones que el servidor (lib/invitaciones.ts, validarDatosInvitacion) -- se
    // llama a la MISMA función, no a una copia: el encargado ve el error antes de generar nada.
    if (modo === "con_datos") {
      const errorValidacion = validarDatosInvitacion({ dni, telefono, email, fechaNacimiento });
      if (errorValidacion) {
        setError(errorValidacion);
        return;
      }
    }

    setEnviando(true);
    try {
      const cuerpo: CrearInvitacionRequest = {
        empresaId: empresaId || undefined,
        rutaId: rutaId || undefined,
        ...(modo === "con_datos"
          ? {
              dni: dni.trim() || undefined,
              nombre: nombre.trim() || undefined,
              apellidos: apellidos.trim() || undefined,
              telefono: telefono || undefined,
              email: email.trim() || undefined,
              fechaNacimiento: fechaNacimiento || undefined,
            }
          : {}),
      };
      const respuesta = await fetch("/api/invitaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const cuerpoRespuesta: unknown = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpoRespuesta, "No se pudo generar la invitación."));
        setInvitacionPendienteId(idInvitacionPendiente(cuerpoRespuesta));
        return;
      }
      const { invitacion, mensajeParaCopiar: mensaje } = cuerpoRespuesta as CrearInvitacionResponse;
      setMensajeParaCopiar(mensaje);
      onCreada(invitacion);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
    }
  }

  // Revocar la invitación pendiente que choca por DNI (criterio 32), sin salir del diálogo --
  // deja los campos tal como estaban para que el encargado solo tenga que tocar "Generar
  // invitación" de nuevo.
  async function revocarPendiente() {
    if (!invitacionPendienteId) return;
    setRevocando(true);
    try {
      const respuesta = await fetch("/api/invitaciones/revocar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invitacionPendienteId }),
      });
      if (!respuesta.ok) {
        const cuerpo: unknown = await respuesta.json().catch(() => null);
        setError(mensajeDeError(cuerpo, "No se pudo revocar la invitación pendiente."));
        return;
      }
      setError(null);
      setInvitacionPendienteId(null);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setRevocando(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Invitar chofer" className="max-w-lg">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Generá una invitación para que el chofer se registre solo, desde su teléfono. Vale una
          sola vez y vence a las 48 horas.
        </p>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={modo === "abierta" ? "default" : "outline"}
            size="sm"
            onClick={() => manejarCambioModo("abierta")}
            disabled={bloqueado}
          >
            Abierta
          </Button>
          <Button
            type="button"
            variant={modo === "con_datos" ? "default" : "outline"}
            size="sm"
            onClick={() => manejarCambioModo("con_datos")}
            disabled={bloqueado}
          >
            Con datos del chofer
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="inv-empresa">Empresa (opcional)</Label>
            <Select
              id="inv-empresa"
              value={empresaId}
              onChange={(e) => manejarCambioEmpresa(e.target.value)}
              disabled={bloqueado}
            >
              <option value="">Sin asignar</option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="inv-ruta">Ruta (opcional)</Label>
            <Select
              id="inv-ruta"
              value={rutaId}
              onChange={(e) => setRutaId(e.target.value)}
              disabled={!empresaId || bloqueado}
            >
              <option value="">Sin asignar</option>
              {rutasDeLaEmpresa.map((ruta) => (
                <option key={ruta.id} value={ruta.id}>
                  {ruta.nombre}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {modo === "con_datos" && (
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="inv-dni">DNI/NIE (opcional)</Label>
                <Input
                  id="inv-dni"
                  value={dni}
                  onChange={(e) => {
                    setDni(normalizarDni(e.target.value));
                    setInvitacionPendienteId(null);
                  }}
                  maxLength={9}
                  disabled={bloqueado}
                />
              </div>
              {/* Regla del Hallazgo #54 (filtros-jornadas.tsx): un <input type="date"> nativo
                  ignora w-full por debajo de cierto ancho (confirmado en Safari de iPhone) --
                  ancho EXPLÍCITO w-48 (192px) en vez de w-full, y en su propia fila
                  (col-span-2) para que nunca comparta fila con DNI/NIE en pantallas angostas.
                  Desde `lg` vuelve a lo que había: comparte fila con DNI/NIE (col-span-1) y
                  w-full dentro de su celda. */}
              <div className="col-span-2 lg:col-span-1">
                <Label htmlFor="inv-fecha-nacimiento">Fecha de nacimiento (opcional)</Label>
                <Input
                  id="inv-fecha-nacimiento"
                  type="date"
                  value={fechaNacimiento}
                  onChange={(e) => setFechaNacimiento(e.target.value)}
                  disabled={bloqueado}
                  className="w-48 lg:w-full"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="inv-nombre">Nombres (opcional)</Label>
                <Input
                  id="inv-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  disabled={bloqueado}
                />
              </div>
              <div>
                <Label htmlFor="inv-apellidos">Apellidos (opcional)</Label>
                <Input
                  id="inv-apellidos"
                  value={apellidos}
                  onChange={(e) => setApellidos(e.target.value)}
                  disabled={bloqueado}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="inv-telefono-numero">Teléfono (opcional)</Label>
              {/* Ajuste a 16 (spec_ajustes_pantalla_registro_limites_campos.md): maxLength es el
                  máximo real de dígitos nacionales del país elegido
                  (limiteDigitosDelPais(), telefono-pais.ts), no "15 − código". */}
              <div className="flex gap-2">
                <SelectorCodigoPais
                  value={paisTelefono}
                  onChange={setPaisTelefono}
                  disabled={bloqueado}
                />
                <Input
                  id="inv-telefono-numero"
                  value={numeroTelefono}
                  onChange={(e) => setNumeroTelefono(e.target.value.replace(/\D/g, ""))}
                  maxLength={limiteDigitosDelPais(paisTelefono) ?? 15}
                  placeholder="612345678"
                  className="flex-1"
                  disabled={bloqueado}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="inv-email">Correo (opcional)</Label>
              <Input
                id="inv-email"
                type="email"
                value={email}
                onChange={(e) => manejarCambioCorreo(e.target.value)}
                disabled={bloqueado}
              />
              {sugerenciaCorreo && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ¿Quisiste decir <strong>{sugerenciaCorreo}</strong>?{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setEmail(sugerenciaCorreo);
                      setSugerenciaCorreo(null);
                    }}
                  >
                    Usar esta
                  </button>
                </p>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
            {invitacionPendienteId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={revocarPendiente}
                loading={revocando}
                className="self-start"
              >
                Revocar esa invitación
              </Button>
            )}
          </div>
        )}

        {mensajeParaCopiar && <MensajeParaCopiar mensaje={mensajeParaCopiar} />}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {mensajeParaCopiar ? "Cerrar" : "Cancelar"}
          </Button>
          {!mensajeParaCopiar && (
            <Button type="button" onClick={onSubmit} loading={enviando}>
              Generar invitación
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
