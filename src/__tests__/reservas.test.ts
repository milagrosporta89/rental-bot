import { makeCtx, uid } from './helpers/ctx';
import { onCallback, onText, onPhotoSinContexto, onPhoto, onCorregirCommand } from '../handlers/reservas';

// ── Mocks de servicios externos ────────────────────────────────────────────

jest.mock('../services/reservas', () => ({
  buscarReservasPorNombre: jest.fn(),
  buscarReservaPorId: jest.fn(),
  registrarReserva: jest.fn(),
  registrarSaldoReserva: jest.fn(),
  actualizarCampoReserva: jest.fn(),
  generarIdReserva: jest.fn(),
}));
jest.mock('../services/sheets', () => ({
  registrarIngreso: jest.fn(),
}));
jest.mock('../services/dolar', () => ({
  obtenerCotizacion: jest.fn(),
}));
jest.mock('../services/claude', () => ({
  extraerDatosComprobante: jest.fn(),
}));
jest.mock('../services/whatsapp', () => ({
  downloadMedia: jest.fn(),
}));
jest.mock('../services/storage', () => ({
  subirComprobante: jest.fn(),
}));
jest.mock('../services/comprobantes', () => ({
  procesarComprobante: jest.fn(),
}));
jest.mock('./income', () => ({
  onPhoto: jest.fn(),
}), { virtual: true });
jest.mock('../handlers/income', () => ({
  onPhoto: jest.fn(),
}));

import * as svcReservas from '../services/reservas';
import * as svcSheets from '../services/sheets';
import * as svcDolar from '../services/dolar';
import * as svcClaude from '../services/claude';
import * as svcWhatsapp from '../services/whatsapp';
import * as svcStorage from '../services/storage';
import * as svcComprobantes from '../services/comprobantes';
import * as handlerIncome from '../handlers/income';

const mockRegistrarReserva = svcReservas.registrarReserva as jest.Mock;
const mockRegistrarSaldo = svcReservas.registrarSaldoReserva as jest.Mock;
const mockGenerarId = svcReservas.generarIdReserva as jest.Mock;
const mockRegistrarIngreso = svcSheets.registrarIngreso as jest.Mock;
const mockBuscarPorId = svcReservas.buscarReservaPorId as jest.Mock;
const mockActualizarCampo = svcReservas.actualizarCampoReserva as jest.Mock;
const mockCotizacion = svcDolar.obtenerCotizacion as jest.Mock;
const mockExtraer = svcClaude.extraerDatosComprobante as jest.Mock;
const mockDownload = svcWhatsapp.downloadMedia as jest.Mock;
const mockSubir = svcStorage.subirComprobante as jest.Mock;
const mockProcesarComprobante = svcComprobantes.procesarComprobante as jest.Mock;
const mockOnPhotoIngreso = handlerIncome.onPhoto as jest.Mock;

// ── Fixture de reserva pendiente ───────────────────────────────────────────

function makeReserva(overrides: Partial<{
  id: string; fila: number; saldoUSD: number; montoTotalUSD: number; nombrePax: string; casa: string;
}> = {}) {
  return {
    fila: 3,
    id: '7',
    casa: 'Casa 3',
    titular: 'Milagros',
    nombrePax: 'García María',
    fechaEntrada: '10/06/2026',
    fechaSalida: '15/06/2026',
    montoTotalUSD: 800,
    saldoUSD: 400,
    estadoPago: 'ADELANTO_RECIBIDO',
    ...overrides,
  };
}

// ── Helpers para simular conversaciones ───────────────────────────────────

async function texto(ctx: ReturnType<typeof makeCtx>, t: string) {
  ctx.text = t;
  return onText(ctx);
}

async function boton(ctx: ReturnType<typeof makeCtx>, id: string) {
  ctx.text = undefined;
  return onCallback(ctx, id);
}

// ── Setup ──────────────────────────────────────────────────────────────────

// Resultado de comprobante exitoso por defecto (puede sobreescribirse por test)
const COMPROBANTE_OK_DEFAULT = {
  ok: true as const,
  datos: {
    monto: 300000, moneda: 'ARS', fecha: '10/06/2026',
    nombreOrdenante: 'García María', nombreDestinatario: 'Milagros Porta',
    bancoOrigen: 'Galicia', nroOperacion: 'OP-001',
    bancoDestino: '', cbuDestino: '',
  },
  comprobanteUrl: 'https://storage/comp.jpg',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCotizacion.mockResolvedValue(1350);
  mockGenerarId.mockResolvedValue('10');
  mockRegistrarReserva.mockResolvedValue(undefined);
  mockRegistrarIngreso.mockResolvedValue(undefined);
  mockRegistrarSaldo.mockResolvedValue(undefined);
  mockProcesarComprobante.mockResolvedValue(COMPROBANTE_OK_DEFAULT);
});

// ══════════════════════════════════════════════════════════════════════════
// NUEVA RESERVA
// ══════════════════════════════════════════════════════════════════════════

