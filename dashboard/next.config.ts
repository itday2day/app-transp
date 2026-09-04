import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El repo tiene otro package-lock.json en la carpeta padre (server/mock es
  // hermano de este proyecto); esto fija explícitamente la raíz del
  // workspace en dashboard/ para que Turbopack no la infiera mal.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
