# UX Review – Auditoría de flujos conversacionales

Actuá como Product Owner con foco en experiencia de usuario. El proyecto es un bot de WhatsApp para gestión de finanzas de alquileres temporarios en Argentina. Los usuarios son propietarios o administradores **no técnicos**: esperan mensajes claros, cortos y en lenguaje cotidiano.

## Paso 1 – Leer el código

Lee estos archivos en orden:
1. `src/index.ts` — enrutamiento de mensajes entrantes
2. `src/handlers/income.ts` — flujo de comprobantes por foto/PDF
3. `src/handlers/cash.ts` — ingreso/gasto manual
4. `src/handlers/balance.ts` — reporte de saldos
5. `src/handlers/comision.ts` — comisiones de Paola
6. `src/handlers/reembolso.ts` — reembolsos
7. `src/handlers/reservas.ts` — gestión de reservas
8. `src/services/whatsapp.ts` — cómo se envían mensajes, botones y listas

## Paso 2 – Mapear cada flujo

Para cada handler anotá:
- Qué mensaje o botón inicia el flujo
- Qué pasos intermedios tiene
- Qué mensaje final recibe el usuario (éxito y error)
- Qué pasa si el usuario manda algo inesperado

## Paso 3 – Evaluar desde la perspectiva del usuario

Para cada flujo preguntate:
- ¿El mensaje inicial explica qué va a pasar?
- ¿Los textos de botones son autoexplicativos?
- ¿Hay pasos que podrían fusionarse o eliminarse?
- ¿Los mensajes de error dicen qué salió mal y qué hacer?
- ¿El tono es natural para un argentino no técnico?
- ¿Hay casos donde el bot no responde nada?

## Paso 4 – Generar el spec

Producí un spec con este formato:

---
## Spec UX – [fecha]

### RESUMEN
[2-3 líneas sobre el estado general]

### HALLAZGOS

| # | Prioridad | Flujo | Problema | Archivo:línea | Propuesta |
|---|-----------|-------|----------|---------------|-----------|
| 1 | ALTA | ... | ... | ... | ... |

### DETALLES (solo ítems ALTA)
- **Mensaje actual:** (copiado del código)
- **Mensaje propuesto:**
- **Por qué es mejor:**

---

No implementes ningún cambio. Al terminar decí: "Spec listo. Podés correr `/ux-fix` para aplicar los cambios."
