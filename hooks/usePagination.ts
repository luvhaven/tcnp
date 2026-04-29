import { useState, useCallback } from 'react'

export interface UsePaginationOptions {
  pageSize?: number
}

export interface UsePaginationReturn {
  page: number
  pageSize: number
  from: number
  to: number
  hasMore: boolean
  setHasMore: (hasMore: boolean) => void
  nextPage: () => void
  prevPage: () => void
  resetPage: () => void
  getRange: () => { from: number; to: number }
}

/**
 * Generic pagination hook for Supabase queries.
 *
 * Usage:
 *   const { from, to, hasMore, nextPage, setHasMore } = usePagination({ pageSize: 50 })
 *   const { data } = await supabase.from('table').select('*').range(from, to)
 *   setHasMore(data.length === pageSize)
 */
export function usePagination({ pageSize = 50 }: UsePaginationOptions = {}): UsePaginationReturn {
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const from = page * pageSize
  const to = from + pageSize - 1

  const nextPage = useCallback(() => {
    if (hasMore) setPage((p) => p + 1)
  }, [hasMore])

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(0, p - 1))
  }, [])

  const resetPage = useCallback(() => {
    setPage(0)
    setHasMore(true)
  }, [])

  const getRange = useCallback(() => ({ from: page * pageSize, to: page * pageSize + pageSize - 1 }), [page, pageSize])

  return { page, pageSize, from, to, hasMore, setHasMore, nextPage, prevPage, resetPage, getRange }
}
