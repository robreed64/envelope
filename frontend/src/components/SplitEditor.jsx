import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { splitTransaction } from '../api/transactions'
import { fmt, envelopeLabel } from '../utils'

export default function SplitEditor({ tx, envelopes, householdId, onClose, onSuccess }) {
  const total = parseFloat(tx.amount)
  const [legs, setLegs] = useState([
    { envelope_id: '', amount: '', note: tx.note || '' },
    { envelope_id: '', amount: '', note: '' },
  ])

  const allocated = legs.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const remaining = Math.round((total - allocated) * 100) / 100
  const canSubmit =
    remaining === 0 &&
    legs.length >= 2 &&
    legs.every((l) => l.envelope_id && parseFloat(l.amount) > 0)

  const splitMutation = useMutation({
    mutationFn: () =>
      splitTransaction(
        householdId,
        tx.id,
        legs.map((l) => ({
          envelope_id: l.envelope_id,
          amount: parseFloat(l.amount),
          note: l.note.trim() || null,
        }))
      ),
    onSuccess,
  })

  const updateLeg = (i, field, value) =>
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const addLeg = () => setLegs((prev) => [...prev, { envelope_id: '', amount: '', note: '' }])

  const removeLeg = (i) => setLegs((prev) => prev.filter((_, idx) => idx !== i))

  const distributeEvenly = () => {
    const each = Math.floor((total / legs.length) * 100) / 100
    const remainder = Math.round((total - each * legs.length) * 100) / 100
    setLegs((prev) =>
      prev.map((l, i) => ({
        ...l,
        amount: i === 0 ? String(Math.round((each + remainder) * 100) / 100) : String(each),
      }))
    )
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-gray-700">
          Split {fmt(total)} across envelopes
        </div>
        <button type="button" onClick={distributeEvenly} className="text-xs text-indigo-600 hover:underline">
          Distribute evenly
        </button>
      </div>

      <div className="space-y-2 mb-3">
        {legs.map((leg, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select
              value={leg.envelope_id}
              onChange={(e) => updateLeg(i, 'envelope_id', e.target.value)}
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— envelope —</option>
              {envelopes.map((e) => (
                <option key={e.id} value={e.id}>{envelopeLabel(e)}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={leg.amount}
              onChange={(e) => updateLeg(i, 'amount', e.target.value)}
              placeholder="0.00"
              className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={leg.note}
              onChange={(e) => updateLeg(i, 'note', e.target.value)}
              placeholder="note (optional)"
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {legs.length > 2 && (
              <button
                type="button"
                onClick={() => removeLeg(i)}
                className="text-gray-400 hover:text-rose-500 text-lg leading-none shrink-0"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button type="button" onClick={addLeg} className="text-xs text-indigo-600 hover:underline">
            + Add line
          </button>
          <span className={`text-xs tabular-nums font-medium ${remaining === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {remaining === 0 ? '✓ Balanced' : `${fmt(Math.abs(remaining))} ${remaining > 0 ? 'remaining' : 'over'}`}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => splitMutation.mutate()}
            disabled={!canSubmit || splitMutation.isPending}
            className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {splitMutation.isPending ? 'Saving…' : 'Confirm split'}
          </button>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
