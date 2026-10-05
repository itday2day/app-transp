-- Migración incremental: correr DESPUÉS de schema.sql + v2 a v15, en el SQL Editor. Resuelve
-- spec_check_dni_9_caracteres.md: cierra el único pendiente que dejó
-- schema_v14_normalizacion_dni_matricula_telefono.sql — el CHECK de longitud sobre choferes.dni
-- había quedado comentado ahí porque 2 choferes de prueba (02 y 05) tenían DNI fuera de formato.
-- Los dos ya fueron corregidos a mano desde /choferes antes de esta migración.

-- ============================================================
-- DNI — CHECK de longitud = 9
-- ============================================================
-- Validado (sin NOT VALID): a diferencia de las matrículas legado de schema_v14 (QPOI12, HBJN,
-- que la spec de entonces decidió dejar sin corregir), acá las 5 filas reales ya cumplen, así que
-- no hay motivo para dejarlo a medias — un NOT VALID heredaría la misma trampa de revalidación en
-- cada UPDATE que ya está anotada para esas dos filas legado. Confirmado contra la base real antes
-- de aplicar (spec, Fase 1):
--
--   select id, numero_empleado, length(dni) from public.choferes where length(dni) <> 9;
--   -- 0 filas
--
-- Solo el largo, no el formato (8 dígitos + letra): el chofer 02 es un NIE válido (letra + 7
-- dígitos + letra, 9 caracteres) que un CHECK de formato estricto habría rechazado. Validar el
-- dígito de control sigue fuera de alcance, igual que lo dejó schema_v14.
alter table public.choferes
  add constraint choferes_dni_largo check (length(dni) = 9);
