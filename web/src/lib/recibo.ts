import { Ingreso, Reserva, CASA_LABELS } from './types'

function fmtARS(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtUSD(n: number): string {
  return `USD ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function nombreArchivo(reserva: Reserva): string {
  const sanitizado = `Recibo ${reserva.nombre_pax} ${reserva.id}`.replace(/[\\/:*?"<>|]/g, '')
  return `${sanitizado}.jpg`
}

function cargarLogo(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = '/logo-temporalias.png'
  })
}

/** Dibuja el comprobante de un pago en un canvas angosto, estilo pantalla de teléfono */
function dibujarRecibo(pago: Ingreso, reserva: Reserva, logo: HTMLImageElement): HTMLCanvasElement {
  const scale = 2
  const W = 420
  const H = 700
  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo generar el comprobante.')
  ctx.scale(scale, scale)

  const slate900 = '#1e293b'
  const slate500 = '#64748b'
  const slate300 = '#cbd5e1'
  const slate100 = '#f1f5f9'
  const slate200 = '#e2e8f0'
  const midX = W / 2

  // Fondo y marco general
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = slate200
  ctx.strokeRect(12.5, 12.5, W - 25, H - 25)

  // Logo centrado, como el header de una app de pagos
  const logoSize = 72
  const logoW = logo.width >= logo.height ? logoSize : (logoSize * logo.width) / logo.height
  const logoH = logo.width >= logo.height ? (logoSize * logo.height) / logo.width : logoSize
  ctx.drawImage(logo, midX - logoW / 2, 40 + (logoSize - logoH) / 2, logoW, logoH)

  // Encabezado centrado
  ctx.textAlign = 'center'
  ctx.fillStyle = slate900
  ctx.font = 'bold 26px Arial'
  ctx.fillText('Temporalias', midX, 148)
  ctx.font = '16px Arial'
  ctx.fillStyle = slate500
  ctx.fillText('Comprobante de pago', midX, 171)

  ctx.font = '14px Arial'
  ctx.fillStyle = slate500
  ctx.fillText(`Fecha de emisión: ${pago.fecha}`, midX, 195)
  ctx.font = 'bold 14px Arial'
  ctx.fillStyle = slate900
  ctx.fillText(`N° de operación: ${pago.id}`, midX, 214)

  // Línea divisoria bajo el encabezado
  const marginX = 32
  ctx.strokeStyle = slate200
  ctx.beginPath()
  ctx.moveTo(marginX, 236)
  ctx.lineTo(W - marginX, 236)
  ctx.stroke()

  const num = reserva.casa.replace(/\D/g, '')
  const rows: [string, string][] = [
    ['Titular', reserva.nombre_pax],
    ['N° de reserva', `#${reserva.id}`],
    ['Casa', CASA_LABELS[num] ?? reserva.casa],
    ['Check-in', reserva.fecha_entrada],
    ['Check-out', reserva.fecha_salida],
    ['Pago en ARS', fmtARS(pago.monto_ars ?? 0)],
    ['Pago en USD', fmtUSD(pago.monto_usd ?? 0)],
    ['Cotización', pago.cotizacion ? pago.cotizacion.toLocaleString('es-AR') : '—'],
    ['Saldo restante', fmtUSD(reserva.saldo_usd)],
  ]

  // Label (izquierda) y valor (derecha) van en la misma línea, alineados entre sí
  const labelX = marginX
  const valueX = W - marginX
  const rowHeight = 42
  let y = 276

  for (const [label, value] of rows) {
    ctx.textAlign = 'left'
    ctx.font = '18px Arial'
    ctx.fillStyle = slate500
    ctx.fillText(label, labelX, y)

    ctx.textAlign = 'right'
    ctx.font = 'bold 21px Arial'
    ctx.fillStyle = slate900
    ctx.fillText(value, valueX, y)

    ctx.strokeStyle = slate100
    ctx.beginPath()
    ctx.moveTo(labelX, y + 16)
    ctx.lineTo(valueX, y + 16)
    ctx.stroke()

    y += rowHeight
  }

  // Pie
  ctx.font = '12px Arial'
  ctx.fillStyle = slate300
  ctx.textAlign = 'center'
  ctx.fillText('Comprobante generado automáticamente', midX, H - 50)
  ctx.fillText('sin valor fiscal', midX, H - 33)

  return canvas
}

/** Genera el comprobante como imagen (para previsualizar en un modal) */
export async function generarReciboImagen(pago: Ingreso, reserva: Reserva): Promise<{ dataUrl: string; filename: string }> {
  const logo = await cargarLogo()
  const canvas = dibujarRecibo(pago, reserva, logo)
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), filename: nombreArchivo(reserva) }
}

/** Descarga una imagen de recibo ya generada */
export function descargarRecibo(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

/** true si el navegador soporta compartir archivos vía el share sheet del sistema */
export function puedeCompartirArchivos(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.share
}

/** true si se abrió desde un teléfono (no tiene sentido "compartir por WhatsApp" desde una compu) */
export function esDispositivoMobil(): boolean {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

/** Abre el share sheet del sistema (WhatsApp suele ser una de las opciones) con el JPG del recibo */
export async function compartirRecibo(dataUrl: string, filename: string): Promise<boolean> {
  if (!puedeCompartirArchivos()) return false
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const file = new File([blob], filename, { type: 'image/jpeg' })
  if (navigator.canShare && !navigator.canShare({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], title: 'Comprobante de pago' })
    return true
  } catch {
    return false
  }
}
