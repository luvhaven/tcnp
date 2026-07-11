"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"

type ConfirmOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  requireInput?: string
}

type ConfirmContextType = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmContextType>(() => Promise.resolve(false))

/**
 * Trash-can delete animation — lid swings open, the item drops in and
 * dissolves into a few particles, then the can gives a satisfied little
 * bounce. Plays for every destructive confirmation across the app (users,
 * programs, Papas, journeys, vehicles, venues, messages, etc.) since they
 * all resolve through this one dialog.
 */
function DeleteAnimation() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6">
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
        {/* Falling item */}
        <motion.rect
          x="10.5" y="2" width="3" height="4" rx="0.5"
          fill="currentColor"
          className="text-muted-foreground"
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: 9, opacity: 0 }}
          transition={{ duration: 0.45, delay: 0.35, ease: "easeIn" }}
        />
        {/* Can body */}
        <motion.g
          initial={{ x: 0 }}
          animate={{ x: [0, -0.6, 0.6, -0.4, 0] }}
          transition={{ duration: 0.4, delay: 0.75, ease: "easeInOut" }}
        >
          <path
            d="M6 8.5L7 20.5C7.05 21.3 7.7 22 8.5 22H15.5C16.3 22 16.95 21.3 17 20.5L18 8.5"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            className="text-destructive"
            fill="none"
          />
          <path d="M9.5 11.5V18.5M12 11.5V18.5M14.5 11.5V18.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-destructive/60" />
        </motion.g>
        {/* Lid — swings open then settles back */}
        <motion.line
          x1="4" y1="8" x2="20" y2="8"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          className="text-destructive"
          style={{ transformOrigin: "12px 8px" }}
          initial={{ rotate: 0 }}
          animate={{ rotate: [0, -22, -22, 0] }}
          transition={{ duration: 0.7, delay: 0.05, times: [0, 0.35, 0.75, 1], ease: "easeInOut" }}
        />
      </svg>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="text-sm font-medium text-muted-foreground"
      >
        Deleting…
      </motion.p>
    </div>
  )
}

const DELETE_ANIMATION_MS = 1050

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [inputText, setInputText] = useState("")
  const [resolver, setResolver] = useState<(value: boolean) => void>()
  const [deleting, setDeleting] = useState(false)

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts)
    setInputText("")
    setDeleting(false)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve)
    })
  }, [])

  const handleClose = (value: boolean) => {
    // Cancelling, or a non-destructive confirmation — close immediately.
    if (!value || options?.variant !== "destructive") {
      setOpen(false)
      resolver?.(value)
      return
    }
    // Confirmed a destructive action — play the delete animation, then
    // resolve so the caller's mutation fires right as the dialog closes.
    setDeleting(true)
    setTimeout(() => {
      setOpen(false)
      resolver?.(true)
    }, DELETE_ANIMATION_MS)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !deleting) handleClose(false) }}>
        <DialogContent className="sm:max-w-[425px]">
          <AnimatePresence mode="wait">
            {deleting ? (
              <motion.div key="deleting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <DeleteAnimation />
              </motion.div>
            ) : (
              <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <DialogHeader>
                  <DialogTitle>{options?.title || "Confirm Action"}</DialogTitle>
                  <DialogDescription className="py-4 text-base space-y-4">
                    <div>{options?.message}</div>
                    {options?.requireInput && (
                      <div className="space-y-2 mt-4">
                        <p className="text-sm font-medium text-foreground">
                          Please type <strong>{options.requireInput}</strong> to confirm.
                        </p>
                        <label htmlFor="confirm-input" className="sr-only">Type confirmation string</label>
                        <input
                          id="confirm-input"
                          type="text"
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          placeholder={options.requireInput}
                          autoComplete="off"
                        />
                      </div>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-4 gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => handleClose(false)}>
                    {options?.cancelText || "Cancel"}
                  </Button>
                  <Button
                    variant={options?.variant || "default"}
                    onClick={() => handleClose(true)}
                    disabled={!!options?.requireInput && inputText !== options.requireInput}
                  >
                    {options?.confirmText || "Confirm"}
                  </Button>
                </DialogFooter>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider")
  }
  return context
}
