/** Reads a record's value as JSON, or `undefined` if it isn't any. */
export function parseValue(value: Uint8Array | string | null): unknown {
  if (value === null) return undefined
  try {
    return JSON.parse(typeof value === 'string' ? value : decoder.decode(value))
  } catch {
    return undefined
  }
}

const decoder = new TextDecoder()
