// Host-owned inert input binding; the frozen675 helper remains unchanged.
import { types } from 'node:util'

export function bindHostInert(value, code) {
  try {
    const active = new WeakSet()
    const inspect = (item, depth = 0) => {
      if (item === null || typeof item === 'string' || typeof item === 'boolean'
        || (typeof item === 'number' && Number.isFinite(item))) return
      // Test BEFORE any getPrototypeOf/ownKeys/getOwnPropertyDescriptor. Even a
      // revoked or nested Proxy is refused without executing its traps.
      if (typeof item !== 'object' || types.isProxy(item) || depth > 64 || active.has(item)) throw new Error()
      const prototype = Object.getPrototypeOf(item)
      if (prototype !== Object.prototype && prototype !== null
        && !(Array.isArray(item) && prototype === Array.prototype)) throw new Error()
      active.add(item)
      for (const key of Reflect.ownKeys(item)) {
        if (typeof key !== 'string') throw new Error()
        if (Array.isArray(item) && key === 'length') continue
        const descriptor = Object.getOwnPropertyDescriptor(item, key)
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error()
        inspect(descriptor.value, depth + 1)
      }
      active.delete(item)
    }
    inspect(value)
    return structuredClone(value)
  } catch { throw new Error(code) }
}
