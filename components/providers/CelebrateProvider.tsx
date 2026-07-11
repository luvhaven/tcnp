"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check } from "lucide-react"

type CelebrateContextType = (message?: string) => void

const CelebrateContext = createContext<CelebrateContextType>(() => {})

const CONFETTI_COLORS = ["#F26522", "#22C55E", "#3B82F6", "#EAB308", "#EC4899", "#8B5CF6"]
const PARTICLE_COUNT = 14

/**
 * Checkmark draw-in + a small confetti burst — a brief, self-dismissing
 * overlay for genuinely celebratory moments (profile completion, a
 * milestone reached), distinct from the routine sonner toasts used for
 * ordinary "saved" confirmations.
 */
function Celebration({ message }: { message?: string }) {
  const particles = React.useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        angle: (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.4,
        distance: 60 + Math.random() * 40,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 5 + Math.random() * 4,
        rotate: Math.random() * 360,
      })),
    []
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/40 backdrop-blur-[2px]"
      />
      <div className="relative flex flex-col items-center gap-3">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute rounded-full"
            style={{ width: p.size, height: p.size, backgroundColor: p.color, top: "50%", left: "50%" }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: Math.cos(p.angle) * p.distance,
              y: Math.sin(p.angle) * p.distance,
              opacity: 0,
              rotate: p.rotate,
            }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
          />
        ))}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.15, 1] }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
        >
          <motion.div
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.25 }}
          >
            <Check className="h-8 w-8" strokeWidth={3} />
          </motion.div>
        </motion.div>
        {message && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-full bg-card px-4 py-1.5 text-sm font-semibold shadow-md"
          >
            {message}
          </motion.p>
        )}
      </div>
    </div>
  )
}

const CELEBRATE_DURATION_MS = 1800

export function CelebrateProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<{ message?: string; key: number } | null>(null)

  const celebrate = useCallback((message?: string) => {
    setActive({ message, key: Date.now() })
    setTimeout(() => setActive(null), CELEBRATE_DURATION_MS)
  }, [])

  return (
    <CelebrateContext.Provider value={celebrate}>
      {children}
      <AnimatePresence>
        {active && <Celebration key={active.key} message={active.message} />}
      </AnimatePresence>
    </CelebrateContext.Provider>
  )
}

export const useCelebrate = () => useContext(CelebrateContext)
