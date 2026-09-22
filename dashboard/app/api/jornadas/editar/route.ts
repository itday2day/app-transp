import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import type { CamposEditablesJornada, JornadaRow, TipoIncidencia } from "@/lib/types";

// POST /api/jornadas/editar
// Body: multipart/form-data — { id, motivoEdicion, empresa?, matricula?,
//   ruta?, kmInicial?, kmFinal?, combustibleInicial?, combustibleFinal?,
//   fechaCheckOut?, latFinal?, lngFinal?, tuvoIncidencia?, tipoIncidencia?,
//   detalleIncidencia?, fotoTacometroFinal?(archivo), fotosIncidencia?(0+
//   archivos, mismo nombre de campo repetido) }
//
// ⚠️ **Corrección (2026-09-15)**: antes solo aceptaba JSON y corregía
// empresa/matrícula/ruta/km/combustible. Encontrado en el piloto (Hallazgo
// #6: la jornada huérfana de Pau, que quedó "abierta" sin check-out tras
// reinstalar el .apk) que no había forma de **cerrar** una jornada desde acá
// — `estado` es una columna independiente de `fecha_check_out`, no se derivaba
// sola. Hubo que cerrarla con un UPDATE manual en el SQL Editor, sin quedar
// auditado. Ahora "Corregir" también puede completar `fecha_check_out` (con
// lat/lng final opcionales), lo que cierra la jornada automáticamente si
// estaba abierta, y cargar foto de tacómetro final + incidencia con fotos de
// respaldo — los mismos datos que un check-out normal desde la app, todos
// opcionales. Por eso el body pasa de JSON a `multipart/form-data`: hace
// falta poder mandar archivos.
//
// La autenticación de administrador ya la exige `proxy.ts` (middleware) para
// todo /api/* salvo /api/auth/* — igual que el resto de los Route Handlers
// de este Dashboard (ver reportes/exportar, tracking/ultimas-posiciones), no
// se repite ese chequeo acá. Lo que sí se lee acá es la identidad del admin
// ya autenticado (`editado_por` se deriva de la sesión, ver lib/auth.ts).

const BUCKET_EVIDENCIAS = "evidencias";
// Mismos tipos y misma convención de nombres/carpetas que ya usa la app
// móvil (`src/services/storageService.ts` + `syncService.ts`, confirmado
// contra el código real antes de escribir esto, no asumido):
// `{choferId}/{jornadaId}-final.jpg` para el tacómetro final,
// `{choferId}/{jornadaId}-incidencia-{indice}.jpg` para las fotos de
// incidencia — el Dashboard tiene que subir a las mismas rutas para que
// ambos frontends sean consistentes y no queden archivos huérfanos con dos
// esquemas de nombres distintos. La app móvil fija `contentType: "image/jpeg"`
// a ciegas (sin mirar el archivo real); acá se usa el tipo real del archivo
// subido, más preciso, pero se mantiene la extensión `.jpg` en la ruta para
// no romper esa convención compartida.
const TIPOS_MIME_PERMITIDOS = ["image/jpeg", "image/png"];
// La app móvil comprime con expo-image-manipulator antes de subir
// (src/services/imageService.ts: resize a 1280px + calidad 0.6), así que sus
// fotos terminan livianas. Una foto sacada por el admin desde su compu/celu
// puede venir sin comprimir — no se agrega compresión del lado del Dashboard
// (no es un requisito duro de esta spec), alcanza con un límite de tamaño
// simple del lado del servidor.
const TAMANO_MAXIMO_BYTES = 8 * 1024 * 1024;

interface CuerpoPeticion {
  id?: string;
  motivoEdicion?: string;
  empresa?: string;
  matricula?: string;
  ruta?: string;
  kmInicial?: number;
  kmFinal?: number;
  combustibleInicial?: number;
  combustibleFinal?: number;
  fechaCheckOut?: string;
  latFinal?: number;
  lngFinal?: number;
  tuvoIncidenciaPresente: boolean;
  tuvoIncidencia: boolean;
  tipoIncidencia?: TipoIncidencia;
  detalleIncidencia?: string;
  fotoTacometroFinal?: File;
  fotosIncidenciaNuevas: File[];
}

