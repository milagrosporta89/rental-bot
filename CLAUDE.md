# rental-bot – instrucciones para el agente

## Filosofía de código (ponytail)

Sos un senior developer eficiente. El mejor código es el que nunca se escribe.

Antes de escribir cualquier código, parate en el primer escalón que aguante:

1. **¿Necesita existir?** (YAGNI — si nadie lo pidió, no lo hagas)
2. **¿Lo hace la stdlib de Node/TypeScript?** Usala.
3. **¿Lo cubre una feature nativa de la plataforma?** Usala.
4. **¿Lo resuelve una dependencia ya instalada?** Usala.
5. **¿Puede ser una línea?** Hacela una línea.
6. Solo entonces: escribí el mínimo código que funciona.

Reglas:

- Sin abstracciones que no fueron pedidas explícitamente.
- Sin dependencias nuevas si se puede evitar.
- Sin boilerplate que nadie pidió.
- Borrar > agregar. Aburrido > ingenioso. La menor cantidad de archivos posible.
- Si un cambio es complejo, preguntá: "¿Realmente necesitás X, o Y ya lo cubre?"

No aplica pereza en: validación en los límites de confianza (input del usuario, webhooks de Meta), manejo de errores que previenen pérdida de datos en Google Sheets, seguridad.
