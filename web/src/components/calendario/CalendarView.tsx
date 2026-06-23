'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import resourceTimelinePlugin from '@fullcalendar/resource-timeline'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import { createClient } from '@/lib/supabase/client'
import { Reserva, Bloqueo, CalendarEvent } from '@/lib/types'
import { reservaToEvent, bloqueoToEvent } from '@/lib/calendar'
import { toDDMMYYYY } from '@/lib/dates'
import { BloqueoModal } from '@/components/modals/BloqueoModal'
import { ReservaModal } from '@/components/modals/ReservaModal'
import { Button } from '@/components/ui/button'
import { Lock, ChevronLeft, ChevronRight } from 'lucide-react'

const RESOURCES = [
  { id: '1', title: 'Casa 1' },
  { id: '2', title: 'Casa 2' },
  { id: '3', title: 'Casa 3' },
  { id: '4', title: 'Casa 4' },
  { id: '5', title: 'Casa 5' },
]


function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function CalendarView() {
  const calRef = useRef<FullCalendar>(null)
  const supabase = createClient()
  const rafRef = useRef<number | null>(null)
  const hoverRef = useRef<string | null>(null)
  // tap1 como ref para leerlo dentro del RAF sin dependencias de useCallback
  const tap1Ref = useRef<{ resourceId: string; fechaISO: string } | null>(null)

  type ModalState =
    | { mode: 'create'; casa: string; fechaEntrada: string; fechaSalida: string }
    | { mode: 'view'; reserva: Reserva }

  const [mounted, setMounted] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [modal, setModal] = useState<ModalState | null>(null)
  const [bloqueoOpen, setBloqueoOpen] = useState(false)
  const [navDate, setNavDate] = useState(new Date())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())
  // tap1 como state solo para el banner (no afecta al calendario)
  const [tap1, setTap1State] = useState<{ resourceId: string; fechaISO: string } | null>(null)

  function setTap1(val: typeof tap1) {
    tap1Ref.current = val
    setTap1State(val)
  }

  function navigate(dir: 'prev' | 'next' | 'today') {
    const api = calRef.current?.getApi()
    if (!api) return
    if (dir === 'today') api.today()
    else api[dir]()
    setNavDate(api.getDate())
  }

  function goToMonth(yearMonth: string) {
    const api = calRef.current?.getApi()
    if (!api || !yearMonth) return
    api.gotoDate(yearMonth + '-01')
    setNavDate(api.getDate())
  }

  const navTitulo = (() => {
    const mes = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(navDate)
    return mes.charAt(0).toUpperCase() + mes.slice(1) + ' ' + navDate.getFullYear()
  })()

  useEffect(() => { setMounted(true) }, [])

  const loadData = useCallback(async () => {
    const res = await fetch('/api/calendar-data')
    const { reservas: rs, bloqueos: bs } = await res.json() as { reservas: Reserva[]; bloqueos: Bloqueo[] }
    setReservas(rs)
    setEvents([...rs.map(reservaToEvent), ...bs.map(bloqueoToEvent)])
  }, [])

  useEffect(() => {
    loadData()
    const channel = supabase
      .channel('cal-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bloqueos' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  const clearSelection = useCallback(() => {
    setTap1(null)
    hoverRef.current = null
    calRef.current?.getApi().unselect()
  }, [])

  // Actualiza el highlight de FullCalendar via api.select() — sin re-render de eventos
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!tap1Ref.current) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const t = tap1Ref.current
      if (!t) return
      const el = (e.target as HTMLElement).closest?.('[data-date]') as HTMLElement | null
      const date = el?.dataset.date ?? null
      if (!date || date === hoverRef.current) return
      hoverRef.current = date

      const [startISO, endISO] = date >= t.fechaISO
        ? [t.fechaISO, date]
        : [date, t.fechaISO]

      calRef.current?.getApi().select({
        start: startISO,
        end: addDaysISO(endISO, 1),
        resourceId: t.resourceId,
      })
    })
  }, [])

  const handleDateClick = useCallback((arg: DateClickArg) => {
    const fechaISO = arg.dateStr.slice(0, 10)
    const resourceId = (arg.resource as { id: string } | null)?.id ?? '1'
    const t = tap1Ref.current

    if (!t) {
      // Primer click: muestra la celda seleccionada
      setTap1({ resourceId, fechaISO })
      calRef.current?.getApi().select({
        start: fechaISO,
        end: addDaysISO(fechaISO, 1),
        resourceId,
      })
      return
    }

    if (t.resourceId !== resourceId) {
      // Distinta casa: reinicia
      setTap1({ resourceId, fechaISO })
      calRef.current?.getApi().select({
        start: fechaISO,
        end: addDaysISO(fechaISO, 1),
        resourceId,
      })
      return
    }

    // Segundo click: fija el rango final y abre el modal
    const [startISO, endISO] = fechaISO >= t.fechaISO
      ? [t.fechaISO, fechaISO]
      : [fechaISO, t.fechaISO]

    tap1Ref.current = null
    setTap1State(null)
    hoverRef.current = null

    if (startISO === endISO) {
      calRef.current?.getApi().unselect()
      return
    }

    // Fija el highlight exacto del rango seleccionado
    calRef.current?.getApi().select({
      start: startISO,
      end: addDaysISO(endISO, 1),
      resourceId,
    })

    clearSelection()
    setModal({ mode: 'create', casa: resourceId, fechaEntrada: toDDMMYYYY(startISO), fechaSalida: toDDMMYYYY(endISO) })
  }, [clearSelection])

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const props = arg.event.extendedProps as CalendarEvent['extendedProps']
    if (props.tipo === 'bloqueo') return
    clearSelection()
    setModal({ mode: 'view', reserva: props.reserva! })
  }, [clearSelection])

  const handleSaved = useCallback(() => {
    setModal(null)
    setBloqueoOpen(false)
    calRef.current?.getApi().unselect()
    loadData()
  }, [loadData])

  return (
    <div className="flex flex-col h-full" onMouseMove={handleMouseMove}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate('prev')}
            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="relative">
            <button
              onClick={() => { setPickerOpen(o => !o); setPickerYear(navDate.getFullYear()) }}
              className="text-sm font-medium text-slate-700 min-w-[130px] text-center px-2 py-1 rounded hover:bg-slate-100 cursor-pointer"
            >
              {navTitulo}
            </button>
            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-50 w-52">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <button
                      onClick={() => setPickerYear(y => y - 1)}
                      className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-medium text-slate-700">{pickerYear}</span>
                    <button
                      onClick={() => setPickerYear(y => y + 1)}
                      className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m, i) => {
                      const active = navDate.getFullYear() === pickerYear && navDate.getMonth() === i
                      return (
                        <button
                          key={m}
                          onClick={() => { goToMonth(`${pickerYear}-${String(i + 1).padStart(2, '0')}`); setPickerOpen(false) }}
                          className={`text-xs py-1.5 rounded-lg cursor-pointer transition-colors ${active ? 'bg-indigo-600 text-white font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          {m}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => navigate('next')}
            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('today')}
          className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer px-2"
        >
          Hoy
        </Button>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="text-slate-500 border-slate-200 text-xs cursor-pointer"
            onClick={() => setBloqueoOpen(true)}
          >
            <Lock className="w-3.5 h-3.5 mr-1.5" />
            Bloquear fechas
          </Button>
        </div>
      </div>

      {/* Banner de selección activa */}
      {tap1 && (
        <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2 text-xs text-indigo-600 flex items-center justify-between">
          <span>
            Casa {tap1.resourceId} · desde {toDDMMYYYY(tap1.fechaISO)} — hacé click en la fecha de salida
          </span>
          <button onClick={clearSelection} className="ml-3 text-indigo-400 hover:text-indigo-600 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Calendar */}
      <div className="px-2 pb-2">
        {mounted && (
          <FullCalendar
            ref={calRef}
            plugins={[resourceTimelinePlugin, interactionPlugin]}
            initialView="resourceTimelineMonth"
            schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
            resources={RESOURCES}
            events={events}
            resourceAreaWidth="90px"
            nowIndicator
            headerToolbar={false}
            selectable
            unselectAuto={false}
            selectMirror={false}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            eventOverlap
            eventDidMount={(info) => {
              const { start, end } = info.event
              const res = (info.event as any).getResources?.()[0]?.id
              if (!start || !end || !res) return

              const overlapping = info.view.calendar.getEvents().filter(ev => {
                if (ev.id === info.event.id) return false
                if ((ev as any).getResources?.()[0]?.id !== res) return false
                const s = ev.start, e = ev.end
                return !!s && !!e && s < end && e > start
              })

              const harness = info.el.closest('.fc-timeline-event-harness') as HTMLElement | null
              // CSS agrega margin-top: 4px al harness — compensar en todos los cálculos de top
              const CSS_MARGIN = 4

              if (overlapping.length === 0) {
                // Chip único: agregar 4px extra al top (además del CSS margin)
                if (harness) harness.style.top = '4px'
              } else {
                info.el.classList.add('fc-event-stacked')
                const group = [info.event, ...overlapping].sort(
                  (a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0) || a.id.localeCompare(b.id)
                )
                const myPos = group.findIndex(ev => ev.id === info.event.id)
                const sublaneH = Math.floor(40 / group.length)
                // Restamos CSS_MARGIN para que margin-top no empuje el chip fuera del lane
                if (harness) harness.style.top = `${myPos * sublaneH - CSS_MARGIN}px`
              }
            }}
            contentHeight="auto"
            slotMinWidth={35}
            locale="es"
            firstDay={1}
            resourceAreaHeaderContent="Casa"
            slotLabelFormat={[{ weekday: 'narrow' }, { day: 'numeric' }]}
          />
        )}
      </div>

      {modal && (
        <ReservaModal
          {...modal}
          reservas={reservas}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {bloqueoOpen && (
        <BloqueoModal
          onClose={() => setBloqueoOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
