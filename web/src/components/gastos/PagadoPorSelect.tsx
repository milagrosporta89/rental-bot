import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TITULARES_PAGADOR } from '@/lib/types'

interface Props {
  value: string
  otroValue: string
  readonly?: boolean
  onChange: (v: string) => void
  onChangeOtro: (v: string) => void
}

export function PagadoPorSelect({ value, otroValue, readonly, onChange, onChangeOtro }: Props) {
  const esOtro = value === 'otro'

  if (readonly) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Pagado por *</Label>
        <Input value={esOtro ? otroValue : value} readOnly className="text-sm bg-slate-50 text-slate-500 cursor-default" />
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">Pagado por *</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="text-sm"><SelectValue placeholder="Elegí quién pagó" /></SelectTrigger>
        <SelectContent className="max-h-56">
          {TITULARES_PAGADOR.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          <SelectItem value="otro">Otro…</SelectItem>
        </SelectContent>
      </Select>
      {esOtro && (
        <Input
          value={otroValue}
          onChange={e => onChangeOtro(e.target.value)}
          placeholder="Nombre de quién pagó"
          className="text-sm mt-1.5"
          autoFocus
        />
      )}
    </div>
  )
}
