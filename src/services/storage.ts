import * as fs from "fs/promises";
import * as path from "path";
import { config } from "../config";

export async function subirComprobante(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
  nombreArchivo: string
): Promise<string> {
  if (!config.storageBaseUrl) return "";

  const ahora = new Date();
  const mesAnio = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
  const extension = mediaType === "application/pdf" ? "pdf" : mediaType.split("/")[1];
  const nombreFinal = `${nombreArchivo}.${extension}`;

  const dirPath = path.join(config.storageDir, mesAnio);
  await fs.mkdir(dirPath, { recursive: true });

  const filePath = path.join(dirPath, nombreFinal);
  await fs.writeFile(filePath, Buffer.from(base64, "base64"));

  return `${config.storageBaseUrl}/comprobantes/${mesAnio}/${nombreFinal}`;
}
