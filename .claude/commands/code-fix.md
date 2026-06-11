# Code Fix – Limpiar código muerto y archivos sin uso

Implementá las limpiezas identificadas por `/code-quality`. Si no hay reporte en la conversación, pedí que se corra primero `/code-quality`.

## Antes de empezar

Si el reporte tiene muchos ítems preguntá:
> "¿Limpiamos todo o empezamos por los archivos a eliminar?"

Esperá confirmación antes de tocar cualquier cosa.

## Orden recomendado de trabajo

1. **Eliminar archivos marcados como `ELIMINAR`** — son los de menor riesgo
2. **Limpiar código muerto dentro de archivos activos** — imports, funciones, variables
3. **Archivar archivos marcados como `ARCHIVAR`** — moverlos a una carpeta `_archive/` en lugar de borrarlos, por si se necesitan consultar después

Los archivos `EVALUAR` no los toques sin confirmación explícita del usuario.

## Por cada ítem del reporte

### Eliminar un archivo
1. Verificá una última vez que no esté importado en ningún lado con una búsqueda de su nombre en el proyecto
2. Eliminalo
3. Anotalo en el reporte final

### Limpiar código muerto dentro de un archivo
1. Leé el archivo completo antes de editar
2. Eliminá el ítem puntual (import, función, variable, bloque comentado)
3. Verificá que el archivo compile sin errores lógicos obvios después del cambio
4. Si al eliminar una función descubrís que era llamada en algún lado que el análisis se perdió, **detenete y avisá** en lugar de seguir

### Archivar un archivo
1. Creá la carpeta `_archive/` en la raíz del proyecto si no existe
2. Mové el archivo manteniendo su ruta relativa dentro de `_archive/`  
   Ejemplo: `scripts/migration/migrate-paola.js` → `_archive/scripts/migration/migrate-paola.js`
3. Agregá `_archive/` al `.gitignore` si no está

## Lo que NO hacer
- No elimines nada marcado como `EVALUAR` sin confirmación
- No refactorices ni reorganices código más allá de lo que el reporte indica
- Si encontrás algo nuevo durante la limpieza, anotalo pero no lo toques en esta pasada

## Reporte final

### Eliminados
| Archivo | Acción |
|---------|--------|
| `src/webhook-server.ts` | Eliminado |

### Limpieza interna
| Archivo | Línea | Qué se eliminó |
|---------|-------|----------------|
| `src/utils.ts` | 45 | Función `parseOldDate()` sin uso |
| `src/handlers/cash.ts` | 88 | Variable `fallbackMsg` sin usar |

### Archivados
| Archivo original | Destino |
|-----------------|---------|
| `scripts/migration/migrate-paola.js` | `_archive/scripts/migration/migrate-paola.js` |

### No aplicado (requiere confirmación)
| Archivo | Razón |
|---------|-------|
| `scripts/analytics/db.js` | Marcado como EVALUAR — no está claro si tiene uso activo |

---

Al terminar decí:
> "Limpieza aplicada. Revisá el reporte y confirmame si querés proceder con los ítems pendientes."
