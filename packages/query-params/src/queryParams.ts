import parseQueryParams from './parseQueryParams.js'

export type QueryParam =
  | string
  | boolean
  | number
  | Record<string, boolean | number>

export type QueryParams = Record<string, QueryParam | QueryParam[]>

const queryParams = {
  ...(typeof process !== 'undefined' && process.env?.PLUGOLA_QUERY
    ? parseQueryParams(process.env.PLUGOLA_QUERY)
    : {}),
  ...(typeof location !== 'undefined' ? parseQueryParams(location.search) : {}),
}

export default queryParams
