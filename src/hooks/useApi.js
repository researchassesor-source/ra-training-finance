import { useState, useCallback } from 'react'

export function useApi(apiFn) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const execute = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFn(...args)
      setData(res.data ?? res)
      return res
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [apiFn])

  return { data, loading, error, execute, setData }
}
