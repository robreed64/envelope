import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '../components/Layout'
import MonthNav from '../components/MonthNav'
import IncomeForm from '../components/IncomeForm'
import { getHouseholds } from '../api/households'
import { getIncome, addIncome, updateIncome, deleteIncome } from '../api/income'
import { thisMonth, monthLabel, fmt } from '../utils'

export default function IncomePage() {
  const qc = useQueryClient()
  const [month, setMonth] = useState(thisMonth())
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)

  const { data: households = [] } = useQuery({
    queryKey: ['households'],
    queryFn: () => getHouseholds().then((r) => r.data),
  })
  const household = households[0]

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['income', household?.id, month],
    queryFn: () => getIncome(household.id, month).then((r) => r.data),
    enabled: !!household,
  })

  const addMutation = useMutation({
    mutationFn: (data) => addIncome(household.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['income', household.id] })
      qc.invalidateQueries({ queryKey: ['periods'] })
      setFormOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateIncome(household.id, id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['income', household.id] })
      qc.invalidateQueries({ queryKey: ['periods'] })
      setEditId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteIncome(household.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['income', household.id] })
      qc.invalidateQueries({ queryKey: ['periods'] })
      setConfirmDelete(null)
    },
  })

  const startEdit = (entry) => {
    setEditId(entry.id)
    setEditForm({
      source: entry.source,
      amount: String(entry.amount),
      date: entry.date,
      budget_month: entry.month !== entry.date.slice(0, 7) + '-01' ? entry.month : '',
    })
  }

  const handleUpdate = (e) => {
    e.preventDefault()
    updateMutation.mutate({
      id: editId,
      data: {
        source: editForm.source.trim(),
        amount: parseFloat(editForm.amount),
        date: editForm.date,
        budget_month: editForm.budget_month || undefined,
      },
    })
  }

  const total = entries.reduce((sum, e) => sum + parseFloat(e.amount), 0)
  const currentMonthLabel = monthLabel(new Date(month + 'T00:00:00'))

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Income</h1>
          <p className="text-gray-500 text-sm">Track and manage income by month</p>
        </div>
        <div className="flex items-center gap-3">
          <MonthNav month={month} onChange={setMonth} />
          <button
            onClick={() => setFormOpen((v) => !v)}
            className="bg-indigo-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + Add income
          </button>
        </div>
      </div>

      {formOpen && (
        <IncomeForm
          onSave={(data) => addMutation.mutate(data)}
          onCancel={() => setFormOpen(false)}
          isPending={addMutation.isPending}
        />
      )}

      {/* Summary */}
      {entries.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-4 flex items-center justify-between">
          <span className="text-sm text-emerald-700 font-medium">{currentMonthLabel} total income</span>
          <span className="text-xl font-bold text-emerald-700">{fmt(total)}</span>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No income recorded for {currentMonthLabel}.
            <br />
            <button
              onClick={() => setFormOpen(true)}
              className="mt-2 text-indigo-500 hover:text-indigo-700 underline underline-offset-2"
            >
              Add an entry
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left">Source</th>
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">Budgeted to</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map((entry) => (
                editId === entry.id ? (
                  <tr key={entry.id} className="bg-indigo-50">
                    <td className="px-4 py-2">
                      <input
                        className="w-full border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={editForm.source}
                        onChange={(e) => setEditForm((f) => ({ ...f, source: e.target.value }))}
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        className="w-full border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={editForm.date}
                        onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="month"
                        className="w-full border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={editForm.budget_month ? editForm.budget_month.slice(0, 7) : entry.month.slice(0, 7)}
                        onChange={(e) => setEditForm((f) => ({ ...f, budget_month: e.target.value + '-01' }))}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-full border border-indigo-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={editForm.amount}
                        onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={handleUpdate}
                          disabled={updateMutation.isPending}
                          className="text-xs bg-indigo-600 text-white rounded px-2 py-1 hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3 text-gray-800 font-medium">
                      <div className="flex items-center gap-2">
                        {entry.source}
                        {entry.bank_ref && (
                          <span className="text-xs bg-indigo-50 text-indigo-500 rounded-full px-2 py-0.5">imported</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 tabular-nums">{entry.date}</td>
                    <td className="px-4 py-3 text-gray-500 tabular-nums">
                      {monthLabel(new Date(entry.month + 'T00:00:00'))}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600 tabular-nums">
                      +{fmt(entry.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(entry)}
                          className="text-gray-400 hover:text-indigo-600 transition-colors"
                          title="Edit"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => setConfirmDelete(entry)}
                          className="text-gray-400 hover:text-rose-500 transition-colors"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Delete income entry?</h2>
            <p className="text-sm text-gray-500 mb-4">
              "{confirmDelete.source}" — {fmt(confirmDelete.amount)} will be removed and the budgeted month will be updated.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="bg-rose-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
