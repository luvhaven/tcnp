"use client"

import { useEffect, useRef } from "react"
import { useInView, useMotionValue, useSpring } from "framer-motion"

/**
 * Animated number — springs from 0 to `value` when scrolled into view,
 * and re-springs whenever `value` changes (e.g. realtime stat updates).
 * Renders tabular-nums so layout never shifts as digits change.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { damping: 28, stiffness: 120 })
  const inView = useInView(ref, { once: true, margin: "-10% 0px" })

  useEffect(() => {
    if (inView) motionValue.set(value)
  }, [inView, value, motionValue])

  useEffect(() => {
    const unsubscribe = spring.on("change", (latest) => {
      if (ref.current) ref.current.textContent = Math.round(latest).toLocaleString()
    })
    return unsubscribe
  }, [spring])

  return <span ref={ref} className={`stat-figure ${className ?? ""}`}>0</span>
}