describe('nueva reserva', () => {
  async function flujoHastaMonto(ctx: ReturnType<typeof makeCtx>) {
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
  }

  it('registra el ingreso en ARS cuando el adelanto es en pesos', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '540000 ARS');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ moneda: 'ARS', monto: 540000 })
    );
  });

  it('registra el ingreso en USD cuando el adelanto es en dólares', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ moneda: 'USD', monto: 300 })
    );
  });

  it('pregunta la moneda si el usuario solo tipea el número', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '540000');

    expect(ctx.lastButtonIds()).toContain('res_moneda_ARS');
    expect(ctx.lastButtonIds()).toContain('res_moneda_USD');
  });

  it('pregunta el medio de pago antes de confirmar', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '300 USD');

    expect(ctx.lastButtonIds()).toContain('res_pago_transferencia');
    expect(ctx.lastButtonIds()).toContain('res_pago_efectivo');
  });

  it('guarda tipo efectivo cuando se elige efectivo', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'efectivo' })
    );
  });

  it('incluye "whatsapp_directo" en el detalle del ingreso', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ detalle: expect.stringContaining('whatsapp_directo') })
    );
  });

  it('pide destinatario al elegir transferencia sin comprobante', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_transferencia');

    // La pregunta va por replyButtons → buttonCalls, no replies
    const lastBtnMsg = ctx.buttonCalls[ctx.buttonCalls.length - 1];
    expect(lastBtnMsg.text).toMatch(/qui[eé]n|transferencia|titular/i);
    expect(ctx.lastButtonIds()).toContain('res_omitir_nro');
  });

  it('guarda nombreDestinatario cuando el usuario lo escribe', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_transferencia');
    await texto(ctx, 'Milagros Porta');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ nombreDestinatario: 'Milagros Porta' })
    );
  });

  it('permite omitir el número de operación', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_omitir_nro');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarIngreso).toHaveBeenCalled();
  });

  it('rechaza fechas inválidas y repregunta', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, 'mañana');

    expect(ctx.lastReply()).toMatch(/formato/i);
    await texto(ctx, '10/06 - 15/06');
    expect(ctx.lastReply()).toMatch(/noches/i);
  });

  it('acepta fechas con guión: 13-5 al 18-5', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '13-5 al 18-5');

    expect(ctx.lastReply()).toMatch(/noches/i);
    expect(ctx.lastReply()).toMatch(/5/); // 5 noches
  });

  it('acepta fechas con guión y separador " - ": 13-5 - 18-5', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '13-5 - 18-5');

    expect(ctx.lastReply()).toMatch(/noches/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SALDO DE RESERVA
// ══════════════════════════════════════════════════════════════════════════

describe('saldo de reserva', () => {
  beforeEach(() => {
  });

  async function flujoHastaMonto(ctx: ReturnType<typeof makeCtx>) {
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1'); // elegir primera de la lista
  }

  it('marca COMPLETO cuando el pago cubre el saldo total', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '400 USD');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_confirmar_saldo');

    expect(mockRegistrarSaldo).toHaveBeenCalledWith(
      expect.anything(),
      'COMPLETO',
      0
    );
    expect(ctx.lastReply()).toMatch(/COMPLETA/i);
  });

  it('marca SALDO_RECIBIDO y muestra restante cuando el pago es parcial', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '100 USD');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_confirmar_saldo');

    expect(mockRegistrarSaldo).toHaveBeenCalledWith(
      expect.anything(),
      'SALDO_RECIBIDO',
      300
    );
    expect(ctx.lastReply()).toMatch(/restante/i);
    expect(ctx.lastReply()).toMatch(/300/);
  });

  it('registra el ingreso en ARS cuando el saldo se paga en pesos', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '540000 ARS');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_confirmar_saldo');

    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ moneda: 'ARS', monto: 540000 })
    );
  });

  it('muestra lista de semana al iniciar flujo saldo', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');

    // El bot envía la lista numerada + instrucción
    expect(ctx.replies.some(r => r.includes('García María'))).toBe(true);
  });

  it('va a búsqueda por nombre si no hay reservas en la semana', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');

    expect(ctx.lastReply()).toMatch(/nombre/i);
  });

  it('trata saldoUSD=0 en planilla como dato incompleto y marca COMPLETO solo si el pago es >= saldo', async () => {
    // Simula que la columna M estaba vacía → parseFloat('') = NaN → 0
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '100 USD');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_confirmar_saldo');

    // Con saldoPrevio=0 cualquier monto cubre el saldo → COMPLETO, restante=0
    expect(mockRegistrarSaldo).toHaveBeenCalledWith(
      expect.anything(),
      'COMPLETO',
      0
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG ROJO 1 — downloadMedia falla no deja al usuario colgado
// ══════════════════════════════════════════════════════════════════════════

describe('procesarFotoEnContexto — error en descarga', () => {
  beforeEach(() => {
    mockProcesarComprobante.mockResolvedValue({ ok: false, error: { tipo: 'descarga_fallida' } });
  });

  it('avisa al usuario y pide monto manual cuando la descarga falla en flujo nueva', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-exp', 'image/jpeg');

    expect(ctx.lastReply()).toMatch(/descargar|manual/i);
  });

  it('el flujo puede continuar manualmente después del error', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-exp', 'image/jpeg');
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarReserva).toHaveBeenCalled();
  });

  it('avisa al usuario cuando la descarga falla en flujo saldo', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await onPhoto(ctx, 'media-exp', 'image/jpeg');

    expect(ctx.lastReply()).toMatch(/descargar|manual/i);
  });

  it('avisa cuando falla la descarga de una foto pendiente (enviada antes de elegir tipo)', async () => {
    const ctx = makeCtx(uid());
    await onPhotoSinContexto(ctx, 'media-exp', 'image/jpeg');
    await boton(ctx, 'res_tipo_nueva');

    expect(ctx.lastReply()).toMatch(/descargar|manual/i);
  });
});

describe('procesarFotoEnContexto — comprobante ilegible (Claude no extrae)', () => {
  beforeEach(() => {
    mockProcesarComprobante.mockResolvedValue({ ok: false, error: { tipo: 'ilegible' } });
  });

  it('pide ingreso manual en flujo nueva', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-ok', 'image/jpeg');

    expect(ctx.lastReply()).toMatch(/no pude leer|manual/i);
  });

  it('el flujo continúa manualmente después', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-ok', 'image/jpeg');
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarReserva).toHaveBeenCalled();
  });
});

