import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPeriod, updatePeriod } from '../api/periods'
import { updateEnvelope } from '../api/envelopes'
import { fmt, ENVELOPE_TYPES } from '../utils'

export default function BudgetTable({ envelopes, periodByEnvelope, householdId, month, totalIncome = 0 }) {
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState({})
  const [editingTarget, setEditingTarget] = useState(null)
  const [targetDraft, setTargetDraft] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())

  useEffect(() => {
    const init = {}
    envelopes.forEach((env) => {
      const p = periodByEnvelope[env.id]
      init[env.id] = p ? String(parseFloat(p.allocated).toFixed(2)) : ''
    })
    setDrafts(init)
  }, [month, envelopes, periodByEnvelope])

  const invalidatePeriods = () => qc.invalidateQueries({ queryKey: ['periods', householdId] })

  const saveMutation = useMutation({
    mutationFn: ({ envId, amount }) => {
      const period = periodByEnvelope[envId]
      if (period) return updatePeriod(householdId, envId, period.id, { allocated: amount })
      return createPeriod(householdId, envId, { month, allocated: amount })
    },
    onSuccess: invalidatePeriods,
  })

  const saveTargetMutation = useMutation({
    mutationFn: ({ envId, pct }) => updateEnvelope(householdId, envId, { income_pct_target: pct }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['envelopes', householdId] }),
  })

  const handleBlur = (envId) => {
    const raw = drafts[envId]
    const amount = parseFloat(raw)
    if (isNaN(amount) || amount < 0) return
    const period = periodByEnvelope[envId]
    const current = period ? parseFloat(period.allocated) : null
    if (current === amount) return
    saveMutation.mutate({ envId, amount })
  }

  const handleKey = (e, envId) => {
    if (e.key === 'Enter') e.target.blur()
    if (e.key === 'Escape') {
      const period = periodByEnvelope[envId]
      setDrafts((d) => ({ ...d, [envId]: period ? String(parseFloat(period.allocated).toFixed(2)) : '' }))
      e.target.blur()
    }
  }

  const startEditTarget = (env) => {
    setTargetDraft(env.income_pct_target != null ? String(parseFloat(env.income_pct_target)) : '')
    setEditingTarget(env.id)
  }

  const commitTarget = (envId) => {
    const pct = targetDraft === '' ? null : parseFloat(targetDraft)
    if (pct !== null && (isNaN(pct) || pct < 0 || pct > 100)) {
      setEditingTarget(null)
      return
    }
    saveTargetMutation.mutate({ envId, pct })
    setEditingTarget(null)
  }

  const handleTargetKey = (e, envId) => {
    if (e.key === 'Enter') e.target.blur()
    if (e.key === 'Escape') setEditingTarget(null)
  }

  const toggleGroup = (g) => setCollapsedGroups((prev) => {
    const next = new Set(prev)
    if (next.has(g)) next.delete(g); else next.add(g)
    return next
  })

  const groupMap = {}
  const seenOrder = []
  for (const env of envelopes) {
    const g = env.group_name || ''
    if (!groupMap[g]) { groupMap[g] = []; seenOrder.push(g) }
    groupMap[g].push(env)
  }
  const groups = [...seenOrder.filter(Boolean), '']
    .filter((g) => groupMap[g]?.length)
    .map((g) => {
      const items = groupMap[g]
      let gAllocated = 0, gSpent = 0, gBalance = 0
      for (const e of items) {
        const p = periodByEnvelope[e.id]
        if (p) {
          gAllocated += parseFloat(p.allocated)
          gSpent += parseFloat(p.spent)
          gBalance += parseFloat(p.balance)
        }
      }
      return { group: g, items, gAllocated, gSpent, gBalance }
    })

  const totalAllocated = envelopes.reduce((s, e) => {
    const p = periodByEnvelope[e.id]
    return s + (p ? parseFloat(p.allocated) : 0)
  }, 0)
  const totalSpent = envelopes.reduce((s, e) => {
    const p = periodByEnvelope[e.id]
    return s + (p ? parseFloat(p.spent) : 0)
  }, 0)
  const totalBalance = envelopes.reduce((s, e) => {
    const p = periodByEnvelope[e.id]
    return s + (p ? parseFloat(p.balance) : 0)
  }, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
<table className="w-full text-sm">
        <thead>
          <tr className="text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2.5 text-left">Envelope</th>
            <th className="px-4 py-2.5 text-right">Rollover</th>
            <th className="px-4 py-2.5 text-right w-44">Allocated</th>
            <th className="px-4 py-2.5 text-right">Spent</th>
            <th className="px-4 py-2.5 text-right">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {groups.map(({ group, items, gAllocated, gSpent, gBalance }) => (
            <>
              {group && (
                <tr
                  key={`group-${group}`}
                  className="bg-gray-50/60 cursor-pointer hover:bg-gray-100/60 transition-colors select-none"
                  onClick={() => toggleGroup(group)}
                >
                  <td className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-widest">
                    <span className="mr-1.5 text-[10px]">{collapsedGroups.has(group) ? '▶' : '▼'}</span>
                    {group}
                  </td>
                  <td />
                  <td className="px-4 py-1.5 text-right text-xs font-semibold text-gray-400 tabular-nums">{fmt(gAllocated)}</td>
                  <td className="px-4 py-1.5 text-right text-xs font-semibold text-gray-400 tabular-nums">{fmt(gSpent)}</td>
                  <td className={`px-4 py-1.5 text-right text-xs font-semibold tabular-nums ${gBalance < 0 ? 'text-rose-500' : gBalance === 0 ? 'text-gray-400' : 'text-emerald-600'}`}>{fmt(gBalance)}</td>
                </tr>
              )}
              {!collapsedGroups.has(group) && items.map((env) => {
                const p = periodByEnvelope[env.id]
                const balance = p ? parseFloat(p.balance) : null
                const rollover = p ? parseFloat(p.rollover) : 0
                const spent = p ? parseFloat(p.spent) : 0

                const hasPct = env.income_pct_target != null
                const targetAmt = hasPct && totalIncome > 0
                  ? (parseFloat(env.income_pct_target) / 100) * totalIncome
                  : null
                const savedAllocated = p ? parseFloat(p.allocated) : 0
                const onTarget = targetAmt !== null && savedAllocated > 0
                  && Math.abs(savedAllocated - targetAmt) / targetAmt <= 0.05

                return (
                  <tr key={env.id} className={`hover:bg-gray-50 transition-colors group ${env.is_protected ? 'bg-slate-50/60' : ''}`}>
                    <td className="px-4 py-2.5 text-gray-800 font-medium">
                      <div className="flex items-center gap-2">
                        {env.envelope_type && (
                          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${ENVELOPE_TYPES[env.envelope_type]?.dot ?? 'bg-gray-300'}`} />
                        )}
                        {env.name}
                        {env.is_protected && (
                          <span className="text-xs text-slate-400" title="Protected">🔒</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">
                      {rollover !== 0 ? fmt(rollover) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={drafts[env.id] ?? ''}
                            onChange={(e) => setDrafts((d) => ({ ...d, [env.id]: e.target.value }))}
                            onBlur={() => handleBlur(env.id)}
                            onKeyDown={(e) => handleKey(e, env.id)}
                            placeholder="0.00"
                            className={`w-24 border rounded-lg px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-colors ${
                              onTarget
                                ? 'border-emerald-300 bg-emerald-50/40'
                                : 'border-gray-200'
                            }`}
                          />
                        </div>

                        {editingTarget === env.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={targetDraft}
                              onChange={(e) => setTargetDraft(e.target.value)}
                              onBlur={() => commitTarget(env.id)}
                              onKeyDown={(e) => handleTargetKey(e, env.id)}
                              placeholder="0"
                              className="w-12 border border-indigo-300 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                            <span className="text-xs text-gray-400">%</span>
                            {targetDraft && totalIncome > 0 && (
                              <span className="text-xs text-gray-400">
                                = {fmt((parseFloat(targetDraft) / 100) * totalIncome)}
                              </span>
                            )}
                          </div>
                        ) : hasPct ? (
                          <button
                            onClick={() => startEditTarget(env)}
                            className={`text-xs tabular-nums transition-colors ${
                              onTarget ? 'text-emerald-500 hover:text-emerald-700' : 'text-gray-400 hover:text-indigo-500'
                            }`}
                          >
                            {parseFloat(env.income_pct_target)}%
                            {targetAmt !== null && ` = ${fmt(targetAmt)}`}
                          </button>
                        ) : (
                          <button
                            onClick={() => startEditTarget(env)}
                            className="text-xs text-gray-300 hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            set %
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {p ? fmt(spent) : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                      balance === null ? 'text-gray-300' :
                      balance < 0 ? 'text-rose-600' :
                      balance === 0 ? 'text-gray-400' : 'text-emerald-600'
                    }`}>
                      {balance !== null ? fmt(balance) : '—'}
                    </td>
                  </tr>
                )
              })}
            </>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-100 bg-gray-50 font-semibold text-sm">
            <td className="px-4 py-2.5 text-gray-700">Total</td>
            <td />
            <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(totalAllocated)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmt(totalSpent)}</td>
            <td className={`px-4 py-2.5 text-right tabular-nums ${
              totalBalance < 0 ? 'text-rose-600' : totalBalance === 0 ? 'text-gray-400' : 'text-emerald-600'
            }`}>{fmt(totalBalance)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
