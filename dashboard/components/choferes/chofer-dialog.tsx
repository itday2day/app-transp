"use client";

import { Check, Copy, KeyRound, Pencil, RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { VistaDatos, type CampoVista } from "@/components/ui/vista-datos";
import { SelectorCodigoPais } from "@/components/choferes/selector-codigo-pais";
import {
  normalizarDni,
  normalizarParaComparar,
  SEXOS,
  TELEFONO_VALIDO_REGEX,
} from "@/lib/choferes";
import { PAISES } from "@/lib/paises";
import { combinarTelefono, limiteDigitosDelPais, separarTelefono } from "@/lib/telefono-pais";
import { formatFecha } from "@/lib/utils";
import type {
  ChoferDuplicadoResponse,
  ChoferRow,
  EditarChoferResponse,
  ResetearContrasenaResponse,
  SexoChofer,
} from "@/lib/types";

// Hallazgo #51, criterio 22: el alta (chofer=null) se retiró -- "Invitar chofer"
// (invitar-chofer-dialog.tsx) la reemplaza. Este diálogo queda solo para ver/editar un chofer
// que YA existe (por invitación o, todavía, por el alta vieja de los 5 de prueba).
interface ChoferDialogProps {
  chofer: ChoferRow;
  onClose: () => void;
  onGuardado: (chofer: ChoferRow) => void;
}

function esRespuestaDuplicado(cuerpo: unknown): cuerpo is ChoferDuplicadoResponse {
  return (
    typeof cuerpo === "object" &&
    cuerpo !== null &&
    "choferExistente" in cuerpo &&
    typeof (cuerpo as { choferExistente: unknown }).choferExistente === "object"
  );
}

function mensajeDeError(cuerpo: unknown, fallback: string): string {
  return cuerpo && typeof cuerpo === "object" && "mensaje" in cuerpo
    ? String((cuerpo as { mensaje: unknown }).mensaje)
    : fallback;
}

/** spec_telefono_e164_y_pais_desplegable.md: si el país guardado matchea una opción de PAISES
 * ignorando mayúsculas/acentos (ej. "Espana" sin tilde, dato real de antes de este spec), el
 * desplegable arranca con esa opción preseleccionada — el valor exacto de la lista, no el crudo
 * guardado. Si no matchea ninguna (país mal escrito, inventado, o inexistente en la lista), no
 * preselecciona nada: el desplegable queda vacío y el formulario exige elegir uno real. */
function paisPreseleccionado(paisGuardado: string | null | undefined): string {
  if (!paisGuardado) return "";
  const normalizado = normalizarParaComparar(paisGuardado);
  return PAISES.find((pais) => normalizarParaComparar(pais) === normalizado) ?? "";
}

/** Tarjeta de contraseña temporal — se muestra UNA sola vez (al crear o al resetear), con copiar
 * al portapapeles y una advertencia explícita de que no se vuelve a poder consultar. Mismo
 * criterio en los dos usos: no queda guardada en ningún lado después de esto. */
function ContrasenaTemporal({
  numeroEmpleadoLogin,
  contrasena,
}: {
  numeroEmpleadoLogin: string;
  contrasena: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(contrasena);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: la contraseña sigue visible en pantalla para copiarla a
      // mano — no hace falta manejar el error más que eso.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
      <p className="font-medium">
        Usuario: <span className="font-mono">{numeroEmpleadoLogin}</span>
      </p>
      <div className="flex items-center gap-2">
        <p className="font-mono text-base">{contrasena}</p>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={copiar}
          aria-label="Copiar contraseña"
        >
          {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Esto no se vuelve a mostrar — anotalo o dictaselo al chofer ahora. Va a tener que cambiarla
        en su primer ingreso.
      </p>
    </div>
  );
}

export function ChoferDialog({ chofer, onClose, onGuardado }: ChoferDialogProps) {
  const [nombre, setNombre] = useState(chofer.nombre);
  const [apellidos, setApellidos] = useState(chofer.apellidos);
  const [dni, setDni] = useState(chofer.dni);
  const [fechaNacimiento, setFechaNacimiento] = useState(chofer.fecha_nacimiento);
  const [paisNacimiento, setPaisNacimiento] = useState(paisPreseleccionado(chofer.pais_nacimiento));
  const [sexo, setSexo] = useState<SexoChofer | "">(chofer.sexo ?? "");
  // spec_telefono_pais_selector.md: el país arranca en España (o en el que corresponda al
  // teléfono ya guardado, separado por separarTelefono() — coincidencia de prefijo más largo
  // primero) y el número es solo el resto de los dígitos, sin el código de marcación.
  const telefonoSeparado = separarTelefono(chofer.telefono);
  const [paisTelefono, setPaisTelefono] = useState(telefonoSeparado.pais);
  const [numeroTelefono, setNumeroTelefono] = useState(telefonoSeparado.numero);

  // spec_modo_ver_editar_chofer_flota.md: abrir un chofer arranca siempre en "ver" (ya no existe
  // el modo alta, que arrancaba en "editar" directo -- Hallazgo #51, criterio 22). El componente
  // remonta con `key={chofer.id}` desde la página, así que este estado inicial nunca "se pega" de
  // un chofer anterior.
  const [modo, setModo] = useState<"ver" | "editar">("ver");
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

  // Snapshot de los valores con los que arrancó el formulario — estable mientras el componente
  // esté montado (no depende de nada que cambie), para poder comparar contra los valores actuales
  // sin duplicar la lógica de "¿hay cambios sin guardar?" en cada campo por separado.
  const valoresIniciales = useMemo(
    () => ({
      nombre: chofer.nombre,
      apellidos: chofer.apellidos,
      dni: chofer.dni,
      fechaNacimiento: chofer.fecha_nacimiento,
      paisNacimiento: paisPreseleccionado(chofer.pais_nacimiento),
      sexo: (chofer.sexo ?? "") as SexoChofer | "",
      paisTelefono: telefonoSeparado.pais,
      numeroTelefono: telefonoSeparado.numero,
    }),
    // A propósito solo una vez: el componente remonta entero (key={chofer.id}) cuando cambia de
    // chofer, nunca actualiza estos valores "iniciales" en el medio de una edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const hayCambiosSinGuardar =
    nombre !== valoresIniciales.nombre ||
    apellidos !== valoresIniciales.apellidos ||
    dni !== valoresIniciales.dni ||
    fechaNacimiento !== valoresIniciales.fechaNacimiento ||
    paisNacimiento !== valoresIniciales.paisNacimiento ||
    sexo !== valoresIniciales.sexo ||
    paisTelefono !== valoresIniciales.paisTelefono ||
    numeroTelefono !== valoresIniciales.numeroTelefono;

  function manejarCancelar() {
    // El botón ya pasó a ser "Cerrar" (no "Cancelar") en el estado congelado post-guardado — no
    // hay nada que descartar, es el mismo "Cerrar" de siempre.
    if (guardado) {
      onClose();
      return;
    }
    if (hayCambiosSinGuardar) {
      setConfirmandoDescarte(true);
      return;
    }
    setModo("ver");
  }

  function descartarCambios() {
    setNombre(valoresIniciales.nombre);
    setApellidos(valoresIniciales.apellidos);
    setDni(valoresIniciales.dni);
    setFechaNacimiento(valoresIniciales.fechaNacimiento);
    setPaisNacimiento(valoresIniciales.paisNacimiento);
    setSexo(valoresIniciales.sexo);
    setPaisTelefono(valoresIniciales.paisTelefono);
    setNumeroTelefono(valoresIniciales.numeroTelefono);
    setError(null);
    setConfirmandoDescarte(false);
    setModo("ver");
  }

  const [enviando, setEnviando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [reseteando, setReseteando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [choferGuardado, setChoferGuardado] = useState<ChoferRow | null>(null);
  const [contrasenaTemporal, setContrasenaTemporal] = useState<string | null>(null);
  // Si POST /api/choferes/editar devuelve 409 (DNI de otro chofer), esto guarda el chofer
  // existente para que el mensaje sea legible (quién es, si está activo) en vez de un error de
  // base de datos genérico.
  const [duplicado, setDuplicado] = useState<ChoferDuplicadoResponse | null>(null);

  async function onSubmit() {
    setError(null);
    setDuplicado(null);

    if (!nombre.trim()) return setError("Falta el nombre.");
    if (!apellidos.trim()) return setError("Faltan los apellidos.");
    if (!dni.trim()) return setError("Falta el DNI.");
    if (!fechaNacimiento) return setError("Falta la fecha de nacimiento.");
    if (!paisNacimiento.trim()) return setError("Falta el país de nacimiento.");
    if (!sexo) return setError("Elegí el sexo.");
    // El FORMATO se exige siempre que haya algo tipeado (spec_telefono_e164_y_pais_desplegable.md)
    // -- un chofer ya cargado sin teléfono se puede seguir guardando sin teléfono, pero si hay
    // algo tipeado tiene que ser válido. Se arma acá, no en el input: el selector de país ya
    // garantiza el "+" + código correctos, el campo numérico ya solo deja tipear dígitos.
    const telefono = numeroTelefono.trim() ? combinarTelefono(paisTelefono, numeroTelefono) : null;
    if (telefono && !TELEFONO_VALIDO_REGEX.test(telefono)) {
      return setError("El teléfono debe tener formato internacional, por ejemplo +34612345678.");
    }

    setEnviando(true);
    try {
      const respuesta = await fetch("/api/choferes/editar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: chofer.id,
          nombre: nombre.trim(),
          apellidos: apellidos.trim(),
          dni: normalizarDni(dni),
          fechaNacimiento,
          paisNacimiento: paisNacimiento.trim(),
          sexo,
          telefono,
        }),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        if (respuesta.status === 409 && esRespuestaDuplicado(cuerpo)) {
          setDuplicado(cuerpo);
        }
        setError(mensajeDeError(cuerpo, "No se pudo guardar el chofer."));
        return;
      }

      const { chofer: actualizado } = cuerpo as EditarChoferResponse;
      setGuardado(true);
      setChoferGuardado(actualizado);
      onGuardado(actualizado);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarActivo() {
    setError(null);
    setCambiandoEstado(true);
    try {
      const respuesta = await fetch("/api/choferes/editar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chofer.id, activo: !chofer.activo }),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo cambiar el estado."));
        return;
      }
      const { chofer: actualizado } = cuerpo as EditarChoferResponse;
      setGuardado(true);
      setChoferGuardado(actualizado);
      onGuardado(actualizado);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setCambiandoEstado(false);
    }
  }

  async function resetearContrasena() {
    setError(null);
    setReseteando(true);
    try {
      const respuesta = await fetch("/api/choferes/resetear-contrasena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chofer.id }),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo resetear la contraseña."));
        return;
      }
      const { contrasenaTemporal: nuevaContrasena } = cuerpo as ResetearContrasenaResponse;
      setContrasenaTemporal(nuevaContrasena);
      setGuardado(true);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setReseteando(false);
    }
  }

  const deshabilitarCampos = guardado;
  const estadoActual = choferGuardado?.activo ?? chofer?.activo ?? true;

  const titulo = modo === "ver" ? "Ver chofer" : "Editar chofer";

  if (modo === "ver") {
    const campos: CampoVista[] = [
      // Hallazgo #51: un chofer registrado por invitación no tiene numero_empleado -- se omite
      // la fila entera en vez de mostrar "—" (es un dato que ya no aplica, no uno vacío).
      ...(chofer.numero_empleado
        ? [{ etiqueta: "Número de empleado", valor: chofer.numero_empleado, mono: true }]
        : []),
      { etiqueta: "Nombre", valor: chofer.nombre },
      { etiqueta: "Apellidos", valor: chofer.apellidos },
      { etiqueta: "DNI", valor: chofer.dni, mono: true },
      { etiqueta: "Fecha de nacimiento", valor: formatFecha(chofer.fecha_nacimiento), mono: true },
      { etiqueta: "País de nacimiento", valor: chofer.pais_nacimiento ?? "—" },
      { etiqueta: "Sexo", valor: chofer.sexo ?? "—" },
      { etiqueta: "Teléfono", valor: chofer.telefono ?? "—", mono: true },
    ];

    return (
      <Dialog open onClose={onClose} title={titulo} className="max-w-lg">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge variant={estadoActual ? "primary" : "default"}>
              {estadoActual ? "Activo" : "De baja"}
            </Badge>
          </div>

          <VistaDatos campos={campos} />

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          {/* Hallazgo #44: antes de este fix, resetearContrasena() ya guardaba la temporal en
              estado (setContrasenaTemporal) pero este return de "Ver" nunca la dibujaba — la
              contraseña del chofer se cambiaba igual (la API no tiene culpa) y el secreto se
              perdía sin que nadie lo viera. Mismo componente y mismo numeroEmpleadoLogin que usa
              el modo "Editar". numero_empleado solo puede faltar (Hallazgo #51) para un chofer
              registrado por invitación, que entra con correo+contraseña, no con este mecanismo
              -- "Resetear contraseña" ya está oculto para esos (ver el `chofer.numero_empleado &&`
              de abajo), así que llegar hasta acá con numero_empleado null no debería pasar. */}
          {contrasenaTemporal && (
            <ContrasenaTemporal
              numeroEmpleadoLogin={choferGuardado?.numero_empleado ?? chofer.numero_empleado ?? ""}
              contrasena={contrasenaTemporal}
            />
          )}

          {contrasenaTemporal ? (
            // Mismo criterio que "Editar": con la temporal a la vista, nada de Resetear/Dar de
            // baja/Editar — así no se puede perder el secreto pulsando "Resetear" dos veces.
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={alternarActivo}
                  loading={cambiandoEstado}
                >
                  <RotateCcw className="h-4 w-4" />
                  {estadoActual ? "Dar de baja" : "Reactivar"}
                </Button>
                {/* Hallazgo #51, criterio 16: el restablecimiento por contraseña temporal se
                    conserva SOLO para los choferes de la alta vieja (numero_empleado, correo
                    sintético) -- uno registrado por invitación entra con correo real +
                    contraseña propia, "resetear" acá no tendría ningún efecto útil. */}
                {chofer.numero_empleado && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetearContrasena}
                    loading={reseteando}
                  >
                    <KeyRound className="h-4 w-4" />
                    Resetear contraseña
                  </Button>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cerrar
                </Button>
                <Button type="button" onClick={() => setModo("editar")}>
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title={titulo} className="max-w-lg">
      <div className="flex flex-col gap-4">
        {/* numero_empleado no se edita nunca (cambiar numeroEmpleado cambiaría el correo
            sintético con el que el chofer ya inició sesión antes) -- solo se muestra como
            referencia de solo lectura, y solo si existe (Hallazgo #51: uno registrado por
            invitación no tiene). */}
        {chofer.numero_empleado && (
          <div>
            <Label htmlFor="chf-numero">Número de empleado</Label>
            <Input id="chf-numero" value={chofer.numero_empleado} disabled />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="chf-nombre">Nombre</Label>
            <Input
              id="chf-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={deshabilitarCampos}
            />
          </div>
          <div>
            <Label htmlFor="chf-apellidos">Apellidos</Label>
            <Input
              id="chf-apellidos"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              disabled={deshabilitarCampos}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="chf-dni">DNI</Label>
            <Input
              id="chf-dni"
              value={dni}
              onChange={(e) => setDni(normalizarDni(e.target.value))}
              maxLength={9}
              disabled={deshabilitarCampos}
            />
          </div>
          <div>
            <Label htmlFor="chf-sexo">Sexo</Label>
            <Select
              id="chf-sexo"
              value={sexo}
              onChange={(e) => setSexo(e.target.value as SexoChofer | "")}
              disabled={deshabilitarCampos}
            >
              <option value="">Elegir…</option>
              {SEXOS.map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="chf-fecha-nacimiento">Fecha de nacimiento</Label>
            <Input
              id="chf-fecha-nacimiento"
              type="date"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              disabled={deshabilitarCampos}
            />
          </div>
          <div>
            <Label htmlFor="chf-pais">País de nacimiento</Label>
            <Select
              id="chf-pais"
              value={paisNacimiento}
              onChange={(e) => setPaisNacimiento(e.target.value)}
              disabled={deshabilitarCampos}
            >
              <option value="">Elegir…</option>
              {PAISES.map((pais) => (
                <option key={pais} value={pais}>
                  {pais}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="chf-telefono-numero">Teléfono (opcional)</Label>
          {/* spec_telefono_pais_selector.md: el "+" + código de marcación ya no se tipean — los
              da el selector de país, elegido por nombre (filtrable), mostrado como ISO alpha-2 +
              código. El campo numérico solo acepta dígitos; se componen los dos recién al
              guardar (ver onSubmit, combinarTelefono()). Ajuste a 16: maxLength es el máximo real
              de dígitos nacionales del país elegido (limiteDigitosDelPais(), telefono-pais.ts),
              no "15 − código" -- ese cálculo deja pasar o corta de más según el país. */}
          <div className="flex gap-2">
            <SelectorCodigoPais
              value={paisTelefono}
              onChange={setPaisTelefono}
              disabled={deshabilitarCampos}
            />
            <Input
              id="chf-telefono-numero"
              value={numeroTelefono}
              onChange={(e) => setNumeroTelefono(e.target.value.replace(/\D/g, ""))}
              maxLength={limiteDigitosDelPais(paisTelefono) ?? 15}
              placeholder="612345678"
              className="flex-1"
              disabled={deshabilitarCampos}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {duplicado && <p className="text-sm text-muted-foreground">{duplicado.mensaje}</p>}

        {contrasenaTemporal && (
          <ContrasenaTemporal
            numeroEmpleadoLogin={choferGuardado?.numero_empleado ?? chofer.numero_empleado ?? ""}
            contrasena={contrasenaTemporal}
          />
        )}

        {guardado && !contrasenaTemporal && (
          <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
            Chofer actualizado.
          </p>
        )}

        {confirmandoDescarte ? (
          <div className="flex flex-col gap-3 rounded-md border border-warning/30 bg-warning/10 p-3">
            <p className="text-sm">¿Descartar los cambios sin guardar?</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmandoDescarte(false)}>
                Seguir editando
              </Button>
              <Button type="button" variant="outline" onClick={descartarCambios}>
                Descartar cambios
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {!contrasenaTemporal && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={alternarActivo}
                    loading={cambiandoEstado}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {estadoActual ? "Dar de baja" : "Reactivar"}
                  </Button>
                  {chofer.numero_empleado && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetearContrasena}
                      loading={reseteando}
                    >
                      <KeyRound className="h-4 w-4" />
                      Resetear contraseña
                    </Button>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={manejarCancelar}>
                {guardado ? "Cerrar" : "Cancelar"}
              </Button>
              {!guardado && (
                <Button type="button" onClick={onSubmit} loading={enviando}>
                  <Save className="h-4 w-4" />
                  Guardar
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
