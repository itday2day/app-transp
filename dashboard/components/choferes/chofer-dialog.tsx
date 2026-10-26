"use client";

import { Check, Copy, KeyRound, Pencil, RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { VistaDatos, type CampoVista } from "@/components/ui/vista-datos";
import { CamposChofer } from "@/components/choferes/campos-chofer";
import { EmpresasRutasChofer } from "@/components/choferes/empresas-rutas-chofer";
import { normalizarDni, TELEFONO_VALIDO_REGEX } from "@/lib/choferes";
import { useEstadoChoferes } from "@/lib/hooks/use-estado-choferes";
import { useRutas } from "@/lib/hooks/use-rutas";
import { useVinculosChofer } from "@/lib/hooks/use-vinculos-chofer";
import { combinarTelefono, separarTelefono } from "@/lib/telefono-pais";
import { formatFecha } from "@/lib/utils";
import type {
  ChoferDuplicadoResponse,
  ChoferRow,
  DiferenciasVinculosChoferRequest,
  EditarChoferResponse,
  ResetearContrasenaResponse,
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
  // email/email_confirmed_at viven en auth.users, no en `choferes` -- misma query que ya usa
  // /choferes (TablaChoferes), react-query la deduplica así que abrir el diálogo no dispara una
  // segunda consulta de red.
  const { data: estadoResp } = useEstadoChoferes();
  const correoChofer = estadoResp?.data.find((e) => e.id === chofer.id)?.email ?? "—";

  const [nombre, setNombre] = useState(chofer.nombre);
  const [apellidos, setApellidos] = useState(chofer.apellidos);
  const [dni, setDni] = useState(chofer.dni);
  const [fechaNacimiento, setFechaNacimiento] = useState(chofer.fecha_nacimiento);
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
      paisTelefono: telefonoSeparado.pais,
      numeroTelefono: telefonoSeparado.numero,
    }),
    // A propósito solo una vez: el componente remonta entero (key={chofer.id}) cuando cambia de
    // chofer, nunca actualiza estos valores "iniciales" en el medio de una edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const camposChoferCambiaron =
    nombre !== valoresIniciales.nombre ||
    apellidos !== valoresIniciales.apellidos ||
    dni !== valoresIniciales.dni ||
    fechaNacimiento !== valoresIniciales.fechaNacimiento ||
    paisTelefono !== valoresIniciales.paisTelefono ||
    numeroTelefono !== valoresIniciales.numeroTelefono;

  // Empresas y rutas (spec_catalogo_por_chofer.md, Etapa 2, decisión D1/D2): snapshot cargado al
  // abrir el diálogo. vinculosResp llega async (useQuery), así que no puede sembrarse con un
  // useMemo de una sola corrida como valoresIniciales arriba -- en vez de un useEffect que llame
  // setState (regla de React: evitar setState síncrono dentro de un efecto, cascada de renders),
  // se sincroniza DURANTE el render, comparando contra la última respuesta ya procesada (patrón
  // "ajustar estado cuando cambia una prop" de la documentación de React) -- react-query además
  // preserva la referencia cuando el contenido no cambió (structural sharing), así que esto corre
  // una sola vez por snapshot real, no en cada render.
  const queryClient = useQueryClient();
  const { data: vinculosResp, isLoading: cargandoVinculos } = useVinculosChofer(chofer.id);
  const { data: rutasResp } = useRutas();
  const [vinculosProcesados, setVinculosProcesados] = useState<typeof vinculosResp>(undefined);
  const [empresasSeleccionadas, setEmpresasSeleccionadas] = useState<Set<string>>(new Set());
  const [rutasSeleccionadas, setRutasSeleccionadas] = useState<Set<string>>(new Set());
  const [vinculosIniciales, setVinculosIniciales] = useState<{
    empresas: Set<string>;
    rutas: Set<string>;
  } | null>(null);

  if (vinculosResp && vinculosResp !== vinculosProcesados) {
    const empresasIds = new Set(vinculosResp.empresas.map((e) => e.empresaId));
    const rutasIds = new Set(vinculosResp.rutas.map((r) => r.rutaId));
    setVinculosProcesados(vinculosResp);
    setVinculosIniciales({ empresas: empresasIds, rutas: rutasIds });
    setEmpresasSeleccionadas(empresasIds);
    setRutasSeleccionadas(rutasIds);
  }

  function alternarEmpresa(empresaId: string, marcar: boolean) {
    setEmpresasSeleccionadas((prev) => {
      const siguiente = new Set(prev);
      if (marcar) siguiente.add(empresaId);
      else siguiente.delete(empresaId);
      return siguiente;
    });
    if (!marcar) {
      // Desmarcar la empresa también desmarca sus rutas en la UI -- quitar chofer_empresas borra
      // chofer_rutas por la cascada del lado del servidor; esto solo mantiene la UI consistente
      // con lo que va a pasar de verdad.
      const rutasDeEstaEmpresa = (rutasResp?.data ?? [])
        .filter((r) => r.empresa_id === empresaId)
        .map((r) => r.id);
      setRutasSeleccionadas((prev) => {
        const siguiente = new Set(prev);
        for (const id of rutasDeEstaEmpresa) siguiente.delete(id);
        return siguiente;
      });
    }
  }

  function alternarRuta(rutaId: string, _empresaId: string, marcar: boolean) {
    setRutasSeleccionadas((prev) => {
      const siguiente = new Set(prev);
      if (marcar) siguiente.add(rutaId);
      else siguiente.delete(rutaId);
      return siguiente;
    });
  }

  /** null si no hay ninguna diferencia contra el snapshot inicial -- D1: la segunda petición
   * (POST /api/choferes/vinculos) solo se manda si esto no es null. */
  function calcularDiferenciasVinculos(): DiferenciasVinculosChoferRequest | null {
    const iniciales = vinculosIniciales;
    if (!iniciales) return null;
    const empresasAgregar = Array.from(empresasSeleccionadas).filter(
      (id) => !iniciales.empresas.has(id)
    );
    const empresasQuitar = Array.from(iniciales.empresas).filter(
      (id) => !empresasSeleccionadas.has(id)
    );
    const rutasAgregar = Array.from(rutasSeleccionadas).filter((id) => !iniciales.rutas.has(id));
    const rutasQuitar = Array.from(iniciales.rutas).filter((id) => !rutasSeleccionadas.has(id));
    if (
      empresasAgregar.length === 0 &&
      empresasQuitar.length === 0 &&
      rutasAgregar.length === 0 &&
      rutasQuitar.length === 0
    ) {
      return null;
    }
    return { empresasAgregar, empresasQuitar, rutasAgregar, rutasQuitar };
  }

  const hayCambiosSinGuardar = camposChoferCambiaron || calcularDiferenciasVinculos() !== null;

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
    setPaisTelefono(valoresIniciales.paisTelefono);
    setNumeroTelefono(valoresIniciales.numeroTelefono);
    if (vinculosIniciales) {
      setEmpresasSeleccionadas(new Set(vinculosIniciales.empresas));
      setRutasSeleccionadas(new Set(vinculosIniciales.rutas));
    }
    setError(null);
    setErrorVinculos(null);
    setConfirmandoDescarte(false);
    setModo("ver");
  }

  const [enviando, setEnviando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [reseteando, setReseteando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // D1: mensaje de error DISTINTO del de arriba -- si falla guardar las asignaciones (después de
  // que el chofer ya se guardó bien, si correspondía), este es el que se muestra; el diálogo
  // queda en modo Editar con las casillas tal como las dejó el admin, para reintentar solo esto
  // (POST /api/choferes/vinculos es idempotente -- reintentar el mismo diff es seguro).
  const [errorVinculos, setErrorVinculos] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [choferGuardado, setChoferGuardado] = useState<ChoferRow | null>(null);
  const [contrasenaTemporal, setContrasenaTemporal] = useState<string | null>(null);
  // Si POST /api/choferes/editar devuelve 409 (DNI de otro chofer), esto guarda el chofer
  // existente para que el mensaje sea legible (quién es, si está activo) en vez de un error de
  // base de datos genérico.
  const [duplicado, setDuplicado] = useState<ChoferDuplicadoResponse | null>(null);

  async function onSubmit() {
    setError(null);
    setErrorVinculos(null);
    setDuplicado(null);

    if (!nombre.trim()) return setError("Falta el nombre.");
    if (!apellidos.trim()) return setError("Faltan los apellidos.");
    if (!dni.trim()) return setError("Falta el DNI.");
    if (!fechaNacimiento) return setError("Falta la fecha de nacimiento.");
    // El FORMATO se exige siempre que haya algo tipeado (spec_telefono_e164_y_pais_desplegable.md)
    // -- un chofer ya cargado sin teléfono se puede seguir guardando sin teléfono, pero si hay
    // algo tipeado tiene que ser válido. Se arma acá, no en el input: el selector de país ya
    // garantiza el "+" + código correctos, el campo numérico ya solo deja tipear dígitos.
    const telefono = numeroTelefono.trim() ? combinarTelefono(paisTelefono, numeroTelefono) : null;
    if (telefono && !TELEFONO_VALIDO_REGEX.test(telefono)) {
      return setError("El teléfono debe tener formato internacional, por ejemplo +34612345678.");
    }

    // D1: dos peticiones secuenciales -- primero el chofer (solo si cambió algo suyo), después
    // las asignaciones (solo si cambió alguna). Si la primera falla, nunca se intenta la segunda.
    if (!camposChoferCambiaron) {
      await guardarVinculosSiCorresponde();
      return;
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
      setChoferGuardado(actualizado);
      onGuardado(actualizado);
      await guardarVinculosSiCorresponde();
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
    }
  }

  /** D1: segunda petición, solo si cambió alguna asignación. Si falla DESPUÉS de que el chofer ya
   * se guardó bien, muestra su propio error (errorVinculos, distinto del de arriba) y deja las
   * casillas tal como estaban -- reintentar es seguro (POST /api/choferes/vinculos es idempotente,
   * D2). Nunca marca `guardado` en ese caso: el diálogo se queda en modo Editar. */
  async function guardarVinculosSiCorresponde() {
    const diferencias = calcularDiferenciasVinculos();
    if (!diferencias) {
      setGuardado(true);
      return;
    }
    setEnviando(true);
    try {
      const respuesta = await fetch("/api/choferes/vinculos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choferId: chofer.id, ...diferencias }),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setErrorVinculos(mensajeDeError(cuerpo, "No pudimos guardar las empresas y rutas."));
        return;
      }
      setVinculosIniciales({
        empresas: new Set(empresasSeleccionadas),
        rutas: new Set(rutasSeleccionadas),
      });
      queryClient.invalidateQueries({ queryKey: ["vinculos-chofer", chofer.id] });
      setGuardado(true);
    } catch {
      setErrorVinculos("No se pudieron guardar las empresas y rutas (sin conexión).");
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
      // spec_dashboard_choferes_limpieza.md, criterio 8: la fila "Número de empleado" se quitó
      // de esta vista para todos los choferes (no solo para los de invitación) -- el
      // `chofer.numero_empleado &&` de más abajo, en "Resetear contraseña", es un gate distinto y
      // no se toca (criterio 10).
      { etiqueta: "Nombre", valor: chofer.nombre },
      { etiqueta: "Apellidos", valor: chofer.apellidos },
      { etiqueta: "DNI", valor: chofer.dni, mono: true },
      { etiqueta: "Fecha de nacimiento", valor: formatFecha(chofer.fecha_nacimiento), mono: true },
      { etiqueta: "Teléfono", valor: chofer.telefono ?? "—", mono: true },
      { etiqueta: "Correo electrónico", valor: correoChofer },
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

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Empresas y rutas</p>
            <EmpresasRutasChofer
              modo="ver"
              vinculosActuales={vinculosResp ?? null}
              cargandoVinculos={cargandoVinculos}
              empresasSeleccionadas={empresasSeleccionadas}
              rutasSeleccionadas={rutasSeleccionadas}
              onAlternarEmpresa={alternarEmpresa}
              onAlternarRuta={alternarRuta}
            />
          </div>

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
        {/* numero_empleado no se edita nunca -- la fila de solo lectura se quitó (criterio 8); el
            `chofer.numero_empleado &&` de "Resetear contraseña" más abajo no se toca (criterio
            10). */}
        <CamposChofer
          idPrefix="chf"
          disabled={deshabilitarCampos}
          opcional={{ telefono: true }}
          nombre={nombre}
          onCambiarNombre={setNombre}
          apellidos={apellidos}
          onCambiarApellidos={setApellidos}
          dni={dni}
          onCambiarDni={setDni}
          fechaNacimiento={fechaNacimiento}
          onCambiarFechaNacimiento={setFechaNacimiento}
          paisTelefono={paisTelefono}
          onCambiarPaisTelefono={setPaisTelefono}
          numeroTelefono={numeroTelefono}
          onCambiarNumeroTelefono={setNumeroTelefono}
          correo={{ modo: "solo-lectura", valor: correoChofer }}
        />

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Empresas y rutas</p>
          <EmpresasRutasChofer
            modo={deshabilitarCampos ? "ver" : "editar"}
            vinculosActuales={vinculosResp ?? null}
            cargandoVinculos={cargandoVinculos}
            empresasSeleccionadas={empresasSeleccionadas}
            rutasSeleccionadas={rutasSeleccionadas}
            onAlternarEmpresa={alternarEmpresa}
            onAlternarRuta={alternarRuta}
            disabled={deshabilitarCampos}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {errorVinculos && (
          <p role="alert" className="text-sm text-danger">
            {errorVinculos}
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
