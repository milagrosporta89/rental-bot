'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from './input'
import { Label } from './label'

interface Props {
  name: string
  label: string
  autoComplete?: string
  autoFocus?: boolean
}

export function InputPassword({ name, label, autoComplete, autoFocus }: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      <div className="relative">
        <Input
          name={name}
          type={visible ? 'text' : 'password'}
          required
          className="text-sm pr-9"
          autoComplete={autoComplete}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          tabIndex={-1}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
