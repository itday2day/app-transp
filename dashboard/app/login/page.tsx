"use client";

import { Lock, Mail } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const respuesta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as { mensaje?: string } | null;
        setError(cuerpo?.mensaje ?? "No se pudo iniciar sesión.");
        return;
      }

      router.push("/mapa");
      router.refresh();
    } catch {
      setError("No se pudo contactar al servidor. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(320px,38%)_1fr]">
      {/* Panel de marca — spec_identidad_visual_day2day.md, maqueta DashboardLogin del canvas.
          Oculto en móvil (lg:flex): a ese ancho no entran las dos columnas, y el formulario es lo
          único imprescindible para poder iniciar sesión. */}
      {/* bg-[#000000] literal, no bg-ink: este panel es "chrome" de marca, siempre oscuro con
          logo blanco — a diferencia de --ink (que se invierte con el tema claro/oscuro del
          Dashboard), el panel no debe volverse blanco cuando el usuario pasa a tema oscuro. */}
      <div className="hidden flex-col justify-end bg-[#000000] p-12 text-white lg:flex xl:p-16">
        <Image
          src="/logo-blanco.png"
          alt="Day2Day Solutions"
          width={280}
          height={72}
          className="h-auto w-full max-w-[280px]"
          priority
        />
        <p className="mt-4 text-sm italic text-white/70">Smart logistics — Panel administrativo</p>
      </div>

      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-lg bg-card p-8 text-card-foreground shadow-md">
          <h1 className="text-lg font-semibold">Ingresar</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">
            Accedé con tu cuenta de administrador.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="email">Correo</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoFocus
                  required
                  className="pl-9"
                  placeholder="admin@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  required
                  className="pl-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" loading={cargando} className="w-full">
              Entrar
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Day2Day Solutions — uso interno
          </p>
        </div>
      </div>
    </div>
  );
}
