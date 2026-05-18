import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { searchTransactions } from '../api/transactions'
import { getPayeeAliases } from '../api/payees'
import { fmt, buildAliasMap, txBadgeClass } from '../utils'
import { useDebounced } from '../hooks'

export default function SearchModal({ householdId, onClose }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const debouncedQ = useDebounced(q, 300)

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['tx-search', householdId, debouncedQ],
    queryFn: () => searchTransactions(householdId, debouncedQ).then((r) => r.data),
    enabled: debouncedQ.length >= 2,
  })

  const { data: aliasesRaw = [] } = useQuery({
    queryKey: ['payees', householdId],
    queryFn: () => getPayeeAliases(householdId).then((r) => r.data),
    enabled: !!householdId,
  })
  const aliasMap = buildAliasMap(aliasesRaw)

  const goTo = (tx) => {
    const month = tx.date.slice(0, 7) + '-01'
    navigate(`/households/${householdId}/envelopes/${tx.envelope_id}?month=${month}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <span className="text-gray-400 text-lg">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all transactions…"
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
          />
          {isFetching && <span className="text-xs text-gray-400">Searching…</span>}
          <kbd className="text-xs text-gray-300 bg-gray-100 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {debouncedQ.length >= 2 && (
          <ul className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {results.length === 0 && !isFetching && (
              <li className="px-4 py-8 text-center text-sm text-gray-400">No transactions found.</li>
            )}
            {results.map((tx) => (
              <li
                key={tx.id}
                onClick={() => goTo(tx)}
                className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-gray-50 cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{aliasMap[tx.note] ?? tx.note ?? '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    <span className="text-indigo-500">{tx.envelope_name}</span>
                    {' · '}{tx.date}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${txBadgeClass(tx)}`}>
                    {tx.transfer_id ? '⇄ transfer' : tx.type}
                  </span>
                  <span className={`text-sm font-medium tabular-nums ${tx.type === 'credit' ? 'text-emerald-600' : 'text-gray-700'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{fmt(tx.amount)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {debouncedQ.length < 2 && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">Type at least 2 characters to search</div>
        )}
      </div>
    </div>
  )
}
