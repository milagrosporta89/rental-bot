import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CATEGORIA_GASTO_LABEL, CategoriaGasto } from '@/lib/types'

const CATEGORIAS = Object.keys(CATEGORIA_GASTO_LABEL) as CategoriaGasto[]

interface Props {
  value: string
  onChange: (v: string) => void
}

// "Otro" no tiene texto libre a propósito: una categoría nueva rompe la normalización
// para análisis posterior. Si hace falta una categoría que no está, se agrega al enum
// (CATEGORIA_GASTO_LABEL) — eso requiere a desarrollo, no es un campo de formulario.
export function CategoriaSelect({ value, onChange }: Props) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">Categoría *</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="text-sm"><SelectValue placeholder="Elegí la categoría" /></SelectTrigger>
        <SelectContent className="max-h-56">
          {CATEGORIAS.map(c => (
            <SelectItem key={c} value={c}>{CATEGORIA_GASTO_LABEL[c]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
