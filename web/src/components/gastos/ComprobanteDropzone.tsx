'use client'

import { useRef, useState } from 'react'
import { FileCheck2, Loader2, Upload, X } from 'lucide-react'

export type UploadState = 'idle' | 'uploading' | 'done' | 'error'

interface Props {
  uploadState: UploadState
  comprobanteUrl: string
  onFile: (file: File) => void
  onRemove: () => void
}

// Misma altura en los 4 estados (idle/uploading/done/error) para que completar
// la carga no haga "saltar" el resto de la pantalla.
export function ComprobanteDropzone({ uploadState, comprobanteUrl, onFile, onRemove }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const idle = uploadState === 'idle'

  return (
    <div className="space-y-1.5">
      <div
        onDragOver={idle ? e => { e.preventDefault(); setDragOver(true) } : undefined}
        onDragLeave={idle ? () => setDragOver(false) : undefined}
        onDrop={idle ? e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) } : undefined}
        onClick={idle ? () => fileRef.current?.click() : undefined}
        className={`w-full h-24 rounded-xl px-4 flex items-center justify-center transition-colors ${
          idle
            ? `border-2 border-dashed cursor-pointer ${dragOver ? 'border-indigo-400 bg-indigo-50 text-indigo-500' : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-500'}`
            : 'border border-slate-200 bg-slate-50'
        }`}
      >
        {idle && (
          <div className="flex flex-col items-center gap-1">
            <Upload className="w-4 h-4" />
            <span className="text-sm">Arrastrá o hacé click para subir</span>
            <span className="text-xs text-slate-300">JPG · PNG · PDF</span>
          </div>
        )}

        {uploadState === 'uploading' && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Procesando comprobante…
          </div>
        )}

        {(uploadState === 'done' || uploadState === 'error') && (
          <div className="flex items-center gap-4 w-full">
            {uploadState === 'done' && (
              comprobanteUrl ? (
                <a href={comprobanteUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 hover:bg-emerald-100 transition-colors">
                    <FileCheck2 className="w-6 h-6" />
                  </div>
                </a>
              ) : (
                <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 text-emerald-500">
                  <FileCheck2 className="w-6 h-6" />
                </div>
              )
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${uploadState === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                {uploadState === 'error' ? 'Error al procesar el archivo. Podés reintentar con otro.' : 'Comprobante procesado'}
              </p>
              {uploadState === 'done' && (
                <p className="text-xs text-slate-400 mt-0.5">Los campos se completaron automáticamente</p>
              )}
            </div>
            <button onClick={onRemove} className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
    </div>
  )
}
