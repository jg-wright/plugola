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
  ): QueryParams
}

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
        let [key, value] = searchParam.split('=', 2) as [
          string,
          string | undefined,
        ]

        key = decodeURIComponent(key)

        if (key.startsWith('!')) return set(queryParams, key.slice(1), false)
        else if (value === undefined) return set(queryParams, key, true)
        else if (key.endsWith('[]'))
          return set(queryParams, withoutEnd(key, 2), toArray(value))
        else if (key.endsWith('[^]')) {
          key = withoutEnd(key, 3)
          return set(queryParams, key, prependArray(value, queryParams[key]))
        } else if (key.endsWith('[+]')) {
          key = withoutEnd(key, 3)
          return set(queryParams, key, appendArray(value, queryParams[key]))
        } else if (key.endsWith('[-]')) {
          key = withoutEnd(key, 3)
          return set(queryParams, key, removeFromArray(value, queryParams[key]))
        } else if (key.endsWith('{x}'))
          return set(queryParams, withoutEnd(key, 3), toFlags(value))
        else if (key.endsWith('{}'))
          return set(queryParams, withoutEnd(key, 2), fromJSON(value))
        else return set(queryParams, key, decodeURIComponent(value))
      }, into)
  } catch (error) {
    console.error('ads', error)
    return into
  }
}

function toArray(value: string) {
  return decodeURIComponent(value).split(',')
}

function prependArray(value: string, queryParam: unknown) {
  return [
    ...(value || '').split(',').map(decodeURIComponent),
    ...(Array.isArray(queryParam) ? queryParam : []),
  ]
}

function appendArray(value: string, queryParam: unknown) {
  return [
    ...(Array.isArray(queryParam) ? queryParam : []),
    ...(value || '').split(',').map(decodeURIComponent),
  ]
}

function removeFromArray(value: string, queryParam: unknown) {
  return value
    .split(',')
    .map(decodeURIComponent)
    .reduce(
      (queryParam, item) => {
        const index: number = queryParam.indexOf(item)
        return index === -1
          ? queryParam
          : [...queryParam.slice(0, index), ...queryParam.slice(index + 1)]
      },
      Array.isArray(queryParam) ? queryParam : [],
    )
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

function withoutEnd(str: string, charCount: number) {
  return str.slice(0, str.length - charCount)
}
