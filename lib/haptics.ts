/**
 * Device vibration with an iPhone fallback.
 *
 * Android uses the Vibration API. iPhone Safari has no Vibration API at all,
 * but since iOS 18 toggling a native `<input type="checkbox" switch>` plays the
 * system haptic tick. That only works inside a user gesture (a tap), so on
 * iPhone background alerts still rely on the push notification's own vibration.
 */

let iosSwitch: HTMLLabelElement | null = null

function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

function iosTick() {
  if (typeof document === 'undefined') return
  try {
    if (!iosSwitch) {
      const label = document.createElement('label')
      label.setAttribute('aria-hidden', 'true')
      label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.setAttribute('switch', '')
      input.tabIndex = -1
      label.appendChild(input)
      document.body.appendChild(label)
      iosSwitch = label
    }
    iosSwitch.click()
  } catch {
    /* Haptics are best-effort. */
  }
}

/** Vibrate with a pattern (ms). On iPhone, plays one haptic tick per pulse (gesture-only). */
export function haptic(pattern: number | number[] = 40): void {
  if (canVibrate()) {
    try { navigator.vibrate(pattern) } catch { /* ignore */ }
    return
  }
  const pulses = Array.isArray(pattern) ? pattern.filter((_, i) => i % 2 === 0).length : 1
  let delay = 0
  const steps = Array.isArray(pattern) ? pattern : [pattern]
  for (let i = 0; i < Math.min(pulses, 4); i++) {
    if (delay === 0) iosTick()
    else setTimeout(iosTick, delay)
    delay += (steps[i * 2] ?? 0) + (steps[i * 2 + 1] ?? 80)
  }
}

/** Short confirmation tap, e.g. a call sign was sent. */
export const hapticSuccess = () => haptic([30, 60, 30])
/** Attention pattern for an error or rejected action. */
export const hapticWarning = () => haptic([120, 80, 120])
