-- Migración incremental: correr DESPUÉS de schema.sql + v2 a v13, en el SQL Editor. Resuelve
-- spec_normalizacion_dni_matricula_telefono.md: DNI único de 9 caracteres, matrícula de 7
-- caracteres en todo el sistema, y teléfono del chofer.

-- ============================================================
-- TELÉFONO DEL CHOFER
-- ============================================================
-- Nullable a nivel de base -- no se le puede exigir retroactivo a los choferes ya cargados. El
-- Dashboard es el que exige completarlo en el alta de un chofer nuevo (ver chofer-dialog.tsx).
alter table public.choferes
  add column if not exists telefono text;

-- ============================================================
-- DNI — UNIQUE (aplicado ahora: 0 duplicados confirmados contra la base real)
-- ============================================================
-- Igual que numero_empleado: unicidad simple sobre la columna, no un índice de expresión como el
-- de matrícula -- desde ahora el Dashboard siempre guarda el DNI ya normalizado (mayúsculas, sin
-- espacios ni guiones -- ver normalizarDni() en dashboard/lib/choferes.ts), así que la columna
-- misma es la forma normalizada.
alter table public.choferes
  add constraint choferes_dni_unique unique (dni);

-- ============================================================
-- DNI — CHECK de longitud = 9 (⚠️ PENDIENTE, NO ejecutado en esta migración)
-- ============================================================
-- Confirmado contra la base real (spec, Fase 1 punto 4): hay 2 choferes con DNI fuera de 9
-- caracteres hoy (numero_empleado 02, DNI de 8 caracteres; numero_empleado 05, DNI de 7
-- caracteres) -- ambos perfiles de prueba. La spec pide corregirlos a mano desde /choferes
-- (formulario de edición) ANTES de aplicar este CHECK, y no aplicarlo hasta confirmar 0 filas
-- fuera de formato. Correr esto recién después de esa corrección:
--
--   select id, numero_empleado, dni from public.choferes where length(dni) <> 9;
--   -- tiene que devolver 0 filas antes de la siguiente línea
--
-- alter table public.choferes
--   add constraint choferes_dni_longitud check (length(dni) = 9);

-- ============================================================
-- MATRÍCULA — CHECK de longitud = 7, en vehiculos y jornadas
-- ============================================================
-- NOT VALID: no escanea ni exige que las filas YA existentes cumplan al crear el constraint (la
-- spec decidió dejar como están el vehículo QPOI12 -- 6 caracteres -- y la jornada con matrícula
-- HBJN -- 4 caracteres -- sin corregirlos a mano). Rige para todo INSERT nuevo y para cualquier
-- UPDATE de una fila existente (Postgres revalida la fila completa en cada UPDATE, no solo la
-- columna tocada -- si alguna vez hay que editar otro campo de esas 2 filas puntuales, hace falta
-- corregir la matrícula en ese mismo guardado; decisión confirmada con el usuario).
alter table public.vehiculos
  add constraint vehiculos_matricula_longitud check (length(matricula) = 7) not valid;

alter table public.jornadas
  add constraint jornadas_matricula_longitud check (length(matricula) = 7) not valid;
