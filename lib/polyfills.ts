/**
 * Small runtime polyfills for older iPhones (iOS 15 and earlier Safari).
 *
 * Next.js only targets Safari 16.4+ by default. Officers still carry older
 * iPhones, and a missing API there fails silently: AbortSignal.timeout (iOS 16)
 * made the location-sharing switch throw before it ever reached the server,
 * so those officers never appeared on the live map. Loaded from
 * instrumentation-client.ts, before React hydrates.
 */

if (typeof window !== 'undefined') {
  // AbortSignal.timeout — Safari 16.0
  if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout !== 'function') {
    ;(AbortSignal as any).timeout = (ms: number) => {
      const controller = new AbortController()
      setTimeout(() => {
        try {
          controller.abort(new DOMException('The operation timed out.', 'TimeoutError'))
        } catch {
          controller.abort()
        }
      }, ms)
      return controller.signal
    }
  }

  // AbortSignal.any — Safari 17.4
  if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).any !== 'function') {
    ;(AbortSignal as any).any = (signals: AbortSignal[]) => {
      const controller = new AbortController()
      for (const signal of signals) {
        if (signal.aborted) {
          controller.abort((signal as any).reason)
          break
        }
        signal.addEventListener('abort', () => controller.abort((signal as any).reason), { once: true })
      }
      return controller.signal
    }
  }

  // Array/String.prototype.at — Safari 15.4
  const at = function (this: any, index: number) {
    const length = this.length
    const i = Math.trunc(index) || 0
    const k = i < 0 ? length + i : i
    return k < 0 || k >= length ? undefined : this[k]
  }
  if (!(Array.prototype as any).at) {
    Object.defineProperty(Array.prototype, 'at', { value: at, writable: true, configurable: true })
  }
  if (!(String.prototype as any).at) {
    Object.defineProperty(String.prototype, 'at', { value: at, writable: true, configurable: true })
  }

  // Object.hasOwn — Safari 15.4
  if (typeof (Object as any).hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      value: (obj: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(obj, key),
      writable: true,
      configurable: true,
    })
  }

  // crypto.randomUUID — Safari 15.4
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function' && typeof crypto.getRandomValues === 'function') {
    ;(crypto as any).randomUUID = () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
  }
}

export {}
