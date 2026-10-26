'use client'

import { Bell, MessageCircle, ShieldAlert, X } from 'lucide-react'

export function NotificationBanner({ title, message, category = 'update', saved = true, onOpen, onDismiss }: {
  title: string; message: string; category?: 'chat' | 'update' | 'emergency'; saved?: boolean; onOpen: () => void; onDismiss: () => void
}) {
  const Icon = category === 'chat' ? MessageCircle : category === 'emergency' ? ShieldAlert : Bell
  return <div className="flex w-[var(--width)] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-[20px] border border-border bg-card p-3 text-card-foreground shadow-lg" data-notification-banner>
    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${category === 'emergency' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}><Icon className="h-5 w-5" aria-hidden /></div>
    <button type="button" onClick={onOpen} className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      <span className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><span>TCNP</span><span aria-hidden>·</span><span>{category === 'emergency' ? 'Emergency' : 'Now'}</span></span>
      <span className="block break-words text-sm font-semibold leading-5">{title}</span>
      <span className="mt-1 line-clamp-2 break-words text-sm leading-5 text-muted-foreground">{message}</span>
      <span className="mt-2 block text-xs font-medium text-primary">{saved ? 'Tap to open · Saved in notifications' : 'Tap to open chat'}</span>
    </button>
    <button type="button" aria-label="Hide notification banner" onClick={onDismiss} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><X className="h-4 w-4" aria-hidden /></button>
  </div>
}
