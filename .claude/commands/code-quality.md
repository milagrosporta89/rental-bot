# Code Quality – Auditoría de código muerto y archivos sin uso

Actuá como un ingeniero de software revisando el proyecto **rental-bot** en busca de código que ya no cumple ninguna función. El objetivo es identificar qué se puede eliminar con seguridad, sin romper nada.

---

## Paso 1 – Construir el mapa de archivos activos

El punto de entrada del bot es `src/index.ts`. Seguí el árbol de imports desde ahí:

1. Lee `src/index.ts` y anotá todos los imports
2. Por cada import, lee ese archivo y anotá sus imports
3. Repetí hasta cubrir todo el árbol de dependencias reales

Hacé lo mismo para `dashboard/server/src/index.ts` (punto de entrada del dashboard).

Al terminar tenés la lista de **archivos activos** (reachable desde un entry point).

---

## Paso 2 – Detectar archivos sin uso

Listá **todos** los archivos `.ts` y `.js` del proyecto (excluí `node_modules`, `dist`, `.claude`).

Comparalos con los archivos activos del Paso 1. Los que no aparecen en el árbol de imports son **candidatos a eliminar**.

Para cada archivo candidato verificá:
- ¿Está mencionado en `package.json` (scripts, main)?
- ¿Está en algún script de `scripts/` que se corra manualmente?
- ¿Es un archivo de config reconocible (`jest.config.js`, `vite.config.ts`, etc.)?

Clasificá cada archivo candidato como:
- `ELIMINAR` — no es alcanzable por nadie, no es config
- `ARCHIVAR` — fue útil una vez (migration, setup ya ejecutado), no se necesita más
- `EVALUAR` — script manual que puede o no tener uso futuro

---

## Paso 3 – Detectar código muerto dentro de archivos activos

Para cada archivo activo en `src/`, analizá internamente:

**Imports sin usar**
- ¿Hay imports declarados que no se usan en el cuerpo del archivo?

**Funciones/métodos exportados sin usar**
- ¿Hay funciones exportadas que ningún otro archivo importa?
- Verificá contra el árbol de imports del Paso 1

**Funciones internas sin llamar**
- ¿Hay funciones definidas dentro del archivo que nunca se invocan?

**Variables y constantes sin referenciar**
- ¿Hay `const` o `let` declarados que no se leen en ningún lado?

**Código comentado**
- Bloques de código comentado que ya no son necesarios

**Parámetros no usados en funciones activas**
- Parámetros que se reciben pero nunca se leen dentro de la función

---

## Paso 4 – Generar el reporte

Producí el reporte en este formato:

---

## Reporte de calidad – [fecha]

### ARCHIVOS SIN USO

| Archivo | Clasificación | Razón |
|---------|--------------|-------|
| `src/webhook-server.ts` | ELIMINAR | No importado desde ningún entry point |
| `scripts/migration/migrate-paola.js` | ARCHIVAR | Migración ya ejecutada |

### CÓDIGO MUERTO EN ARCHIVOS ACTIVOS

#### `src/utils.ts`
- **Línea 45** – función `parseOldDate()` exportada pero no importada en ningún archivo
- **Línea 12** – import `{ format }` de `date-fns` no se usa en el archivo

#### `src/handlers/cash.ts`
- **Línea 88** – variable `const fallbackMsg` declarada pero nunca leída
- **Líneas 102-110** – bloque comentado (código de flujo anterior)

_(continuar por cada archivo con hallazgos)_

### RESUMEN

| Categoría | Cantidad |
|-----------|----------|
| Archivos a eliminar | N |
| Archivos a archivar | N |
| Archivos a evaluar | N |
| Imports sin usar | N |
| Funciones muertas | N |
| Variables sin usar | N |
| Bloques comentados | N |

---

## Al terminar

Decí:
> "Reporte listo. Podés correr `/code-fix` para limpiar los hallazgos, o indicame qué ítems querés aplicar primero."

---

## Restricciones

- No elimines ni modifiques ningún archivo. Solo analizás y reportás.
- Si un símbolo es difícil de rastrear (ej: se usa con `require` dinámico o por nombre de string), marcalo como `EVALUAR` con una nota, no como muerto.
- Los archivos de test en `src/__tests__/` tienen sus propias reglas: un helper de test no necesita ser importado por el código productivo para ser válido.
