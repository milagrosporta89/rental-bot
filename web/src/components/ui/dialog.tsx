"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-[overlay-in_180ms_ease-out] data-[state=closed]:animate-[overlay-out_240ms_ease-in-out]",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const dragRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{ startY: number; dragging: boolean }>({ startY: 0, dragging: false })

  // Deslizar hacia abajo para cerrar (como un bottom sheet nativo) — solo en mobile,
  // arrastrando desde la manija. Dispara el cierre real haciendo click en el botón
  // de cerrar (DialogPrimitive.Close) ya existente, en vez de duplicar el mecanismo de cierre.
  function onTouchStart(e: React.TouchEvent) {
    drag.current = { startY: e.touches[0].clientY, dragging: true }
    if (dragRef.current) dragRef.current.style.transition = "none"
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!drag.current.dragging || !dragRef.current) return
    const delta = e.touches[0].clientY - drag.current.startY
    if (delta > 0) dragRef.current.style.transform = `translateY(${delta}px)`
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!drag.current.dragging || !dragRef.current) return
    const delta = e.changedTouches[0].clientY - drag.current.startY
    drag.current.dragging = false
    if (delta > 80) {
      closeRef.current?.click()
      return
    }
    dragRef.current.style.transition = "transform 200ms ease-out"
    dragRef.current.style.transform = ""
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Mobile: bottom sheet (anclado abajo, ancho completo, solo esquinas superiores redondeadas).
          // sm+: modal centrado de siempre, sin cambios.
          "fixed inset-x-0 bottom-0 sm:inset-x-auto sm:left-[50%] sm:top-[50%] sm:bottom-auto z-50 flex flex-col w-full sm:max-w-lg max-h-[85dvh] sm:max-h-none overflow-hidden sm:translate-x-[-50%] sm:translate-y-[-50%] border bg-background shadow-lg rounded-t-2xl sm:rounded-lg data-[state=open]:animate-[sheet-in_220ms_ease-out] data-[state=closed]:animate-[sheet-out_280ms_ease-in-out] sm:animate-none",
          className
        )}
        {...props}
      >
        {/* Manija + cruz de cierre: fuera del área scrolleable, quedan fijas */}
        <div ref={dragRef} className="relative flex flex-col flex-1 min-h-0">
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="sm:hidden shrink-0 flex justify-center pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing"
          >
            <div className="h-1.5 w-10 rounded-full bg-slate-300" />
          </div>

          <DialogPrimitive.Close ref={closeRef} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          <div className="flex-1 min-h-0 overflow-y-auto grid gap-4 px-6 pb-6 pt-2 sm:pt-6">
            {children}
          </div>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // El primario va último en el JSX -> queda abajo en mobile (flex-col, sin reverse)
      // y a la derecha en sm+. Los botones ocupan todo el ancho en mobile.
      "flex flex-col gap-2 [&>button]:w-full sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2 sm:[&>button]:w-auto",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
