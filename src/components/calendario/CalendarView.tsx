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
import { ReservaTooltip } from '@/components/calendario/ReservaTooltip'
import { Button } from '@/components/ui/button'
import { MesPicker } from '@/components/ui/mes-picker'
import { Lock } from 'lucide-react'

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

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addMonthsISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function firstOfMonthISO(iso: string): string {
  return iso.slice(0, 7) + '-01'
}

// Ventana fija de meses que se renderiza de una sola vez: permite scrollear
// libremente entre meses adyacentes sin pasar por el selector
const WINDOW_MONTHS_BACK = 6
const WINDOW_MONTHS_FWD = 6
const WINDOW_MONTHS = WINDOW_MONTHS_BACK + WINDOW_MONTHS_FWD + 1

export function CalendarView() {
  const calRef = useRef<FullCalendar>(null)
  const calWrapperRef = useRef<HTMLDivElement>(null)
  const leftShadowRef = useRef<HTMLDivElement>(null)
  const rightShadowRef = useRef<HTMLDivElement>(null)
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
  const [bloqueoModal, setBloqueoModal] = useState<{ bloqueo?: Bloqueo } | null>(null)
  const [tooltip, setTooltip] = useState<{ reserva: Reserva; x: number; y: number } | null>(null)
  const [navDate, setNavDate] = useState(new Date())
  // tap1 como state solo para el banner (no afecta al calendario)
  const [tap1, setTap1State] = useState<{ resourceId: string; fechaISO: string } | null>(null)

  // Ventana de meses renderizada de una sola vez (fija para toda la vida del componente)
  const [windowStart] = useState(() => firstOfMonthISO(addMonthsISO(todayISO(), -WINDOW_MONTHS_BACK)))
  const windowEnd = addMonthsISO(windowStart, WINDOW_MONTHS - 1)
  // Mes actualmente visible (lo que el usuario ve al scrollear), independiente del state navDate
  const visibleMonthRef = useRef<string>(firstOfMonthISO(todayISO()))

  function setTap1(val: typeof tap1) {
    tap1Ref.current = val
    setTap1State(val)
  }

  function getScroller(): HTMLElement | null {
    const rootEl = (calRef.current?.getApi() as unknown as { el: HTMLElement } | undefined)?.el
    return rootEl?.querySelector<HTMLElement>('.fc-scroller:has(.fc-timeline-body)') ?? null
  }

  const scrollToISO = useCallback((iso: string) => {
    const scroller = getScroller()
    const cell = scroller?.querySelector<HTMLElement>(`[data-date="${iso}"]`)
    if (!scroller || !cell) return
    const scrollerRect = scroller.getBoundingClientRect()
    const cellRect = cell.getBoundingClientRect()
    scroller.scrollLeft += cellRect.left - scrollerRect.left
  }, [])

  function navigate(dir: 'prev' | 'next' | 'today') {
    if (dir === 'today') { scrollToISO(todayISO()); return }
    scrollToISO(addMonthsISO(visibleMonthRef.current, dir === 'next' ? 1 : -1))
  }

  function goToMonth(yearMonth: string) {
    if (!yearMonth) return
    const iso = yearMonth + '-01'
    if (iso < windowStart || iso > windowEnd) return
    scrollToISO(iso)
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
    setEvents([
      ...rs.filter(r => r.estado_reserva !== 'cancelada').map(reservaToEvent),
      ...bs.map(bloqueoToEvent),
    ])
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

  // Sombras a los costados del timeline que avisan si hay más para scrollear horizontalmente
  useEffect(() => {
    if (!mounted) return
    const wrapperEl = calWrapperRef.current
    const rootEl = (calRef.current?.getApi() as unknown as { el: HTMLElement } | undefined)?.el
    const scroller = rootEl?.querySelector<HTMLElement>('.fc-scroller:has(.fc-timeline-body)')
    if (!wrapperEl || !scroller) return

    function posicionar() {
      const wrapperRect = wrapperEl!.getBoundingClientRect()
      const scrollerRect = scroller!.getBoundingClientRect()
      const shadowWidth = 24
      if (leftShadowRef.current) {
        leftShadowRef.current.style.left = `${scrollerRect.left - wrapperRect.left}px`
        leftShadowRef.current.style.top = `${scrollerRect.top - wrapperRect.top}px`
        leftShadowRef.current.style.height = `${scrollerRect.height}px`
      }
      if (rightShadowRef.current) {
        rightShadowRef.current.style.left = `${scrollerRect.right - wrapperRect.left - shadowWidth}px`
        rightShadowRef.current.style.top = `${scrollerRect.top - wrapperRect.top}px`
        rightShadowRef.current.style.height = `${scrollerRect.height}px`
      }
    }

    function actualizarOpacidad() {
      const max = scroller!.scrollWidth - scroller!.clientWidth
      if (leftShadowRef.current) leftShadowRef.current.style.opacity = scroller!.scrollLeft > 2 ? '1' : '0'
      if (rightShadowRef.current) rightShadowRef.current.style.opacity = max > 2 && scroller!.scrollLeft < max - 2 ? '1' : '0'
    }

    // Detecta qué mes quedó visible en el borde izquierdo y actualiza el título del toolbar
    function actualizarMesVisible() {
      const rect = scroller!.getBoundingClientRect()
      const el = document.elementFromPoint(rect.left + 4, rect.top + rect.height / 2)
      const iso = el?.closest<HTMLElement>('[data-date]')?.dataset.date
      if (!iso) return
      const mes = firstOfMonthISO(iso)
      if (mes === visibleMonthRef.current) return
      visibleMonthRef.current = mes
      setNavDate(new Date(mes + 'T00:00:00'))
    }

    function onScroll() { actualizarOpacidad(); actualizarMesVisible() }

    posicionar()
    actualizarOpacidad()
    actualizarMesVisible()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(() => { posicionar(); actualizarOpacidad() })
    ro.observe(scroller)
    ro.observe(wrapperEl)

    return () => {
      scroller.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [mounted, events])

  // Al montar, centra el scroll en el día de hoy dentro de la ventana de meses cargada
  useEffect(() => {
    if (!mounted) return
    let tries = 0
    let raf = 0
    function tryScroll() {
      const scroller = getScroller()
      const cell = scroller?.querySelector(`[data-date="${todayISO()}"]`)
      if (cell) { scrollToISO(todayISO()); return }
      if (tries++ < 20) raf = requestAnimationFrame(tryScroll)
    }
    raf = requestAnimationFrame(tryScroll)
    return () => cancelAnimationFrame(raf)
  }, [mounted, scrollToISO])

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
    if (fechaISO < todayISO()) return
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
    clearSelection()
    setTooltip(null)
    if (props.tipo === 'bloqueo') {
      setBloqueoModal({ bloqueo: props.bloqueo! })
      return
    }
    setModal({ mode: 'view', reserva: props.reserva! })
  }, [clearSelection])

  const handleEventMouseEnter = useCallback((info: { event: { extendedProps: unknown }; el: HTMLElement }) => {
    const props = info.event.extendedProps as CalendarEvent['extendedProps']
    if (props.tipo !== 'reserva' || !props.reserva) return
    const rect = info.el.getBoundingClientRect()
    setTooltip({ reserva: props.reserva, x: rect.left + rect.width / 2, y: rect.bottom + 6 })
  }, [])

  const handleEventMouseLeave = useCallback(() => setTooltip(null), [])

  const handleEventClassNames = useCallback((arg: { event: { extendedProps: unknown } }) => {
    const props = arg.event.extendedProps as CalendarEvent['extendedProps']
    return props.tipo === 'reserva' && props.reserva?.estado_reserva === 'tentativa'
      ? ['fc-event-tentativa']
      : []
  }, [])

  const handleEventDidMount = useCallback((info: any) => {
    const { start, end } = info.event
    const res = info.event.getResources?.()[0]?.id
    if (!start || !end || !res) return

    const overlapping = info.view.calendar.getEvents().filter((ev: any) => {
      if (ev.id === info.event.id) return false
      if (ev.getResources?.()[0]?.id !== res) return false
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
        (a: any, b: any) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0) || a.id.localeCompare(b.id)
      )
      const myPos = group.findIndex((ev: any) => ev.id === info.event.id)
      const sublaneH = Math.floor(40 / group.length)
      // Restamos CSS_MARGIN para que margin-top no empuje el chip fuera del lane
      if (harness) harness.style.top = `${myPos * sublaneH - CSS_MARGIN}px`
    }
  }, [])

  const handleSaved = useCallback(() => {
    setModal(null)
    setBloqueoModal(null)
    calRef.current?.getApi().unselect()
    loadData()
  }, [loadData])

  return (
    <div className="flex flex-col h-full" onMouseMove={handleMouseMove}>
      <h1 className="px-4 pt-4 pb-1 text-lg font-semibold text-slate-800">Ocupación por casa</h1>

      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-slate-200">
        <MesPicker
          label={navTitulo}
          currentYear={navDate.getFullYear()}
          minYear={Number(windowStart.slice(0, 4))}
          maxYear={Number(windowEnd.slice(0, 4))}
          canPrev
          canNext
          onPrev={() => navigate('prev')}
          onNext={() => navigate('next')}
          isMonthEnabled={(year, i) => {
            const monthISO = `${year}-${String(i + 1).padStart(2, '0')}-01`
            return monthISO >= windowStart && monthISO <= windowEnd
          }}
          isMonthActive={(year, i) => navDate.getFullYear() === year && navDate.getMonth() === i}
          onSelectMonth={(year, i) => goToMonth(`${year}-${String(i + 1).padStart(2, '0')}`)}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('today')}
          className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer px-2"
        >
          Hoy
        </Button>
        <div className="md:ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="text-slate-500 border-slate-200 text-xs cursor-pointer"
            onClick={() => setBloqueoModal({})}
          >
            <Lock className="w-3.5 h-3.5 mr-1.5" />
            Bloquear fechas
          </Button>
        </div>
      </div>

      {/* Banner de selección activa — el contenedor queda siempre reservado para que el calendario no se reposicione */}
      <div className={`h-9 px-4 flex items-center justify-between text-xs transition-colors ${
        tap1 ? 'bg-indigo-50 border-b border-indigo-100 text-indigo-600' : 'border-b border-transparent'
      }`}>
        {tap1 && (
          <>
            <span>
              Casa {tap1.resourceId} · desde {toDDMMYYYY(tap1.fechaISO)} — hacé click en la fecha de salida
            </span>
            <button onClick={clearSelection} className="ml-3 text-indigo-400 hover:text-indigo-600 cursor-pointer">
              ✕
            </button>
          </>
        )}
      </div>

      {/* Calendar */}
      <div ref={calWrapperRef} className="relative px-6 pb-4">
        <div
          ref={leftShadowRef}
          className="pointer-events-none absolute z-10 w-6 opacity-0 transition-opacity duration-150"
          style={{ background: 'linear-gradient(to right, rgba(15,23,42,0.12), transparent)' }}
        />
        <div
          ref={rightShadowRef}
          className="pointer-events-none absolute z-10 w-6 opacity-0 transition-opacity duration-150"
          style={{ background: 'linear-gradient(to left, rgba(15,23,42,0.12), transparent)' }}
        />
        {mounted && (
          <FullCalendar
            ref={calRef}
            plugins={[resourceTimelinePlugin, interactionPlugin]}
            views={{ resourceTimelineMulti: { type: 'resourceTimeline', duration: { months: WINDOW_MONTHS } } }}
            initialView="resourceTimelineMulti"
            initialDate={windowStart}
            slotDuration={{ days: 1 }}
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
            eventMouseEnter={handleEventMouseEnter}
            eventMouseLeave={handleEventMouseLeave}
            eventOverlap
            eventClassNames={handleEventClassNames}
            eventDidMount={handleEventDidMount}
            contentHeight="auto"
            slotMinWidth={35}
            locale="es"
            firstDay={1}
            resourceAreaHeaderContent="Casa"
            slotLabelFormat={[{ month: 'long', year: 'numeric' }, { weekday: 'narrow' }, { day: 'numeric' }]}
          />
        )}
      </div>

      {tooltip && <ReservaTooltip reserva={tooltip.reserva} x={tooltip.x} y={tooltip.y} />}

      {modal && (
        <ReservaModal
          {...modal}
          reservas={reservas}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onRefresh={loadData}
        />
      )}

      {bloqueoModal && (
        <BloqueoModal
          bloqueo={bloqueoModal.bloqueo}
          onClose={() => setBloqueoModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
