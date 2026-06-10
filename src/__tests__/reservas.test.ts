import { makeCtx, uid } from './helpers/ctx';
import { onCallback, onText, onPhotoSinContexto } from '../handlers/reservas';

// ── Mocks de servicios externos ────────────────────────────────────────────

jest.mock('../services/reservas', () => ({
  listarReservasSemana: jest.fn(),
  buscarReservasPorNombre: jest.fn(),
  registrarReserva: jest.fn(),
  registrarSaldoReserva: jest.fn(),
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
import * as handlerIncome from '../handlers/income';

const mockListarSemana = svcReservas.listarReservasSemana as jest.Mock;
const mockRegistrarReserva = svcReservas.registrarReserva as jest.Mock;
const mockRegistrarSaldo = svcReservas.registrarSaldoReserva as jest.Mock;
const mockGenerarId = svcReservas.generarIdReserva as jest.Mock;
const mockRegistrarIngreso = svcSheets.registrarIngreso as jest.Mock;
const mockCotizacion = svcDolar.obtenerCotizacion as jest.Mock;
const mockExtraer = svcClaude.extraerDatosComprobante as jest.Mock;
const mockDownload = svcWhatsapp.downloadMedia as jest.Mock;
const mockSubir = svcStorage.subirComprobante as jest.Mock;
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

beforeEach(() => {
  jest.clearAllMocks();
  mockCotizacion.mockResolvedValue(1350);
  mockGenerarId.mockResolvedValue('10');
  mockRegistrarReserva.mockResolvedValue(undefined);
  mockRegistrarIngreso.mockResolvedValue(undefined);
  mockRegistrarSaldo.mockResolvedValue(undefined);
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
    mockListarSemana.mockResolvedValue([makeReserva({ saldoUSD: 400 })]);
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
    mockListarSemana.mockResolvedValue([]);
    const ctx = makeCtx(uid());
    await boton(ctx, 'res_tipo_saldo');

    expect(ctx.lastReply()).toMatch(/nombre/i);
  });

  it('trata saldoUSD=0 en planilla como dato incompleto y marca COMPLETO solo si el pago es >= saldo', async () => {
    // Simula que la columna M estaba vacía → parseFloat('') = NaN → 0
    mockListarSemana.mockResolvedValue([makeReserva({ saldoUSD: 0 })]);
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
