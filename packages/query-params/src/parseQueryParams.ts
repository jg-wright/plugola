import type { QueryParam, QueryParams } from './queryParams.js'

interface Options {
  /**
   * Merge result in to an object
   */
  into?: QueryParams
  /**
   * Custom merging logic
   */
  set?(
    queryParams: QueryParams,
    key: string,
    value: QueryParam | QueryParam[],
    info: SetInfo,
  ): QueryParams
}

/**
 * How a query parameter's value was derived, so a custom `set` can apply it
 * against something other than the query params parsed so far (for example,
 * appending `foo[+]=bar` to an existing config array).
 */
export interface SetInfo {
  operation: Operation
  /**
   * The decoded items named in the parameter, for the array operations.
   */
  items?: string[]
}

export type Operation =
  | 'set'
  | 'true'
  | 'false'
  | 'array'
  | 'prepend'
  | 'append'
  | 'remove'
  | 'flags'
  | 'json'

export default function parseQueryParams(
  searchString: string,
  { into = {}, set = (qp, k, v) => ({ ...qp, [k]: v }) }: Options = {},
) {
  searchString = searchString.replace(/^\?/, '')
  if (!searchString) return into

  try {
    return searchString
      .split('&')
      .reduce<QueryParams>((queryParams, searchParam) => {
        let [key, value] = splitOnce(searchParam, '=')

        key = decodeURIComponent(key)

        if (key.startsWith('!'))
          return set(queryParams, key.slice(1), false, { operation: 'false' })
        else if (value === undefined)
          return set(queryParams, key, true, { operation: 'true' })
        else if (key.endsWith('[]')) {
          const items = toArray(value)
          return set(queryParams, withoutEnd(key, 2), items, {
            operation: 'array',
            items,
          })
        } else if (key.endsWith('[^]')) {
          key = withoutEnd(key, 3)
          const items = toItems(value)
          return set(
            queryParams,
            key,
            [...items, ...asArray(queryParams[key])],
            { operation: 'prepend', items },
          )
        } else if (key.endsWith('[+]')) {
          key = withoutEnd(key, 3)
          const items = toItems(value)
          return set(
            queryParams,
            key,
            [...asArray(queryParams[key]), ...items],
            { operation: 'append', items },
          )
        } else if (key.endsWith('[-]')) {
          key = withoutEnd(key, 3)
          const items = toItems(value)
          return set(
            queryParams,
            key,
            removeFromArray(items, asArray(queryParams[key])),
            { operation: 'remove', items },
          )
        } else if (key.endsWith('{x}'))
          return set(queryParams, withoutEnd(key, 3), toFlags(value), {
            operation: 'flags',
          })
        else if (key.endsWith('{}'))
          return set(queryParams, withoutEnd(key, 2), fromJSON(value), {
            operation: 'json',
          })
        else
          return set(queryParams, key, decodeURIComponent(value), {
            operation: 'set',
          })
      }, into)
  } catch (error) {
    console.error('ads', error)
    return into
  }
}

function toArray(value: string) {
  return decodeURIComponent(value).split(',')
}

function toItems(value: string) {
  return (value || '').split(',').map(decodeURIComponent)
}

function asArray(queryParam: unknown): QueryParam[] {
  return Array.isArray(queryParam) ? queryParam : []
}

function removeFromArray(items: string[], queryParam: QueryParam[]) {
  return items.reduce((queryParam, item) => {
    const index: number = queryParam.indexOf(item)
    return index === -1
      ? queryParam
      : [...queryParam.slice(0, index), ...queryParam.slice(index + 1)]
  }, queryParam)
}

function toFlags(value: string) {
  const strs = toArray(value)
  return strs.reduce<Record<string, boolean>>((kvs, str) => {
    const v = !str.startsWith('!')
    kvs[v ? str : str.slice(1)] = v
    return kvs
  }, {})
}

function fromJSON(value: string) {
  return JSON.parse(decodeURIComponent(value))
}

function splitOnce(str: string, separator: string): [string, string?] {
  const index = str.indexOf(separator)
  return index === -1 ? [str] : [str.slice(0, index), str.slice(index + 1)]
}

function withoutEnd(str: string, charCount: number) {
  return str.slice(0, str.length - charCount)
}
