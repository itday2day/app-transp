// La app ya no habla con server/mock (auth, jornadas y tracking usan
// Supabase directo, ver src/lib/supabase.ts; la exportación de reportes es
// ahora exclusiva del Dashboard web). Este archivo sobrevive solo por
// ErrorApi, que sigue usando authService.ts para distinguir credenciales
// inválidas (401) de un número de empleado duplicado (409).
export class ErrorApi extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
