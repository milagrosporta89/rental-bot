import { WaCtx } from '../../types';

export interface MockCtx extends WaCtx {
  /** Todos los textos enviados por el bot vía reply() */
  replies: string[];
  /** Todos los mensajes con botones enviados por el bot */
  buttonCalls: Array<{ text: string; buttons: Array<{ id: string; title: string }> }>;
  /** Último reply de texto */
  lastReply(): string;
  /** IDs de los botones del último mensaje interactivo */
  lastButtonIds(): string[];
  /** Títulos de los botones del último mensaje interactivo */
  lastButtonTitles(): string[];
  /** Todos los IDs de botones enviados a lo largo de la conversación */
  allButtonIds(): string[];
}

/**
 * Crea un WaCtx falso que captura todas las respuestas del bot.
 * Usar un userId único por test para evitar que el estado de un handler
 * se mezcle entre tests (los handlers usan Map<userId, estado> a nivel módulo).
 */
export function makeCtx(userId: string): MockCtx {
  const replies: string[] = [];
  const buttonCalls: Array<{ text: string; buttons: Array<{ id: string; title: string }> }> = [];

  const ctx: MockCtx = {
    from: { id: userId, name: 'Test User' },
    text: undefined,
    imageId: undefined,
    documentId: undefined,
    mimeType: undefined,
    buttonId: undefined,
    reply: jest.fn(async (text: string) => {
      replies.push(text);
    }),
    replyButtons: jest.fn(async (text: string, buttons: Array<{ id: string; title: string }>) => {
      buttonCalls.push({ text, buttons });
    }),
    replyList: jest.fn(async (text: string, items: Array<{ id: string; title: string }>) => {
      buttonCalls.push({ text, buttons: items });
    }),
    answerCallbackQuery: jest.fn(),
    replies,
    buttonCalls,
    lastReply: () => replies[replies.length - 1] ?? '',
    lastButtonIds: () => buttonCalls[buttonCalls.length - 1]?.buttons.map(b => b.id) ?? [],
    lastButtonTitles: () => buttonCalls[buttonCalls.length - 1]?.buttons.map(b => b.title) ?? [],
    allButtonIds: () => buttonCalls.flatMap(c => c.buttons.map(b => b.id)),
  };

  return ctx;
}

/** Genera un userId único para aislar el estado entre tests */
let counter = 0;
export function uid(): string {
  return `user_test_${++counter}`;
}
