// Test de verificación del setup — puede borrarse una vez que los tests reales estén listos.
import { makeCtx, uid } from './helpers/ctx';

describe('setup', () => {
  it('jest + ts-jest cargan correctamente', () => {
    expect(1 + 1).toBe(2);
  });

  it('las variables de entorno de test están seteadas', () => {
    expect(process.env.ANTHROPIC_API_KEY).toBe('test-key');
    expect(process.env.GOOGLE_SHEET_ID).toBe('test-sheet-id');
    expect(process.env.GOOGLE_PRIVATE_KEY).toBe('test-private-key');
  });

  it('makeCtx captura replies y botones', async () => {
    const ctx = makeCtx(uid());
    await ctx.reply('Hola!');
    await ctx.replyButtons('¿Qué querés?', [
      { id: 'btn_a', title: 'Opción A' },
      { id: 'btn_b', title: 'Opción B' },
    ]);

    expect(ctx.lastReply()).toBe('Hola!');
    expect(ctx.lastButtonIds()).toEqual(['btn_a', 'btn_b']);
  });

  it('uid() genera IDs únicos', () => {
    expect(uid()).not.toBe(uid());
  });
});
