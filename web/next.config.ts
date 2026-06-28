import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Permite probar el dev server desde el teléfono por IP de LAN (si no, Next.js
  // bloquea Server Actions y assets por venir de un origen distinto a localhost).
  allowedDevOrigins: ["192.168.0.101"],
};

export default nextConfig;
