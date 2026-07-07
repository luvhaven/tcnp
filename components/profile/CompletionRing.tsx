"use client"

import { useEffect } from "react"
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"

/**
 * Animated circular progress ring for profile completion.
 * The stroke springs to `percent` and the number counts up in sync.
 * Colour shifts red → amber → emerald as completeness rises.
 */
export function CompletionRing({
  percent,
  size = 120,
  strokeWidth = 10,
  label = "Complete",
}: {
  percent: number
  size?: number
  strokeWidth?: number
  label?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const progress = useMotionValue(0)
  const spring = useSpring(progress, { stiffness: 90, damping: 20 })
  const dashOffset = useTransform(spring, (v) => circumference - (v / 100) * circumference)

  useEffect(() => {
    progress.set(Math.max(0, Math.min(100, percent)))
  }, [percent, progress])

  // Colour by completion band
  const color = percent >= 100 ? "#10b981" : percent >= 60 ? "#f59e0b" : "#ef4444"

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashOffset }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedPercent spring={spring} />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}

function AnimatedPercent({ spring }: { spring: ReturnType<typeof useSpring> }) {
  const rounded = useTransform(spring, (v) => `${Math.round(v)}%`)
  return <motion.span className="stat-figure text-2xl font-bold leading-none">{rounded}</motion.span>
}
