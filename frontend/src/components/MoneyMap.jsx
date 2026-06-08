import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateHousehold } from '../api/households'
import { ENVELOPE_TYPES, fmt } from '../utils'

const SEASONS = [
  { value: 'recover',  label: 'Recover',  desc: 'Paying down non-mortgage debt',      dot: 'bg-rose-400',    idle: 'border-rose-200 bg-rose-50 text-rose-700',    active: 'border-rose-400 bg-rose-100 text-rose-800 ring-2 ring-rose-300'    },
  { value: 'fund',     label: 'Fund',     desc: 'Building savings toward a goal',      dot: 'bg-amber-400',   idle: 'border-amber-200 bg-amber-50 text-amber-700', active: 'border-amber-400 bg-amber-100 text-amber-800 ring-2 ring-amber-300' },
  { value: 'activate', label: 'Activate', desc: 'Spending on experiences now',         dot: 'bg-emerald-400', idle: 'border-emerald-200 bg-emerald-50 text-emerald-700', active: 'border-emerald-400 bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300' },
  { value: 'balance',  label: 'Balance',  desc: 'Saving and living simultaneously',    dot: 'bg-indigo-400',  idle: 'border-indigo-200 bg-indigo-50 text-indigo-700',  active: 'border-indigo-400 bg-indigo-100 text-indigo-800 ring-2 ring-indigo-300'  },
]

// Money Target table: tier → season → type → target %
// Source: The Money Habit by Mike Michalowicz
const MONEY_TARGET = {
  1: {
    recover:  { needs: 80, wants: 1,  dreams: 1,  fix: 15, emergency: 3 },
    fund:     { needs: 80, wants: 2,  dreams: 5,  fix: 8,  emergency: 5 },
    activate: { needs: 80, wants: 12, dreams: 4,  fix: 2,  emergency: 2 },
    balance:  { needs: 80, wants: 8,  dreams: 5,  fix: 4,  emergency: 3 },
  },
  2: {
    recover:  { needs: 65, wants: 10, dreams: 3,  fix: 20, emergency: 2 },
    fund:     { needs: 65, wants: 12, dreams: 11, fix: 7,  emergency: 5 },
    activate: { needs: 65, wants: 25, dreams: 5,  fix: 3,  emergency: 2 },
    balance:  { needs: 65, wants: 19, dreams: 8,  fix: 4,  emergency: 4 },
  },
  3: {
    recover:  { needs: 50, wants: 18, dreams: 5,  fix: 22, emergency: 5 },
    fund:     { needs: 50, wants: 14, dreams: 18, fix: 10, emergency: 8 },
    activate: { needs: 50, wants: 36, dreams: 9,  fix: 3,  emergency: 2 },
    balance:  { needs: 50, wants: 25, dreams: 14, fix: 6,  emergency: 5 },
  },
  4: {
    recover:  { needs: 35, wants: 22, dreams: 8,  fix: 25, emergency: 10 },
    fund:     { needs: 35, wants: 25, dreams: 20, fix: 12, emergency: 8  },
    activate: { needs: 35, wants: 40, dreams: 15, fix: 5,  emergency: 5  },
    balance:  { needs: 35, wants: 31, dreams: 18, fix: 10, emergency: 6  },
  },
  5: {
    recover:  { needs: 25, wants: 27, dreams: 11, fix: 21, emergency: 16 },
    fund:     { needs: 25, wants: 21, dreams: 27, fix: 16, emergency: 11 },
    activate: { needs: 25, wants: 49, dreams: 16, fix: 5,  emergency: 5  },
    balance:  { needs: 25, wants: 31, dreams: 24, fix: 11, emergency: 9  },
  },
  6: {
    recover:  { needs: 20, wants: 30, dreams: 15, fix: 20, emergency: 15 },
    fund:     { needs: 20, wants: 25, dreams: 30, fix: 15, emergency: 10 },
    activate: { needs: 20, wants: 65, dreams: 5,  fix: 5,  emergency: 5  },
    balance:  { needs: 20, wants: 40, dreams: 22, fix: 10, emergency: 8  },
  },
}

function getTier(annualIncome) {
  const n = parseFloat(annualIncome)
  if (n <= 50000)   return 1
  if (n <= 150000)  return 2
  if (n <= 300000)  return 3
  if (n <= 500000)  return 4
  if (n <= 1000000) return 5
  return 6
}

const TIER_LABELS = ['', 'Under $50k', '$50k–$150k', '$150k–$300k', '$300k–$500k', '$500k–$1M', '$1M+']

