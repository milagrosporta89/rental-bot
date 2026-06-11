import { extraerDatosComprobante } from "./claude";
import { buscarIngresoDuplicado, buscarGastoDuplicado } from "./sheets";
import { subirComprobante } from "./storage";
import { downloadMedia } from "./whatsapp";
import { DatosComprobante } from "../types";

export type TipoComprobante = "ingreso" | "gasto";

export interface ResultadoComprobante {
  datos: DatosComprobante;
  comprobanteUrl: string;
}

export type ErrorComprobante =
  | { tipo: "descarga_fallida" }
  | { tipo: "ilegible" }
  | { tipo: "duplicado"; detalle: string };

export type ProcesarComprobanteResult =
  | { ok: true } & ResultadoComprobante
  | { ok: false; error: ErrorComprobante };

export async function procesarComprobante(
  mediaId: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
  tipo: TipoComprobante
): Promise<ProcesarComprobanteResult> {
  let base64: string;
  try {
    ({ base64 } = await downloadMedia(mediaId));
  } catch {
    return { ok: false, error: { tipo: "descarga_fallida" } };
  }

  const datos = await extraerDatosComprobante(base64, mimeType).catch(() => null);

  if (!datos || datos.monto === 0) {
    return { ok: false, error: { tipo: "ilegible" } };
  }

  if (datos.nroOperacion) {
    const duplicado =
      tipo === "ingreso"
        ? await buscarIngresoDuplicado(datos.nroOperacion)
        : await buscarGastoDuplicado(datos.nroOperacion);

    if (duplicado) {
      const lineas =
        tipo === "ingreso"
          ? `Fecha: ${"fecha" in duplicado ? duplicado.fecha : "-"}\nCasa: ${"casa" in duplicado ? duplicado.casa : "-"}\nMonto: $${duplicado.monto.toLocaleString("es-AR")}\nPagó: ${"quienPago" in duplicado ? duplicado.quienPago : "-"}`
          : `Fecha: ${"fecha" in duplicado ? duplicado.fecha : "-"}\nCategoría: ${"categoria" in duplicado ? duplicado.categoria : "-"}\nMonto: $${duplicado.monto.toLocaleString("es-AR")}\nPagó: ${"pagadoPor" in duplicado ? duplicado.pagadoPor : "-"}`;
      return {
        ok: false,
        error: {
          tipo: "duplicado",
          detalle: `El número de operación *${datos.nroOperacion}* ya fue registrado:\n\n${lineas}`,
        },
      };
    }
  }

  const fechaStr = (datos.fecha ?? new Date().toLocaleDateString("es-AR")).replace(/\//g, "-");
  const comprobanteUrl = await subirComprobante(
    base64,
    mimeType,
    `${tipo}_${fechaStr}_${datos.nroOperacion || Date.now()}`
  ).catch(() => "");

  return { ok: true, datos, comprobanteUrl };
}
