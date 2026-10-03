// Data is inspected before the first await; callbacks/accessors are never admitted.
export function bindInert(value, refusalCode) {
  try {
    const active = new WeakSet()
    function inspect(item, depth = 0) {
      if (item === null || typeof item === 'string' || typeof item === 'boolean'
        || (typeof item === 'number' && Number.isFinite(item))) return
      if (typeof item !== 'object' || depth > 64 || active.has(item)) throw new Error()
      const prototype = Object.getPrototypeOf(item)
      if (prototype !== Object.prototype && prototype !== null
        && !(Array.isArray(item) && prototype === Array.prototype)) throw new Error()
      active.add(item)
      for (const key of Reflect.ownKeys(item)) {
        if (typeof key !== 'string') throw new Error()
        if (Array.isArray(item) && key === 'length') continue
        const descriptor = Object.getOwnPropertyDescriptor(item, key)
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error()
        inspect(descriptor.value, depth + 1)
      }
      active.delete(item)
    }
    inspect(value)
    return structuredClone(value)
  } catch { throw new Error(refusalCode) }
}

export function exactKeys(object, keys) {
  return object !== null && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).sort().join('\n') === [...keys].sort().join('\n')
}
