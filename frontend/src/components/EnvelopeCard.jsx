import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateEnvelope } from '../api/envelopes'
import { createPeriod, updatePeriod } from '../api/periods'
import { thisMonth, fmt, calcBudgetMetrics, ENVELOPE_TYPES } from '../utils'

export default function EnvelopeCard({ envelope, period, prevPeriod, householdId, month, dragHandleProps = {} }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')

  const { allocated, rollover, spent, balance, pct, overBudget, barColor } = calcBudgetMetrics(period)
  const prevSpent = parseFloat(prevPeriod?.spent ?? 0)
  const spentDelta = prevSpent > 0 ? spent - prevSpent : null

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['periods', householdId, envelope.id] })
    qc.invalidateQueries({ queryKey: ['periods', householdId] })
  }

  const saveBudgetMutation = useMutation({
    mutationFn: (amount) =>
      period
        ? updatePeriod(householdId, envelope.id, period.id, { allocated: amount })
        : createPeriod(householdId, envelope.id, { month: thisMonth(), allocated: amount }),
    onSuccess: () => { invalidate(); setEditingBudget(false) },
  })

  const deleteMutation = useMutation({
    mutationFn: () => updateEnvelope(householdId, envelope.id, { is_active: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['envelopes', householdId] }),
  })

  const toggleRolloverMutation = useMutation({
    mutationFn: () => updateEnvelope(householdId, envelope.id, { rollover: !envelope.rollover }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['envelopes', householdId] }),
  })

  const toggleProtectedMutation = useMutation({
    mutationFn: () => updateEnvelope(householdId, envelope.id, { is_protected: !envelope.is_protected }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['envelopes', householdId] }),
  })

  const typeMeta = envelope.envelope_type ? ENVELOPE_TYPES[envelope.envelope_type] : null

  const openBudgetEdit = (e) => {
    e.stopPropagation()
    setBudgetInput(allocated > 0 ? allocated.toFixed(2) : '')
    setEditingBudget(true)
  }

  const saveBudget = (e) => {
    e.stopPropagation()
    if (budgetInput) saveBudgetMutation.mutate(budgetInput)
  }

  const handleCardClick = () => {
    if (!editingBudget && !confirming)
      navigate(`/households/${householdId}/envelopes/${envelope.id}?month=${month || thisMonth()}`)
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    if (!confirming) { setConfirming(true); return }
    deleteMutation.mutate()
  }

  return (
    <div
      onClick={handleCardClick}
      className={`rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-shadow relative group ${
        overBudget ? 'bg-rose-50 border-rose-200' :
        envelope.is_protected ? 'bg-slate-50 border-slate-200' :
        'bg-white border-gray-100'
      }`}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1 min-w-0">
          {typeMeta && (
            <span className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
              {typeMeta.label}
            </span>
          )}
          <h3 className="font-semibold text-gray-800">{envelope.name}</h3>
        </div>

        <div className="flex items-center gap-1 ml-2 shrink-0">
          <span
            {...dragHandleProps}
            className="text-gray-200 hover:text-gray-400 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity select-none text-sm px-0.5"
            title="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
          >
            ⠿
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); toggleRolloverMutation.mutate() }}
            className={`text-base leading-none px-1 py-0.5 rounded transition-colors ${
              envelope.rollover
                ? 'text-emerald-500 hover:text-emerald-700'
                : 'text-gray-300 hover:text-gray-500'
            }`}
            title={envelope.rollover ? 'Rollover on — click to disable' : 'Rollover off — click to enable'}
          >
            ↻
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleProtectedMutation.mutate() }}
            className={`text-sm leading-none px-1 py-0.5 rounded transition-colors ${
              envelope.is_protected
                ? 'text-slate-500 hover:text-slate-700'
                : 'text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100'
            }`}
            title={envelope.is_protected ? 'Protected — click to unprotect' : 'Click to protect this envelope'}
          >
            {envelope.is_protected ? '🔒' : '🔓'}
          </button>

          {confirming ? (
            <>
              <button onClick={handleDelete} className="text-xs bg-rose-500 text-white rounded px-2 py-0.5 hover:bg-rose-600">
                Delete
              </button>
              <button onClick={(e) => { e.stopPropagation(); setConfirming(false) }} className="text-xs text-gray-400 hover:text-gray-600 px-1">
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={handleDelete}
              className="text-gray-200 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3 mt-2">
        <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex justify-between text-sm mb-2">
        <span className="text-gray-500">{fmt(spent)} spent</span>
        <span className={`font-medium ${overBudget ? 'text-rose-600' : 'text-gray-800'}`}>
          {overBudget ? `-${fmt(Math.abs(balance))} over` : `${fmt(balance)} left`}
        </span>
      </div>

      {spentDelta !== null && (
        <p className={`text-xs mb-1 ${spentDelta > 0 ? 'text-rose-400' : spentDelta < 0 ? 'text-emerald-500' : 'text-gray-400'}`}>
          {spentDelta > 0
            ? `↑ ${fmt(spentDelta)} more than last month`
            : spentDelta < 0
            ? `↓ ${fmt(Math.abs(spentDelta))} less than last month`
            : '= same as last month'}
        </p>
      )}

      {rollover !== 0 && (
        <p className={`text-xs mb-1 ${rollover > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {rollover > 0 ? `+${fmt(rollover)} rolled over` : `-${fmt(Math.abs(rollover))} overspent last month`}
        </p>
      )}

      {editingBudget ? (
        <div className="flex items-center gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
          <span className="text-gray-400 text-sm">$</span>
          <input
            autoFocus
            type="number"
            min="0"
            step="0.01"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveBudget(e); if (e.key === 'Escape') setEditingBudget(false) }}
            className="w-24 border border-indigo-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button onClick={saveBudget} disabled={!budgetInput || saveBudgetMutation.isPending} className="text-xs bg-indigo-600 text-white rounded px-2 py-0.5 hover:bg-indigo-700 disabled:opacity-50">
            Save
          </button>
          <button onClick={(e) => { e.stopPropagation(); setEditingBudget(false) }} className="text-xs text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={openBudgetEdit}
          className={`text-xs mt-1 hover:underline ${allocated > 0 ? 'text-gray-400 hover:text-indigo-500' : 'text-amber-500 hover:text-amber-600 font-medium'}`}
        >
          {allocated > 0 ? `${fmt(allocated)} budgeted — edit` : '+ Set budget'}
        </button>
      )}
    </div>
  )
}
