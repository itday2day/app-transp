// Ejemplo de referencia para el backend (Node.js + Express + bcrypt + JWT).
// No forma parte del build de Expo: ilustra cómo debe manejarse la
// autenticación en el servidor para cumplir "nunca contraseñas en texto plano".
//
// Dependencias sugeridas: express, bcrypt, jsonwebtoken, zod (validación), pg.

import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db/pool"; // pool de conexión a PostgreSQL

const router = Router();

const RONDAS_BCRYPT = 12;
const JWT_SECRETO = process.env.JWT_SECRETO as string; // exigido por env, nunca hardcodeado
const JWT_EXPIRACION = "12h";

const esquemaLogin = z.object({
  numeroEmpleado: z.string().min(1),
  contrasena: z.string().min(6),
});

router.post("/auth/login", async (req, res) => {
  const datos = esquemaLogin.safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({ mensaje: "Datos de acceso inválidos." });
  }

  const { numeroEmpleado, contrasena } = datos.data;

  const resultado = await pool.query(
    `SELECT id, nombre, contrasena_hash, activo FROM choferes WHERE numero_empleado = $1`,
    [numeroEmpleado]
  );
  const chofer = resultado.rows[0];

  // Mismo mensaje de error tanto si el usuario no existe como si la
  // contraseña es incorrecta, para no filtrar qué números de empleado son válidos.
  if (!chofer || !chofer.activo) {
    return res.status(401).json({ mensaje: "Número de empleado o contraseña incorrectos." });
  }

  const coincide = await bcrypt.compare(contrasena, chofer.contrasena_hash);
  if (!coincide) {
    return res.status(401).json({ mensaje: "Número de empleado o contraseña incorrectos." });
  }

  const token = jwt.sign({ sub: chofer.id }, JWT_SECRETO, { expiresIn: JWT_EXPIRACION });

  return res.json({
    token,
    usuario: { id: chofer.id, nombre: chofer.nombre, numeroEmpleado },
  });
});

const esquemaRegistro = z.object({
  numeroEmpleado: z.string().min(1),
  contrasena: z.string().min(6),
  nombreCompleto: z.string().min(1),
  paisNacimiento: z.string().min(1),
  fechaNacimiento: z.string().min(1),
  licenciaConducir: z.string().min(1),
  sexo: z.enum(["Masculino", "Femenino", "Otro"]),
});

// Alta de un chofer (auto-registro desde la pantalla "Crear cuenta"):
// nunca se guarda contrasena en texto plano, siempre bcrypt.hash(contrasena, RONDAS_BCRYPT)
router.post("/auth/registro", async (req, res) => {
  const datos = esquemaRegistro.safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({ mensaje: "Datos de registro inválidos." });
  }

  const { numeroEmpleado, contrasena, nombreCompleto, paisNacimiento, fechaNacimiento, licenciaConducir, sexo } =
    datos.data;

  const existente = await pool.query(`SELECT id FROM choferes WHERE numero_empleado = $1`, [numeroEmpleado]);
  if (existente.rows.length > 0) {
    return res.status(409).json({ mensaje: "Ese número de empleado ya tiene una cuenta registrada." });
  }

  const hash = await bcrypt.hash(contrasena, RONDAS_BCRYPT);
  await pool.query(
    `INSERT INTO choferes (numero_empleado, nombre, contrasena_hash, pais_nacimiento, fecha_nacimiento, licencia_conducir, sexo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [numeroEmpleado, nombreCompleto, hash, paisNacimiento, fechaNacimiento, licenciaConducir, sexo]
  );

  return res.status(201).json({ mensaje: "Cuenta creada correctamente." });
});

export default router;