function stringNoVacio(valor: FormDataEntryValue | null): string | undefined {
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

function numeroValido(valor: FormDataEntryValue | null): number | undefined {
  if (typeof valor !== "string" || valor.trim() === "") return undefined;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : undefined;
}

function archivoValido(valor: FormDataEntryValue | null): File | undefined {
  return valor instanceof File && valor.size > 0 ? valor : undefined;
}

function parsearCuerpo(form: FormData): CuerpoPeticion {
  return {
    id: stringNoVacio(form.get("id")),
    motivoEdicion: stringNoVacio(form.get("motivoEdicion")),
    empresa: stringNoVacio(form.get("empresa")),
    matricula: stringNoVacio(form.get("matricula")),
    ruta: stringNoVacio(form.get("ruta")),
    kmInicial: numeroValido(form.get("kmInicial")),
    kmFinal: numeroValido(form.get("kmFinal")),
    combustibleInicial: numeroValido(form.get("combustibleInicial")),
    combustibleFinal: numeroValido(form.get("combustibleFinal")),
    fechaCheckOut: stringNoVacio(form.get("fechaCheckOut")),
    latFinal: numeroValido(form.get("latFinal")),
    lngFinal: numeroValido(form.get("lngFinal")),
    tuvoIncidenciaPresente: form.has("tuvoIncidencia"),
    tuvoIncidencia: form.get("tuvoIncidencia") === "true",
    tipoIncidencia: stringNoVacio(form.get("tipoIncidencia")) as TipoIncidencia | undefined,
    detalleIncidencia: stringNoVacio(form.get("detalleIncidencia")),
    fotoTacometroFinal: archivoValido(form.get("fotoTacometroFinal")),
    fotosIncidenciaNuevas: form
      .getAll("fotosIncidencia")
      .filter((valor): valor is File => valor instanceof File && valor.size > 0),
  };
}

/** Igual criterio que valida IncidenciasForm.tsx en la app móvil (confirmado
 * contra el código real): el detalle es obligatorio solo cuando el tipo es
 * "Otro" — el tipo en sí NUNCA es obligatorio, aunque tuvoIncidencia sea
 * true (un chofer puede marcar "sí hubo incidencia" sin elegir tipo). */
function validarIncidencia(cuerpo: CuerpoPeticion): string | null {
  if (!cuerpo.tuvoIncidencia) return null;
  if (cuerpo.tipoIncidencia === "Otro" && !cuerpo.detalleIncidencia) {
    return 'El detalle es obligatorio cuando el tipo de incidencia es "Otro".';
  }
  return null;
}

function validarImagen(archivo: File): string | null {
  if (!TIPOS_MIME_PERMITIDOS.includes(archivo.type)) {
    return `Formato de imagen no soportado (${archivo.type || "desconocido"}). Usá JPEG o PNG.`;
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return "La imagen supera el tamaño máximo permitido (8MB).";
  }
  return null;
}

async function subirEvidencia(
  supabase: ReturnType<typeof crearClienteSupabaseAdmin>,
  ruta: string,
  archivo: File
): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET_EVIDENCIAS).upload(ruta, archivo, {
    contentType: archivo.type,
    upsert: true,
  });
  if (error) {
    throw new Error(`No se pudo subir la imagen (${ruta}): ${error.message}`);
  }
  const { data } = supabase.storage.from(BUCKET_EVIDENCIAS).getPublicUrl(ruta);
  return data.publicUrl;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }
  const editadoPor = sesion.nombre || sesion.email;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const cuerpo = parsearCuerpo(form);

  if (!cuerpo.id) {
    return NextResponse.json({ mensaje: "Falta el id de la jornada." }, { status: 400 });
  }
  if (!cuerpo.motivoEdicion) {
    return NextResponse.json(
      { mensaje: "El motivo de la corrección es obligatorio." },
      { status: 400 }
    );
  }
  if (cuerpo.fechaCheckOut && Number.isNaN(Date.parse(cuerpo.fechaCheckOut))) {
    return NextResponse.json(
      { mensaje: "La hora de check-out no es una fecha válida." },
      { status: 400 }
    );
  }

  const errorIncidencia = validarIncidencia(cuerpo);
  if (errorIncidencia) {
    return NextResponse.json({ mensaje: errorIncidencia }, { status: 400 });
  }

  const imagenesAValidar = [
    ...(cuerpo.fotoTacometroFinal ? [cuerpo.fotoTacometroFinal] : []),
    ...cuerpo.fotosIncidenciaNuevas,
  ];
  for (const archivo of imagenesAValidar) {
    const errorImagen = validarImagen(archivo);
    if (errorImagen) {
      return NextResponse.json({ mensaje: errorImagen }, { status: 400 });
    }
  }

  const supabase = crearClienteSupabaseAdmin();

  // Se necesita la fila actual antes de actualizar: chofer_id (arma la ruta
  // de Storage), fecha_check_in (valida el check-out), estado (decide si
  // corresponde cerrar), fotos_incidencia (append sin pisar lo que ya subió
  // el chofer) y foto_tacometro_final_url (ver más abajo — defensa en
  // profundidad, no reemplazable si ya existe).
  const { data: actual, error: errorLectura } = await supabase
    .from("jornadas")
    .select("chofer_id, estado, fecha_check_in, fotos_incidencia, foto_tacometro_final_url")
    .eq("id", cuerpo.id)
    .single();

  if (errorLectura || !actual) {
    return NextResponse.json({ mensaje: "No se encontró la jornada." }, { status: 404 });
  }

  if (cuerpo.fechaCheckOut && new Date(cuerpo.fechaCheckOut) < new Date(actual.fecha_check_in)) {
    return NextResponse.json(
      { mensaje: "La hora de check-out no puede ser anterior a la de check-in." },
      { status: 400 }
    );
  }

  let fotoTacometroFinalUrl: string | undefined;
  let fotosIncidenciaActualizadas: string[] | undefined;
  try {
    // ⚠️ **Corrección (2026-09-15)**: la spec original decía "cargar una
    // foto nueva reemplaza la anterior si ya había una" — se cambió a "no
    // reemplazable": si `foto_tacometro_final_url` ya tiene valor (lo haya
    // cargado el chofer desde la app, o un admin en una corrección previa),
    // un archivo nuevo entrante para este campo se ignora en silencio, sin
    // romper el resto de la corrección. La UI ya deshabilita el input
    // cuando corresponde (ver editar-jornada-dialog.tsx); esto es defensa
    // en profundidad del lado del servidor, no solo una restricción visual.
    if (cuerpo.fotoTacometroFinal && !actual.foto_tacometro_final_url) {
      fotoTacometroFinalUrl = await subirEvidencia(
        supabase,
        `${actual.chofer_id}/${cuerpo.id}-final.jpg`,
        cuerpo.fotoTacometroFinal
      );
    }
    if (cuerpo.fotosIncidenciaNuevas.length > 0) {
      const existentes = actual.fotos_incidencia ?? [];
      const nuevasUrls = await Promise.all(
        cuerpo.fotosIncidenciaNuevas.map((archivo, indice) =>
          subirEvidencia(
            supabase,
            `${actual.chofer_id}/${cuerpo.id}-incidencia-${existentes.length + indice}.jpg`,
            archivo
          )
        )
      );
      fotosIncidenciaActualizadas = [...existentes, ...nuevasUrls];
    }
  } catch (err) {
    return NextResponse.json(
      {
        mensaje: "No se pudieron subir las imágenes.",
        detalle: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  const actualizacion: TablesUpdate<"jornadas"> = {
    fue_editado: true,
    editado_por: editadoPor,
    editado_en: new Date().toISOString(),
    motivo_edicion: cuerpo.motivoEdicion,
  };
  const campos: CamposEditablesJornada = {
    empresa: cuerpo.empresa,
    matricula: cuerpo.matricula,
    ruta: cuerpo.ruta,
    kmInicial: cuerpo.kmInicial,
    kmFinal: cuerpo.kmFinal,
    combustibleInicial: cuerpo.combustibleInicial,
    combustibleFinal: cuerpo.combustibleFinal,
  };
  if (campos.empresa !== undefined) actualizacion.empresa = campos.empresa;
  if (campos.matricula !== undefined) actualizacion.matricula = campos.matricula;
  if (campos.ruta !== undefined) actualizacion.ruta = campos.ruta;
  if (campos.kmInicial !== undefined) actualizacion.km_inicial = campos.kmInicial;
  if (campos.kmFinal !== undefined) actualizacion.km_final = campos.kmFinal;
  if (campos.combustibleInicial !== undefined)
    actualizacion.combustible_inicial = campos.combustibleInicial;
  if (campos.combustibleFinal !== undefined)
    actualizacion.combustible_final = campos.combustibleFinal;

  // Transición de estado automática, en un solo sentido: completar
  // fecha_check_out cierra una jornada abierta. No hay forma de reabrir
  // (borrar fecha_check_out) desde acá — a propósito, fuera de alcance.
  if (cuerpo.fechaCheckOut) {
    actualizacion.fecha_check_out = new Date(cuerpo.fechaCheckOut).toISOString();
    if (actual.estado === "abierta") actualizacion.estado = "cerrada";
  }
  if (cuerpo.latFinal !== undefined) actualizacion.lat_final = cuerpo.latFinal;
  if (cuerpo.lngFinal !== undefined) actualizacion.lng_final = cuerpo.lngFinal;
  if (fotoTacometroFinalUrl) actualizacion.foto_tacometro_final_url = fotoTacometroFinalUrl;
  if (fotosIncidenciaActualizadas) actualizacion.fotos_incidencia = fotosIncidenciaActualizadas;
  if (cuerpo.tuvoIncidenciaPresente) {
    actualizacion.tuvo_incidencia = cuerpo.tuvoIncidencia;
    actualizacion.tipo_incidencia = cuerpo.tuvoIncidencia ? (cuerpo.tipoIncidencia ?? null) : null;
    actualizacion.detalle_incidencia = cuerpo.tuvoIncidencia
      ? (cuerpo.detalleIncidencia ?? "")
      : "";
  }

  const { data, error } = await supabase
    .from("jornadas")
    .update(actualizacion)
    .eq("id", cuerpo.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo guardar la corrección.", detalle: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    mensaje: "Jornada corregida correctamente.",
    jornada: data as JornadaRow,
  });
}
