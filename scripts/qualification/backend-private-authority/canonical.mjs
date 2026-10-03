// Bounded, deliberately small canonical JSON profile. This is not general JCS.
import { types } from 'node:util'

export const MAX_CANONICAL_BYTES = 65536
const MAX_STRING_BYTES = 16384
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor'])
const refused = () => { throw new Error('CANONICAL_INPUT_REFUSED') }

function scalarString(value) {
  if (value.length > MAX_STRING_BYTES || Buffer.byteLength(value, 'utf8') > MAX_STRING_BYTES) refused()
  // Refuse lone surrogates rather than silently replacing or normalizing them.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) refused()
    } else if (code >= 0xdc00 && code <= 0xdfff) refused()
  }
  return JSON.stringify(value)
}

export function canonicalJson(value) {
  const active = new WeakSet()
  let nodes = 0, bytes = 0
  const add = text => {
    bytes += Buffer.byteLength(text, 'utf8')
    if (bytes > MAX_CANONICAL_BYTES) refused()
    return text
  }
  function encode(item, depth) {
    if (++nodes > 2048 || depth > 16) refused()
    if (item === null) return add('null')
    if (typeof item === 'boolean') return add(item ? 'true' : 'false')
    if (typeof item === 'string') return add(scalarString(item))
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item) || item < 0 || Object.is(item, -0)) refused()
      return add(String(item))
    }
    if (!item || typeof item !== 'object' || types.isProxy(item) || active.has(item)) refused()
    const array = Array.isArray(item), proto = Object.getPrototypeOf(item)
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) refused()
    active.add(item)
    const keys = Reflect.ownKeys(item)
    if (keys.length > 128 || keys.some(key => typeof key !== 'string')) refused()
    const descriptorValue = key => {
      if (forbiddenKeys.has(key)) refused()
      const descriptor = Object.getOwnPropertyDescriptor(item, key)
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) refused()
      return descriptor.value
    }
    let text
    if (array) {
      if (item.length > 64 || keys.length !== item.length + 1) refused()
      add('['); add(']')
      const parts = []
      for (let i = 0; i < item.length; i++) {
        if (i) add(',')
        parts.push(encode(descriptorValue(String(i)), depth + 1))
      }
      text = `[${parts.join(',')}]`
    } else {
      add('{'); add('}')
      const parts = keys.sort().map((key, index) => {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) refused()
        if (index) add(',')
        add(':')
        return `${add(scalarString(key))}:${encode(descriptorValue(key), depth + 1)}`
      })
      text = `{${parts.join(',')}}`
    }
    active.delete(item)
    return text
  }
  return encode(value, 0)
}

export function snapshotCanonical(value) {
  // No user callbacks, accessors, proxies, custom prototypes or toJSON execute.
  return JSON.parse(canonicalJson(value))
}

export function parseCanonicalJson(text) {
  // Strings only: no mutable buffers, coercions, custom decoders or shared memory.
  if (typeof text !== 'string' || text.length > MAX_CANONICAL_BYTES
    || Buffer.byteLength(text, 'utf8') > MAX_CANONICAL_BYTES) refused()
  let parsed
  try { parsed = JSON.parse(text) } catch { refused() }
  // Exact byte-equivalent roundtrip rejects duplicate keys, whitespace, escapes,
  // alternate numbers, unsorted keys and any unsupported structure.
  if (canonicalJson(parsed) !== text) refused()
  return parsed
}

export function exactKeys(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\n') === [...expected].sort().join('\n')
}
