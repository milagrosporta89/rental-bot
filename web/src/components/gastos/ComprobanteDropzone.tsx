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

export function ComprobanteDropzone({ uploadState, comprobanteUrl, onFile, onRemove }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  return (
    <div className="space-y-1.5">
      {uploadState === 'idle' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
          onClick={() => fileRef.current?.click()}
          className={`w-full border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
            dragOver
              ? 'border-indigo-400 bg-indigo-50 text-indigo-500'
              : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-500'
          }`}
        >
          <Upload className="w-5 h-5" />
          <span className="text-sm">Arrastrá o hacé click para subir</span>
          <span className="text-xs text-slate-300">JPG · PNG · PDF</span>
        </div>
      )}

      {uploadState === 'uploading' && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Procesando comprobante…
        </div>
      )}

      {(uploadState === 'done' || uploadState === 'error') && (
        <div className="flex items-center gap-4 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
          {uploadState === 'done' && (
            comprobanteUrl ? (
              <a href={comprobanteUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <div className="w-16 h-16 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 hover:bg-emerald-100 transition-colors">
                  <FileCheck2 className="w-8 h-8" />
                </div>
              </a>
            ) : (
              <div className="w-16 h-16 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 text-emerald-500">
                <FileCheck2 className="w-8 h-8" />
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
