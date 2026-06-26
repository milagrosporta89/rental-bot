import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CATEGORIA_GASTO_LABEL, CategoriaGasto } from '@/lib/types'

const CATEGORIAS = Object.keys(CATEGORIA_GASTO_LABEL) as CategoriaGasto[]

interface Props {
  value: string
  otroValue: string
  onChange: (v: string) => void
  onChangeOtro: (v: string) => void
}

export function CategoriaSelect({ value, otroValue, onChange, onChangeOtro }: Props) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">Categoría *</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="text-sm"><SelectValue placeholder="Elegí la categoría" /></SelectTrigger>
        <SelectContent>
          {CATEGORIAS.map(c => (
            <SelectItem key={c} value={c}>{CATEGORIA_GASTO_LABEL[c]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === 'otro' && (
        <Input
          value={otroValue}
          onChange={e => onChangeOtro(e.target.value)}
          placeholder="Nombre de la categoría"
          className="text-sm mt-1.5"
          autoFocus
        />
      )}
    </div>
  )
}