export default function MoneyMap({ envelopes, periodByEnvelope, totalIncome, household, householdId }) {
  const qc = useQueryClient()
  const [incomeDraft, setIncomeDraft] = useState(
    household?.annual_income ? String(parseFloat(household.annual_income)) : ''
  )
  const [editingIncome, setEditingIncome] = useState(false)

  const saveMutation = useMutation({
    mutationFn: (data) => updateHousehold(householdId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  })

  const handleSeasonClick = (value) => {
    saveMutation.mutate({ season: value })
  }

  const commitIncome = () => {
    setEditingIncome(false)
    const val = incomeDraft ? parseFloat(incomeDraft) : null
    if (val !== (household?.annual_income ? parseFloat(household.annual_income) : null)) {
      saveMutation.mutate({ annual_income: val })
    }
  }

  // Sum allocated $ per envelope type
  const byType = {}
  let untaggedAllocated = 0
  for (const env of envelopes) {
    const allocated = parseFloat(periodByEnvelope[env.id]?.allocated ?? 0)
    if (env.envelope_type && ENVELOPE_TYPES[env.envelope_type]) {
      byType[env.envelope_type] = (byType[env.envelope_type] ?? 0) + allocated
    } else {
      untaggedAllocated += allocated
    }
  }

  const season = household?.season
  const annualIncome = household?.annual_income
  const tier = annualIncome ? getTier(annualIncome) : null
  const targets = tier && season ? MONEY_TARGET[tier]?.[season] : null

  const typeOrder = Object.keys(ENVELOPE_TYPES)

  const rows = typeOrder.map((type) => {
    const allocated = byType[type] ?? 0
    const actualPct = totalIncome > 0 ? Math.round((allocated / totalIncome) * 100) : null
    const targetPct = targets?.[type] ?? null
    const targetAmt = targetPct !== null && totalIncome > 0 ? (targetPct / 100) * totalIncome : null
    const gap = actualPct !== null && targetPct !== null ? targetPct - actualPct : null
    let status = null
    if (actualPct !== null && targetPct !== null) {
      const ratio = targetPct > 0 ? actualPct / targetPct : 1
      status = ratio >= 0.95 && ratio <= 1.05 ? 'on' : ratio < 0.95 ? 'under' : 'over'
    }
    return { type, allocated, actualPct, targetPct, targetAmt, gap, status }
  })

  const totalAllocated = rows.reduce((s, r) => s + r.allocated, 0) + untaggedAllocated
  const totalActualPct = totalIncome > 0 ? Math.round((totalAllocated / totalIncome) * 100) : null

  const activeSeason = SEASONS.find((s) => s.value === season)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Season selector */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {SEASONS.map((s) => (
            <button
              key={s.value}
              onClick={() => handleSeasonClick(s.value)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                season === s.value ? s.active : s.idle + ' opacity-60 hover:opacity-100'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            {activeSeason ? activeSeason.desc : <span className="text-amber-500">Select a season above to see your targets</span>}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0 ml-4">
            {tier && <span>{TIER_LABELS[tier]}</span>}
            {editingIncome ? (
              <div className="flex items-center gap-1">
                <span>$</span>
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="1000"
                  value={incomeDraft}
                  onChange={(e) => setIncomeDraft(e.target.value)}
                  onBlur={commitIncome}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingIncome(false) }}
                  placeholder="annual income"
                  className="border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 w-28"
                />
              </div>
            ) : (
              <button
                onClick={() => setEditingIncome(true)}
                className={`transition-colors ${annualIncome ? 'hover:text-indigo-500' : 'text-amber-500 hover:text-amber-700 font-medium'}`}
                title="Set annual income to see target % and gap"
              >
                {annualIncome ? `${fmt(annualIncome)} /yr` : '⚠ set annual income'} ✎
              </button>
            )}
          </div>
        </div>
      </div>

      {!season ? (
        <div className="py-10 text-center text-gray-400 text-sm">
          Select a season above to see your Money Target allocations.
        </div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="px-4 py-2.5 text-left">Type</th>
              <th className="px-4 py-2.5 text-right">Allocated</th>
              <th className="px-4 py-2.5 text-right">Target</th>
              <th className="px-4 py-2.5 text-right">Gap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(({ type, allocated, actualPct, targetPct, targetAmt, gap, status }) => {
              const amtColor = status === 'on' ? 'text-emerald-600' : status === 'under' ? 'text-amber-500' : status === 'over' ? 'text-rose-600' : 'text-gray-600'
              return (
              <tr key={type} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${ENVELOPE_TYPES[type].dot}`} />
                    <span className="font-medium text-gray-800">{ENVELOPE_TYPES[type].label}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span className={`font-medium ${amtColor}`}>
                    {allocated > 0 ? fmt(allocated) : <span className="text-gray-300">—</span>}
                  </span>
                  {actualPct !== null && (
                    <span className={`ml-1.5 text-xs ${amtColor}`}>{actualPct}%</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">
                  {targetAmt !== null ? (
                    <>
                      <span>{fmt(targetAmt)}</span>
                      <span className="ml-1.5 text-xs">{targetPct}%</span>
                    </>
                  ) : '—'}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${gapColor(gap)}`}>
                  {gap === null ? '—' : gap === 0 ? '✓' : gap > 0 ? `+${gap}%` : `${gap}%`}
                </td>
              </tr>
              )
            })}
            {untaggedAllocated > 0 && (
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-gray-200" />
                    <span className="text-gray-400 italic">Untagged</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">
                  <span>{fmt(untaggedAllocated)}</span>
                  {totalIncome > 0 && (
                    <span className="ml-1.5 text-xs">{Math.round((untaggedAllocated / totalIncome) * 100)}%</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-300">—</td>
                <td className="px-4 py-2.5 text-right text-gray-300">—</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-100 bg-gray-50 font-semibold">
              <td className="px-4 py-2.5 text-gray-700">Total</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                <span>{fmt(totalAllocated)}</span>
                {totalActualPct !== null && <span className="ml-1.5 text-xs font-normal text-gray-500">{totalActualPct}%</span>}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                <span>{totalIncome > 0 ? fmt(totalIncome) : '—'}</span>
                {totalIncome > 0 && <span className="ml-1.5 text-xs font-normal">100%</span>}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
        </div>
      )}
    </div>
  )
}

function gapColor(gap) {
  if (gap === null) return 'text-gray-300'
  if (gap === 0) return 'text-emerald-600'
  if (Math.abs(gap) <= 3) return 'text-amber-500'
  return gap > 0 ? 'text-indigo-500' : 'text-rose-600'
}
