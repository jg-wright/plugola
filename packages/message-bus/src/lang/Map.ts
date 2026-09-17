export function getOrInsert<K, V>(map: Map<K, V>, key: K, defaultValue: V) {
  if (!map.has(key)) map.set(key, defaultValue)
  return map.get(key)!
}
