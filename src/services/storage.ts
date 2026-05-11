import { google } from "googleapis";
import { Readable } from "stream";
import { config } from "../config";

function getDriveClient() {
  const auth = new google.auth.JWT({
    email: config.googleClientEmail,
    key: config.googlePrivateKey,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
  return google.drive({ version: "v3", auth });
}

async function obtenerOCrearCarpeta(
  drive: ReturnType<typeof getDriveClient>,
  nombre: string,
  parentId?: string
): Promise<string> {
  const q = parentId
    ? `name='${nombre}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({ q, fields: "files(id)" });
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id!;

  const carpeta = await drive.files.create({
    requestBody: {
      name: nombre,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : [],
    },
    fields: "id",
  });
  return carpeta.data.id!;
}

export async function subirComprobante(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
  nombreArchivo: string
): Promise<string> {
  const drive = getDriveClient();

  const ahora = new Date();
  const mesAnio = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;

  const carpetaRaizId = await obtenerOCrearCarpeta(drive, "Comprobantes");
  const carpetaMesId = await obtenerOCrearCarpeta(drive, mesAnio, carpetaRaizId);

  const extension = mediaType === "application/pdf" ? "pdf" : mediaType.split("/")[1];
  const nombre = `${nombreArchivo}.${extension}`;

  const archivo = await drive.files.create({
    requestBody: { name: nombre, parents: [carpetaMesId] },
    media: { mimeType: mediaType, body: Readable.from(Buffer.from(base64, "base64")) },
    fields: "id",
  });

  await drive.permissions.create({
    fileId: archivo.data.id!,
    requestBody: { role: "reader", type: "anyone" },
  });

  return `https://drive.google.com/file/d/${archivo.data.id}/view`;
}