describe('procesarFotoEnContexto — comprobante duplicado', () => {
  beforeEach(() => {
    mockProcesarComprobante.mockResolvedValue({
      ok: false,
      error: { tipo: 'duplicado', detalle: 'El número OP-999 ya fue registrado:\n\nFecha: 10/06/2026\nCasa: Casa 3\nMonto: $300000\nPagó: García María' },
    });
  });

  it('avisa el duplicado y permite ingresar monto manual', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-dup', 'image/jpeg');

    expect(ctx.replies.some(r => r.includes('duplicado') || r.includes('Duplicado') || r.includes('⚠️'))).toBe(true);
  });

  it('después de avisar el duplicado, el flujo puede continuar con monto manual', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-dup', 'image/jpeg');
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarReserva).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG ROJO 2 — reiniciar flujo a mitad no mezcla datos viejos
// ══════════════════════════════════════════════════════════════════════════

describe('reiniciar flujo a mitad — estado anterior descartado', () => {
  it('res_tipo_nueva en medio de un flujo activo descarta los datos anteriores', async () => {
    const ctx = makeCtx(uid());
    // Primer intento: llega hasta nombre pax
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'Nombre Viejo');

    // El usuario presiona res_tipo_nueva de nuevo (desde el menú / doble tap)
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 1');
    await texto(ctx, 'Nombre Nuevo');
    await texto(ctx, '2');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar');

    // La reserva debe tener Casa 1 y "Nombre Nuevo", no los datos del primer intento
    expect(mockRegistrarReserva).toHaveBeenCalledWith(
      expect.objectContaining({ casa: 'Casa 1', nombrePax: 'Nombre Nuevo' })
    );
    expect(mockRegistrarReserva).not.toHaveBeenCalledWith(
      expect.objectContaining({ nombrePax: 'Nombre Viejo' })
    );
  });

  it('res_tipo_saldo en medio de un flujo activo descarta los datos anteriores', async () => {
    const ctx = makeCtx(uid());
    // Primer intento saldo: llega a elegir reserva
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '999 USD'); // monto incorrecto

    // Reinicia presionando res_tipo_saldo de nuevo
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '400 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar_saldo');

    // Solo debe haberse registrado una vez con el monto correcto
    expect(mockRegistrarSaldo).toHaveBeenCalledTimes(1);
    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ monto: 400 })
    );
  });

  it('res_tipo_nueva preserva la foto pendiente si había una', async () => {
    const ctx = makeCtx(uid());
    // El usuario envía foto → pregunta tipo
    await onPhotoSinContexto(ctx, 'media-pend', 'image/jpeg');
    // Presiona res_tipo_nueva → debe procesar la foto (llama procesarComprobante)
    await boton(ctx, 'res_tipo_nueva');

    expect(mockProcesarComprobante).toHaveBeenCalledWith('media-pend', 'image/jpeg', 'ingreso');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// FOTO SIN CONTEXTO
// ══════════════════════════════════════════════════════════════════════════

describe('foto sin contexto', () => {
  it('intercepta la foto y pregunta qué tipo de operación', async () => {
    const ctx = makeCtx(uid());
    const handled = await onPhotoSinContexto(ctx, 'media-123', 'image/jpeg');

    expect(handled).toBe(true);
    expect(ctx.lastButtonIds()).toContain('res_tipo_nueva');
    expect(ctx.lastButtonIds()).toContain('res_tipo_saldo');
    expect(ctx.lastButtonIds()).toContain('res_foto_ingreso');
  });

  it('no intercepta si ya hay un flujo activo', async () => {
    const ctx = makeCtx(uid());
    // Iniciar flujo manualmente
    await boton(ctx, 'res_tipo_nueva');
    ctx.buttonCalls.length = 0;

    const handled = await onPhotoSinContexto(ctx, 'media-456', 'image/jpeg');

    expect(handled).toBe(false);
  });

  it('delega al handler de ingresos cuando se elige "Otros"', async () => {
    const ctx = makeCtx(uid());
    await onPhotoSinContexto(ctx, 'media-789', 'image/jpeg');
    await boton(ctx, 'res_foto_ingreso');

    expect(mockOnPhotoIngreso).toHaveBeenCalledWith(ctx, 'media-789', 'image/jpeg');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SESIÓN EXPIRADA
// ══════════════════════════════════════════════════════════════════════════

describe('sesión expirada', () => {
  it('responde con mensaje de sesión expirada para botones res_ sin estado', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_casa_Casa 1');

    expect(ctx.lastReply()).toMatch(/sesión/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG 6 — parsearMontoMoneda acepta u$s / u$d
// ══════════════════════════════════════════════════════════════════════════

describe('parsearMontoMoneda — variantes de moneda argentina', () => {
  async function flujoHastaMonto(ctx: ReturnType<typeof makeCtx>) {
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
  }

  it('acepta "300 u$s" como USD', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '300 u$s');

    // Si reconoció USD, pasa directo a pedir tipo de pago (no pregunta moneda)
    expect(ctx.lastButtonIds()).toContain('res_pago_transferencia');
  });

  it('acepta "300 u$d" como USD', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '300 u$d');

    expect(ctx.lastButtonIds()).toContain('res_pago_transferencia');
  });

  it('registra en USD cuando el adelanto es "200 u$s"', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaMonto(ctx);
    await texto(ctx, '200 u$s');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_omitir_nro');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ moneda: 'USD', monto: 200 })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG 5 — fechas en orden incorrecto
// ══════════════════════════════════════════════════════════════════════════

describe('parsearFechas — orden incorrecto', () => {
  it('rechaza fechas invertidas con mensaje específico', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '15/06 - 10/06'); // salida antes que entrada

    expect(ctx.lastReply()).toMatch(/posterior/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG 4 — estadoPago COMPLETO cuando adelanto cubre el total
// ══════════════════════════════════════════════════════════════════════════

describe('guardarNuevaReserva — estadoPago según cobertura del adelanto', () => {
  it('guarda COMPLETO cuando el adelanto USD cubre el total', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await texto(ctx, '800 USD'); // adelanto = total
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_omitir_nro');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarReserva).toHaveBeenCalledWith(
      expect.objectContaining({ estadoPago: 'COMPLETO', saldoUSD: 0 })
    );
  });

  it('guarda ADELANTO_RECIBIDO cuando el adelanto no cubre el total', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_omitir_nro');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarReserva).toHaveBeenCalledWith(
      expect.objectContaining({ estadoPago: 'ADELANTO_RECIBIDO' })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG 1 — res_moneda_USD lee monto del campo correcto
// ══════════════════════════════════════════════════════════════════════════

describe('res_moneda_USD — lee monto correctamente después de un comprobante', () => {
  it('no registra adelanto 0 al elegir USD cuando el monto estaba en montoAdelantoUSD', async () => {
    // Simula: comprobante extrajo USD 300, luego el usuario pulsa res_moneda_USD
    // (edge case: si el comprobante ya puso el monto en montoAdelantoUSD)
    const ctx = makeCtx(uid());
    // Flujo normal con número solo → guarda en montoAdelantoARS temporalmente
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await texto(ctx, '300'); // sin moneda → pregunta moneda
    await boton(ctx, 'res_moneda_USD');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_omitir_nro');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ moneda: 'USD', monto: 300 })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG 7 — foto en paso incorrecto responde con mensaje
// ══════════════════════════════════════════════════════════════════════════

describe('onPhoto en paso inesperado', () => {
  it('avisa que no espera imagen cuando hay flujo activo pero no es el paso de monto', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    // Estamos en res_nombre_pax → enviar foto
    const handled = await onPhoto(ctx, 'media-999', 'image/jpeg');

    expect(handled).toBe(true);
    expect(ctx.lastReply()).toMatch(/no esperaba/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG 2 — foto confirma monto → debe pedir tipo de pago (no asumir transferencia)
// ══════════════════════════════════════════════════════════════════════════

describe('foto confirma monto → pide tipo de pago', () => {
  function mockComp(monto = 540000, moneda = 'ARS') {
    mockDownload.mockResolvedValue({ base64: 'b64' });
    mockSubir.mockResolvedValue('https://storage/c.jpg');
    mockExtraer.mockResolvedValue({ monto, moneda, fecha: '', nombreOrdenante: '',
      nombreDestinatario: 'Milagros', bancoOrigen: '', nroOperacion: '' });
  }

  it('foto en nueva → foto_ok → pide tipo de pago antes de confirmar', async () => {
    mockComp();
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-x', 'image/jpeg');
    await boton(ctx, 'res_foto_ok');

    // Debe preguntar tipo de pago, no ir directo a confirmación
    expect(ctx.lastButtonIds()).toContain('res_pago_transferencia');
    expect(ctx.lastButtonIds()).toContain('res_pago_efectivo');
  });

  it('foto en saldo → foto_ok → elige reserva → pide tipo de pago', async () => {
    mockComp(400, 'USD');
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await onPhoto(ctx, 'media-x', 'image/jpeg');
    await boton(ctx, 'res_foto_ok');
    await texto(ctx, '1'); // elige reserva de la lista

    expect(ctx.lastButtonIds()).toContain('res_pago_transferencia');
    expect(ctx.lastButtonIds()).toContain('res_pago_efectivo');
  });

  it('foto saldo efectivo → registra tipo efectivo', async () => {
    mockComp(400, 'USD');
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await onPhoto(ctx, 'media-x', 'image/jpeg');
    await boton(ctx, 'res_foto_ok');
    await texto(ctx, '1');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar_saldo');

    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'efectivo' })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG 3 — confirmación saldo ARS muestra equivalente USD
// ══════════════════════════════════════════════════════════════════════════

describe('pedirConfirmacionSaldo — equivalente USD para pagos en ARS', () => {
  beforeEach(() => {
  });

  it('muestra equivalente USD cuando el pago es en ARS', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '540000 ARS');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_omitir_nro');

    // El resumen de confirmación debe incluir el equivalente en USD
    const textoConfirmacion = ctx.buttonCalls[ctx.buttonCalls.length - 1]?.text ?? '';
    expect(textoConfirmacion).toMatch(/USD/);
    expect(textoConfirmacion).toMatch(/cotiz/i);
  });

  it('no muestra equivalente cuando el pago ya es en USD', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '400 USD');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_omitir_nro');

    const textoConfirmacion = ctx.buttonCalls[ctx.buttonCalls.length - 1]?.text ?? '';
    // No debe mostrar cotización (ya está en USD)
    expect(textoConfirmacion).not.toMatch(/cotiz/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CANCELAR FLUJO
// ══════════════════════════════════════════════════════════════════════════

describe('cancelar flujo', () => {
  it('cancela una reserva nueva antes de confirmar', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_cancelar');

    expect(ctx.lastReply()).toMatch(/cancelado/i);
  });

  it('cancela un saldo antes de confirmar', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '400 USD');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_cancelar_saldo');

    expect(ctx.lastReply()).toMatch(/cancelado/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TRANSFERENCIA — PIDE DESTINATARIO
// ══════════════════════════════════════════════════════════════════════════

describe('transferencia sin comprobante pide destinatario', () => {
  async function flujoHastaPago(ctx: ReturnType<typeof makeCtx>) {
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await texto(ctx, '300 USD');
  }

  it('pide nombre del destinatario al elegir transferencia sin comprobante', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaPago(ctx);
    await boton(ctx, 'res_pago_transferencia');

    // Debe pedir destinatario con botón "Omitir"
    expect(ctx.lastButtonIds()).toContain('res_omitir_nro');
  });

  it('puede omitir el destinatario y llegar a confirmación', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaPago(ctx);
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_omitir_nro');

    expect(ctx.lastButtonIds()).toContain('res_confirmar');
  });

  it('acepta texto como destinatario y llega a confirmación', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaPago(ctx);
    await boton(ctx, 'res_pago_transferencia');
    await texto(ctx, 'Milagros Porta');

    expect(ctx.lastButtonIds()).toContain('res_confirmar');
  });

  it('pide destinatario también en flujo saldo y llega a confirmación saldo', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '400 USD');
    await boton(ctx, 'res_pago_transferencia');
    await boton(ctx, 'res_omitir_nro');

    expect(ctx.lastButtonIds()).toContain('res_confirmar_saldo');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// MONEDA SALDO SIN ESPECIFICAR
// ══════════════════════════════════════════════════════════════════════════

describe('moneda saldo sin especificar', () => {
  beforeEach(() => {
  });

  it('muestra botones ARS/USD cuando el monto saldo no trae moneda', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '540000');

    expect(ctx.lastButtonIds()).toContain('res_saldo_moneda_ARS');
    expect(ctx.lastButtonIds()).toContain('res_saldo_moneda_USD');
  });

  it('completa el flujo saldo eligiendo ARS después', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '540000');
    await boton(ctx, 'res_saldo_moneda_ARS');
    await boton(ctx, 'res_omitir_nro');
    await boton(ctx, 'res_confirmar_saldo');

    expect(mockRegistrarSaldo).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(Number),
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BÚSQUEDA POR NOMBRE
// ══════════════════════════════════════════════════════════════════════════

describe('búsqueda por nombre', () => {
  const mockBuscar = svcReservas.buscarReservasPorNombre as jest.Mock;

  // Fixture basado en seed-reservas.js: "garcía" devuelve #1, #5 y #6
  const reservasGarcia = [
    makeReserva({ id: '1', nombrePax: 'García María',   casa: 'Casa 3', saldoUSD: 400 }),
    makeReserva({ id: '5', nombrePax: 'García Roberto', casa: 'Casa 5', saldoUSD: 600 }),
    makeReserva({ id: '6', nombrePax: 'García Sofía',   casa: 'Casa 5', saldoUSD: 750 }),
  ];

  beforeEach(() => {
  });

  it('pide nombre cuando no hay reservas en la semana', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');

    expect(ctx.lastReply()).toMatch(/nombre/i);
  });

  it('escribe 0 en lista semana → cambia a búsqueda por nombre', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '0');

    expect(ctx.lastReply()).toMatch(/nombre/i);
  });

  it('número fuera de rango en lista → mensaje de error y repregunta', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '5');

    expect(ctx.lastReply()).toMatch(/1 al 2/);
  });

  it('nombre no encontrado → ofrece crear reserva o buscar de nuevo', async () => {
    mockBuscar.mockResolvedValue([]);
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, 'Desconocido');

    // Ahora muestra botones en lugar de texto plano
    const ultimoBoton = ctx.buttonCalls[ctx.buttonCalls.length - 1];
    expect(ultimoBoton?.text).toMatch(/no encontré/i);
    expect(ctx.lastButtonIds()).toContain('res_crear_desde_busqueda');
    expect(ctx.lastButtonIds()).toContain('res_buscar_otro_nombre');
  });

  it('"lópez" → 1 resultado (seed #2) → va directo a pedir monto', async () => {
    const lopez = makeReserva({ id: '2', nombrePax: 'López Juan', casa: 'Casa 1', saldoUSD: 300 });
    mockBuscar.mockResolvedValue([lopez]);
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, 'lópez');

    expect(ctx.lastReply()).toMatch(/López Juan/);
    expect(ctx.lastReply()).toMatch(/saldo pendiente/i);
  });

  it('"garcía" → 3 resultados → muestra lista numerada', async () => {
    mockBuscar.mockResolvedValue(reservasGarcia);
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, 'garcía');

    expect(ctx.replies.some(r => r.includes('García María'))).toBe(true);
    expect(ctx.replies.some(r => r.includes('García Sofía'))).toBe(true);
  });

  it('"garcía" → lista múltiple → elige 2 → va a monto saldo', async () => {
    mockBuscar.mockResolvedValue(reservasGarcia);
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, 'garcía');
    await texto(ctx, '2'); // García Roberto (seed #5)

    expect(ctx.lastReply()).toMatch(/García Roberto/);
    expect(ctx.lastReply()).toMatch(/saldo pendiente/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// FLUJO CON COMPROBANTE (FOTO)
// ══════════════════════════════════════════════════════════════════════════

describe('comprobante en flujo de nueva reserva', () => {
  function mockComprobanteOk(overrides: Partial<typeof COMPROBANTE_OK_DEFAULT['datos']> = {}) {
    mockProcesarComprobante.mockResolvedValue({
      ...COMPROBANTE_OK_DEFAULT,
      datos: { ...COMPROBANTE_OK_DEFAULT.datos, ...overrides },
    });
  }

  it('foto en res_monto_adelanto → extrae monto y muestra botones de confirmación', async () => {
    mockComprobanteOk();
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-001', 'image/jpeg');

    expect(ctx.lastButtonIds()).toContain('res_foto_ok');
    expect(ctx.lastButtonIds()).toContain('res_foto_manual');
    const textoBoton = ctx.buttonCalls[ctx.buttonCalls.length - 1]?.text ?? '';
    expect(textoBoton).toMatch(/300/);
  });

  it('foto con monto → confirmar → registra reserva e ingreso', async () => {
    mockComprobanteOk({ monto: 300000, moneda: 'ARS' });
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-001', 'image/jpeg');
    await boton(ctx, 'res_foto_ok');
    await boton(ctx, 'res_confirmar');

    expect(mockRegistrarReserva).toHaveBeenCalled();
    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ moneda: 'ARS', monto: 300000, comprobanteUrl: 'https://storage/comp.jpg' })
    );
  });

  it('foto → "ingresar manualmente" → pide monto y completa normal', async () => {
    mockComprobanteOk();
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-001', 'image/jpeg');
    await boton(ctx, 'res_foto_manual');

    expect(ctx.lastReply()).toMatch(/adelanto/i);
  });

  it('cuando procesarComprobante retorna ilegible → pide ingreso manual', async () => {
    mockProcesarComprobante.mockResolvedValue({ ok: false, error: { tipo: 'ilegible' } });
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-002', 'image/jpeg');

    expect(ctx.lastReply()).toMatch(/no pude leer|manual/i);
  });
});

describe('comprobante en flujo de saldo', () => {
  function mockComprobanteOk(monto = 400, moneda = 'USD') {
    mockProcesarComprobante.mockResolvedValue({
      ok: true,
      datos: { monto, moneda, fecha: '10/06/2026',
        nombreOrdenante: 'García María', nombreDestinatario: '', bancoOrigen: '', nroOperacion: '',
        bancoDestino: '', cbuDestino: '' },
      comprobanteUrl: 'https://storage/comp.jpg',
    });
  }

  beforeEach(() => {
  });

  it('foto en res_monto_saldo → extrae monto y muestra botones de confirmación', async () => {
    mockComprobanteOk(400, 'USD');
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await onPhoto(ctx, 'media-003', 'image/jpeg');

    expect(ctx.lastButtonIds()).toContain('res_foto_ok');
  });

  it('foto saldo → confirmar → registra COMPLETO', async () => {
    mockComprobanteOk(400, 'USD');
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await onPhoto(ctx, 'media-003', 'image/jpeg');
    await boton(ctx, 'res_foto_ok');
    await texto(ctx, '1');
    await boton(ctx, 'res_confirmar_saldo');

    expect(mockRegistrarSaldo).toHaveBeenCalledWith(expect.anything(), 'COMPLETO', 0);
  });

  it('foto saldo → ilegible → pide manual', async () => {
    mockProcesarComprobante.mockResolvedValue({ ok: false, error: { tipo: 'ilegible' } });
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await onPhoto(ctx, 'media-004', 'image/jpeg');

    expect(ctx.lastReply()).toMatch(/no pude leer|manual/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// FOTO PENDIENTE + ELECCIÓN DE TIPO
// ══════════════════════════════════════════════════════════════════════════

describe('foto enviada antes de elegir tipo', () => {
  beforeEach(() => {
    mockProcesarComprobante.mockResolvedValue({
      ok: true,
      datos: { monto: 200, moneda: 'USD', fecha: '',
        nombreOrdenante: '', nombreDestinatario: '', bancoOrigen: '', nroOperacion: '',
        bancoDestino: '', cbuDestino: '' },
      comprobanteUrl: 'https://storage/comp.jpg',
    });
  });

  it('elige "reserva nueva" → procesa la foto pendiente como adelanto', async () => {
    const ctx = makeCtx(uid());
    await onPhotoSinContexto(ctx, 'media-pending', 'image/jpeg');
    await boton(ctx, 'res_tipo_nueva');

    expect(ctx.lastButtonIds()).toContain('res_foto_ok');
    expect(ctx.lastButtonIds()).toContain('res_foto_manual');
  });

  it('elige "saldo" → procesa la foto pendiente como saldo', async () => {
    const ctx = makeCtx(uid());
    await onPhotoSinContexto(ctx, 'media-pending', 'image/jpeg');
    await boton(ctx, 'res_tipo_saldo');

    expect(ctx.lastButtonIds()).toContain('res_foto_ok');
  });

  it('foto pendiente → "reserva nueva" → foto_ok → pide casa', async () => {
    const ctx = makeCtx(uid());
    await onPhotoSinContexto(ctx, 'media-pending', 'image/jpeg');
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_foto_ok');

    expect(ctx.allButtonIds().some(id => id.startsWith('res_casa_'))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG AMARILLO 3 — cotización usada al guardar = cotización mostrada al usuario
// ══════════════════════════════════════════════════════════════════════════

describe('guardarSaldo — cotización consistente con la confirmación', () => {
  beforeEach(() => {
    // Reset completo para evitar que Once mocks se filtren entre tests
    mockCotizacion.mockReset().mockResolvedValue(1350);
  });

  it('saldo en ARS: obtenerCotizacion se llama solo una vez (en confirmación, no en guardar)', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '540000 ARS');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar_saldo');

    // Solo una llamada a la API de cotización (en pedirConfirmacionSaldo)
    // guardarSaldo reutiliza el valor ya guardado en estado
    expect(mockCotizacion).toHaveBeenCalledTimes(1);
    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ cotizacion: 1350 })
    );
  });

  it('si la cotización cambia entre confirmación y guardar, se usa la de confirmación', async () => {
    // Primera llamada en confirmación: 1350
    // Si guardarSaldo re-fetcheara (bug), devolvería 1500 — no debe pasar
    mockCotizacion
      .mockResolvedValueOnce(1350)
      .mockResolvedValue(1500);

    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '540000 ARS');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar_saldo');

    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ cotizacion: 1350 })
    );
  });

  it('saldo en USD: obtenerCotizacion se llama una vez solo en guardarSaldo', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '400 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar_saldo');

    // Para USD, pedirConfirmacionSaldo no llama a la API; guardarSaldo sí, una vez
    expect(mockCotizacion).toHaveBeenCalledTimes(1);
    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ cotizacion: 1350 })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG AMARILLO 4 — texto en pasos de confirmación da feedback al usuario
// ══════════════════════════════════════════════════════════════════════════

describe('texto libre durante confirmación', () => {
  it('avisa en res_confirmacion que debe usar los botones', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_efectivo');
    await texto(ctx, 'espera, el monto está mal');

    expect(ctx.lastReply()).toMatch(/botones/i);
  });

  it('avisa en res_confirmacion_saldo que debe usar los botones', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '400 USD');
    await boton(ctx, 'res_pago_efectivo');
    await texto(ctx, 'no, cancelar');

    expect(ctx.lastReply()).toMatch(/botones/i);
  });

  it('texto en confirmación no registra nada', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_efectivo');
    await texto(ctx, 'texto random');

    expect(mockRegistrarReserva).not.toHaveBeenCalled();
  });

  it('avisa en res_confirmar_monto_foto que debe usar los botones', async () => {
    mockDownload.mockResolvedValue({ base64: 'b64' });
    mockSubir.mockResolvedValue('');
    mockExtraer.mockResolvedValue({ monto: 300, moneda: 'USD', fecha: '',
      nombreOrdenante: '', nombreDestinatario: '', bancoOrigen: '', nroOperacion: '' });

    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await onPhoto(ctx, 'media-x', 'image/jpeg');
    await texto(ctx, 'el monto no es ese');

    expect(ctx.lastReply()).toMatch(/botones/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG ROJO 1 — monto total no acepta ARS
// ══════════════════════════════════════════════════════════════════════════

describe('res_monto_total — rechaza pesos, solo acepta USD', () => {
  async function flujoHastaTotalUSD(ctx: ReturnType<typeof makeCtx>) {
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
  }

  it('rechaza "800000 ARS" con mensaje claro', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaTotalUSD(ctx);
    await texto(ctx, '800000 ARS');

    expect(ctx.lastReply()).toMatch(/USD/i);
    expect(mockRegistrarReserva).not.toHaveBeenCalled();
  });

  it('rechaza "800 pesos" con mensaje claro', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaTotalUSD(ctx);
    await texto(ctx, '800 pesos');

    expect(ctx.lastReply()).toMatch(/USD/i);
  });

  it('acepta "800 USD" y avanza', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaTotalUSD(ctx);
    await texto(ctx, '800 USD');

    // Debe pedir el adelanto, no rechazar
    expect(ctx.lastReply()).toMatch(/adelanto/i);
  });

  it('acepta "800" sin moneda (asume USD) y avanza', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaTotalUSD(ctx);
    await texto(ctx, '800');

    expect(ctx.lastReply()).toMatch(/adelanto/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG ROJO 2 — res_datos_transferencia valida texto vacío
// ══════════════════════════════════════════════════════════════════════════

describe('res_datos_transferencia — no acepta texto vacío', () => {
  async function flujoHastaDestinatario(ctx: ReturnType<typeof makeCtx>) {
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_transferencia');
  }

  it('repregunta si el texto del destinatario es vacío', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaDestinatario(ctx);
    ctx.text = '';
    await onText(ctx);

    expect(ctx.lastReply()).toMatch(/destinatario|omitir/i);
    expect(mockRegistrarReserva).not.toHaveBeenCalled();
  });

  it('acepta texto con contenido y avanza a confirmación', async () => {
    const ctx = makeCtx(uid());
    await flujoHastaDestinatario(ctx);
    await texto(ctx, 'Milagros Porta');

    expect(ctx.lastButtonIds()).toContain('res_confirmar');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BUG AMARILLO 3 — error en guardar limpia el estado para no trabar al usuario
// ══════════════════════════════════════════════════════════════════════════

describe('error al guardar — estado se limpia para poder reintentar', () => {
  it('error en guardarNuevaReserva limpia estado y el usuario puede volver a empezar', async () => {
    mockRegistrarReserva.mockRejectedValueOnce(new Error('Sheets API 500'));
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');
    await texto(ctx, 'García María');
    await texto(ctx, '4');
    await texto(ctx, '10/06 - 15/06');
    await texto(ctx, '800');
    await texto(ctx, '300 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar');

    expect(ctx.lastReply()).toMatch(/error/i);

    // El usuario puede iniciar un nuevo flujo sin quedar trabado
    await boton(ctx, 'res_tipo_nueva');
    expect(ctx.lastButtonIds().some(id => id.startsWith('res_casa_'))).toBe(true);
  });

  it('error en guardarSaldo limpia estado y el usuario puede volver a empezar', async () => {
    mockRegistrarSaldo.mockRejectedValueOnce(new Error('Sheets API 500'));
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '400 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar_saldo');

    expect(ctx.lastReply()).toMatch(/error/i);

    // Puede reiniciar sin quedar en "Usá los botones de arriba"
    await boton(ctx, 'res_tipo_saldo');
    expect(ctx.replies.slice(-3).every(r => !r.match(/botones/i))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PAGO QUE SUPERA EL SALDO PENDIENTE
// ══════════════════════════════════════════════════════════════════════════

describe('pago mayor al saldo — advertencia en confirmación', () => {
  beforeEach(() => {
  });

  it('muestra advertencia cuando el pago USD supera el saldo', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '500 USD'); // saldo es 400
    await boton(ctx, 'res_pago_efectivo');

    const textoConfirmacion = ctx.buttonCalls[ctx.buttonCalls.length - 1]?.text ?? '';
    expect(textoConfirmacion).toMatch(/supera/i);
    expect(textoConfirmacion).toMatch(/100/); // excedente = 500 - 400
  });

  it('muestra advertencia cuando el pago ARS supera el saldo convertido', async () => {
    // cotizacion=1350, saldo=400 USD → límite ARS = 540000. Paga 600000 ARS → excede en ~44 USD
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '600000 ARS');
    await boton(ctx, 'res_pago_efectivo');

    const textoConfirmacion = ctx.buttonCalls[ctx.buttonCalls.length - 1]?.text ?? '';
    expect(textoConfirmacion).toMatch(/supera/i);
  });

  it('NO muestra advertencia cuando el pago es exactamente el saldo', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '400 USD');
    await boton(ctx, 'res_pago_efectivo');

    const textoConfirmacion = ctx.buttonCalls[ctx.buttonCalls.length - 1]?.text ?? '';
    expect(textoConfirmacion).not.toMatch(/supera/i);
  });

  it('NO muestra advertencia cuando el pago es menor al saldo', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '100 USD');
    await boton(ctx, 'res_pago_efectivo');

    const textoConfirmacion = ctx.buttonCalls[ctx.buttonCalls.length - 1]?.text ?? '';
    expect(textoConfirmacion).not.toMatch(/supera/i);
  });

  it('puede confirmarse igual con el excedente — se guarda como COMPLETO con saldo 0', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '500 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar_saldo');

    expect(mockRegistrarSaldo).toHaveBeenCalledWith(
      expect.anything(), 'COMPLETO', 0
    );
    expect(mockRegistrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ monto: 500, moneda: 'USD' })
    );
  });

  it('puede cancelarse si el monto era incorrecto', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '500 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_cancelar_saldo');

    expect(mockRegistrarSaldo).not.toHaveBeenCalled();
    expect(ctx.lastReply()).toMatch(/cancelado/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CASO 1 — SALDO EN CUOTAS: confirmación muestra saldo resultante
// ══════════════════════════════════════════════════════════════════════════

describe('saldo parcial — confirmación muestra saldo resultante', () => {
  beforeEach(() => {
  });

  it('muestra saldo restante en el mensaje de confirmación cuando el pago es parcial', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '200 USD');   // pago parcial: 200 de 400
    await boton(ctx, 'res_pago_efectivo');

    const textoConfirmacion = ctx.buttonCalls[ctx.buttonCalls.length - 1]?.text ?? '';
    expect(textoConfirmacion).toMatch(/saldo restante.*200/i);
  });

  it('NO muestra saldo restante cuando el pago es exacto', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '400 USD');
    await boton(ctx, 'res_pago_efectivo');

    const textoConfirmacion = ctx.buttonCalls[ctx.buttonCalls.length - 1]?.text ?? '';
    expect(textoConfirmacion).not.toMatch(/saldo restante/i);
  });

  it('guarda SALDO_RECIBIDO y saldo correcto cuando el pago es parcial', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '150 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar_saldo');

    expect(mockRegistrarSaldo).toHaveBeenCalledWith(expect.anything(), 'SALDO_RECIBIDO', 250);
  });

  it('el mensaje de éxito también informa el saldo restante', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, '1');
    await texto(ctx, '150 USD');
    await boton(ctx, 'res_pago_efectivo');
    await boton(ctx, 'res_confirmar_saldo');

    expect(ctx.replies.some(r => /saldo restante.*USD 250/i.test(r))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CASO 2 — BÚSQUEDA SIN RESULTADO → CREAR RESERVA
// ══════════════════════════════════════════════════════════════════════════

describe('búsqueda sin resultado → opciones de acción', () => {
  const mockBuscar = svcReservas.buscarReservasPorNombre as jest.Mock;

  beforeEach(() => {
    mockBuscar.mockResolvedValue([]);
  });

  it('ofrece crear reserva nueva con el nombre buscado', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, 'Martínez');

    expect(ctx.lastButtonIds()).toContain('res_crear_desde_busqueda');
  });

  it('"crear reserva" salta al paso de casa con el nombre pre-cargado', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, 'Martínez');
    await boton(ctx, 'res_crear_desde_busqueda');

    // Debe preguntar la casa y el mensaje debe mencionar el nombre
    const ultimoBoton = ctx.buttonCalls[ctx.buttonCalls.length - 1];
    expect(ultimoBoton?.text).toMatch(/Martínez/);
    expect(ctx.lastButtonIds()).toContain('res_casa_Casa 1');
  });

  it('"buscar otro nombre" vuelve a pedir nombre sin borrar el estado', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, 'Martínez');
    await boton(ctx, 'res_buscar_otro_nombre');

    expect(ctx.lastReply()).toMatch(/nombre/i);
  });

  it('buscar otro nombre → nueva búsqueda exitosa continúa el flujo', async () => {
    const lopez = makeReserva({ nombrePax: 'López Juan' });
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');
    await texto(ctx, 'Martínez');
    await boton(ctx, 'res_buscar_otro_nombre');

    mockBuscar.mockResolvedValueOnce([lopez]);
    await texto(ctx, 'López');

    expect(ctx.lastReply()).toMatch(/saldo pendiente/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CASO 3 — CORRECCIÓN DE RESERVA
// ══════════════════════════════════════════════════════════════════════════

describe('corrección de reserva', () => {
  const reservaBase = makeReserva({ id: '7', nombrePax: 'García María', casa: 'Casa 3' });

  beforeEach(() => {
    mockBuscarPorId.mockResolvedValue(reservaBase);
    mockActualizarCampo.mockResolvedValue(undefined);
    (svcReservas.buscarReservasPorNombre as jest.Mock).mockResolvedValue([reservaBase]);
  });

  it('buscar por número de reserva muestra opciones de corrección', async () => {
    const ctx = makeCtx(uid());
    await onCorregirCommand(ctx);
    await texto(ctx, '7');

    expect(ctx.lastButtonIds()).toContain('res_corregir_nombre');
    expect(ctx.lastButtonIds()).toContain('res_corregir_casa');
  });

  it('buscar por nombre también llega a opciones de corrección', async () => {
    const ctx = makeCtx(uid());
    await onCorregirCommand(ctx);
    await texto(ctx, 'García');

    expect(ctx.lastButtonIds()).toContain('res_corregir_nombre');
  });

  it('corregir nombre: pide el nombre nuevo y actualiza', async () => {
    const ctx = makeCtx(uid());
    await onCorregirCommand(ctx);
    await texto(ctx, '7');
    await boton(ctx, 'res_corregir_nombre');
    await texto(ctx, 'García Sofía');

    expect(mockActualizarCampo).toHaveBeenCalledWith(reservaBase.fila, 'nombrePax', 'García Sofía');
    expect(ctx.lastReply()).toMatch(/actualizado/i);
  });

  it('corregir casa: muestra lista de casas y actualiza al confirmar', async () => {
    const ctx = makeCtx(uid());
    await onCorregirCommand(ctx);
    await texto(ctx, '7');
    await boton(ctx, 'res_corregir_casa');

    expect(ctx.lastButtonIds()).toContain('res_corregir_casa_Casa 1');
    await boton(ctx, 'res_corregir_casa_Casa 5');

    expect(mockActualizarCampo).toHaveBeenCalledWith(reservaBase.fila, 'casa', 'Casa 5');
    expect(ctx.lastReply()).toMatch(/actualizada/i);
  });

  it('búsqueda sin resultado en corrección informa que no encontró', async () => {
    mockBuscarPorId.mockResolvedValue(null);
    (svcReservas.buscarReservasPorNombre as jest.Mock).mockResolvedValue([]);
    const ctx = makeCtx(uid());
    await onCorregirCommand(ctx);
    await texto(ctx, '99');

    expect(ctx.lastReply()).toMatch(/no encontré/i);
  });

  it('múltiples resultados pide elegir por número', async () => {
    const garcia2 = makeReserva({ id: '6', nombrePax: 'García Sofía', fila: 7 });
    mockBuscarPorId.mockResolvedValue(null);
    (svcReservas.buscarReservasPorNombre as jest.Mock).mockResolvedValue([reservaBase, garcia2]);
    const ctx = makeCtx(uid());
    await onCorregirCommand(ctx);
    await texto(ctx, 'García');

    // Debe listar opciones numeradas
    expect(ctx.lastReply()).toMatch(/1\./);
    expect(ctx.lastReply()).toMatch(/2\./);

    // Elegir el segundo
    await texto(ctx, '2');
    expect(ctx.lastButtonIds()).toContain('res_corregir_nombre');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ESCAPE POR PALABRA CLAVE / COMANDO NUEVO
// ══════════════════════════════════════════════════════════════════════════

describe('escape por palabra clave mid-flujo', () => {
  const palabras = ['cancelar', 'salir', 'menu', 'menú', 'volver', 'inicio'];

  for (const palabra of palabras) {
    it(`"${palabra}" mid-flujo cancela y muestra menú`, async () => {
      const ctx = makeCtx(uid());
      await boton(ctx, 'res_tipo_nueva');        // inicia flujo
      await texto(ctx, palabra);

      expect(ctx.lastReply()).toMatch(/cancelad|en qué/i);
      expect(ctx.lastButtonIds()).toEqual(expect.arrayContaining(['menu_reserva']));
    });
  }

  it('"cancelar" sin flujo activo igual muestra el menú', async () => {
    const ctx = makeCtx(uid());
    await texto(ctx, 'cancelar');

    expect(ctx.lastButtonIds()).toEqual(expect.arrayContaining(['menu_reserva']));
  });

  it('texto normal mid-flujo NO dispara escape', async () => {
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_nueva');
    await boton(ctx, 'res_casa_Casa 3');     // selecciona casa → paso res_nombre_pax
    const repliesAntes = ctx.replies.length;
    await texto(ctx, 'Juan Pérez');

    // el flujo sigue (pregunta cantidad de personas)
    expect(ctx.replies.length).toBeGreaterThan(repliesAntes);
    expect(ctx.lastReply()).toMatch(/persona/i);
  });
});

describe('escape por comando nuevo mid-flujo (opción C)', () => {
  const comandos = ['saldo', 'reserva', 'gasto', 'ingreso'];

  for (const cmd of comandos) {
    it(`"${cmd}" mid-flujo cancela el estado y muestra menú`, async () => {
      const ctx = makeCtx(uid());
      await boton(ctx, 'res_tipo_nueva');
      await texto(ctx, cmd);

      expect(ctx.lastReply()).toMatch(/cancelad/i);
      expect(ctx.lastButtonIds()).toEqual(expect.arrayContaining(['menu_reserva']));
    });
  }

  it('"saldo" sin flujo activo NO es interceptado por escape', async () => {
    const ctx = makeCtx(uid());
    const handled = await texto(ctx, 'saldo');

    // sin estado activo onText devuelve false (el router principal lo maneja)
    expect(handled).toBe(false);
    expect(ctx.replies.length).toBe(0);
  });
});

