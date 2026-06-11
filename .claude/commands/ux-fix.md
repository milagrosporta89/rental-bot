# UX Fix – Implementar mejoras de UX

Implementá las mejoras del spec generado por `/ux-review`. Si no hay spec en la conversación, preguntá qué flujo y qué cambio específico se quiere hacer antes de tocar cualquier archivo.

## Antes de empezar

Si el spec tiene múltiples ítems preguntá:
> "¿Aplicamos todos los cambios o empezamos por los de prioridad ALTA?"

Esperá confirmación antes de modificar archivos.

## Por cada ítem del spec

1. Leé el archivo completo antes de editar
2. Localizá la línea exacta mencionada
3. Aplicá el cambio mínimo necesario — no refactorices alrededor
4. Verificá que el cambio no rompa el paso anterior ni el siguiente del flujo

## Qué podés cambiar
- Textos de mensajes al usuario
- Textos de botones e ítems de listas
- Mensajes de error y confirmación
- Orden o fusión de pasos en un flujo

## Qué NO cambiar
- Lógica de negocio (cálculos, validaciones, escritura en Sheets)
- Arquitectura (enrutamiento, estructura de handlers)
- Nada que no esté en el spec aprobado

## Verificación post-cambio
- Revisá el flujo completo del handler afectado
- Si cambiaste un texto de botón, verificá que el `buttonId` en `src/index.ts` siga coincidiendo
- Chequeá que los mensajes de error sigan siendo coherentes

## Reporte final

| # | Archivo | Línea | Cambio |
|---|---------|-------|--------|
| 1 | `src/handlers/X.ts` | 42 | "texto anterior" → "texto nuevo" |

Si algo no se pudo aplicar, explicá por qué y qué necesitaría para hacerlo.

Al terminar decí: "Cambios aplicados. Reiniciá el bot con `npm run dev` para probarlos."
