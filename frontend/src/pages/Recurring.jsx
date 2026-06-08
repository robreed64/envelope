import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '../components/Layout'
import InlineTip from '../components/InlineTip'
import { getHouseholds } from '../api/households'
import { getEnvelopes } from '../api/envelopes'
import { getTemplates, getSuggestions, createTemplate, updateTemplate, deleteTemplate, applyTemplate } from '../api/recurring'
import { getPayeeAliases } from '../api/payees'
import { today, fmt, buildAliasMap, envelopeLabel } from '../utils'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

const emptyForm = { name: '', amount: '', type: 'debit', envelope_id: '', day_of_month: '', note: '' }

export default function Recurring() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [applyDate, setApplyDate] = useState({})
  const [form, setForm] = useState(emptyForm)

  const { data: households = [] } = useQuery({
    queryKey: ['households'],
    queryFn: () => getHouseholds().then((r) => r.data),
  })
  const household = households[0]

  const { data: envelopes = [] } = useQuery({
    queryKey: ['envelopes', household?.id],
    queryFn: () => getEnvelopes(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['recurring', household?.id],
    queryFn: () => getTemplates(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const { data: suggestions = [], isLoading: loadingSuggestions } = useQuery({
    queryKey: ['recurring-suggestions', household?.id],
    queryFn: () => getSuggestions(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const { data: aliasesRaw = [] } = useQuery({
    queryKey: ['payees', household?.id],
    queryFn: () => getPayeeAliases(household.id).then((r) => r.data),
    enabled: !!household,
  })
  const aliasMap = buildAliasMap(aliasesRaw)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['recurring', household.id] })
    qc.invalidateQueries({ queryKey: ['recurring-suggestions', household.id] })
  }

  const createMutation = useMutation({
    mutationFn: (data) => createTemplate(household.id, data),
    onSuccess: () => { invalidate(); resetForm() },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateTemplate(household.id, id, data),
    onSuccess: () => { invalidate(); resetForm() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteTemplate(household.id, id),
    onSuccess: invalidate,
  })

  const applyMutation = useMutation({
    mutationFn: ({ id, date }) => applyTemplate(household.id, id, date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] }, { exact: false })
      qc.invalidateQueries({ queryKey: ['periods', household.id] }, { exact: false })
    },
  })

  const resetForm = () => {
    setForm(emptyForm)
    setShowForm(false)
    setEditingId(null)
  }

  const startEdit = (t) => {
    setForm({
      name: t.name,
      amount: String(t.amount),
      type: t.type,
      envelope_id: t.envelope_id,
      day_of_month: t.day_of_month ?? '',
      note: t.note ?? '',
    })
    setEditingId(t.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveFromSuggestion = (s) => {
    createTemplate(household.id, {
      name: s.note,
      amount: s.avg_amount,
      type: s.type,
      envelope_id: s.envelope_id,
    }).then(invalidate)
  }

  const submitForm = () => {
    const payload = {
      name: form.name,
      amount: form.amount,
      type: form.type,
      envelope_id: form.envelope_id,
      day_of_month: form.day_of_month ? parseInt(form.day_of_month) : null,
      note: form.note || null,
    }
    if (editingId) updateMutation.mutate({ id: editingId, data: payload })
    else createMutation.mutate(payload)
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const canSubmit = form.name.trim() && form.amount && form.envelope_id && !isPending

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recurring</h1>
          <p className="text-gray-500 text-sm">Templates for bills and regular expenses</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            + New template
          </button>
        )}
      </div>

      {/* Manual form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-indigo-100 shadow-sm p-5 mb-6">
          <h3 className="font-medium text-gray-800 mb-4">{editingId ? 'Edit template' : 'New template'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Netflix"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Envelope</label>
              <select
                value={form.envelope_id}
                onChange={(e) => setForm((p) => ({ ...p, envelope_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select envelope…</option>
                {envelopes.map((e) => (
                  <option key={e.id} value={e.id}>{envelopeLabel(e)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="debit">Debit (expense)</option>
                <option value="credit">Credit (refund)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Day of month (optional)</label>
              <select
                value={form.day_of_month}
                onChange={(e) => setForm((p) => ({ ...p, day_of_month: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">No fixed day</option>
                {DAYS.map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Note (optional)</label>
              <input
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="Appears on the transaction"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={submitForm}
              disabled={!canSubmit}
              className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Saving…' : editingId ? 'Save changes' : 'Create template'}
            </button>
            <button onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Templates list */}
      {!loadingTemplates && templates.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50 mb-8">
          {templates.map((t) => {
            const date = applyDate[t.id] ?? today()
            return (
              <div key={t.id} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-gray-900">{t.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      t.type === 'credit' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {t.type === 'credit' ? '+' : '-'}{fmt(t.amount)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {t.envelope_name}
                    {t.day_of_month && ` · ${ordinal(t.day_of_month)} of month`}
                    {t.note && ` · "${t.note}"`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="date" value={date}
                    onChange={(e) => setApplyDate((p) => ({ ...p, [t.id]: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={() => applyMutation.mutate({ id: t.id, date })}
                    disabled={applyMutation.isPending}
                    className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    Apply
                  </button>
                  <button onClick={() => startEdit(t)} className="text-gray-300 hover:text-indigo-500 transition-colors" title="Edit">✎</button>
                  <button onClick={() => deleteMutation.mutate(t.id)} className="text-gray-300 hover:text-rose-400 transition-colors" title="Delete">✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loadingTemplates && templates.length === 0 && !showForm && (
        <div className="mb-6">
          <InlineTip icon="🔁" title="Automate your regular bills">
            Recurring templates let you quickly post regular transactions — rent, subscriptions, paychecks — each month with one click. Create a template once, then apply it every month. Check the suggestions below based on your existing transactions.
          </InlineTip>
        </div>
      )}

      {/* Suggestions */}
      {!loadingSuggestions && suggestions.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">From your recent transactions</h2>
            <div className="flex-1 border-t border-gray-100" />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {suggestions.map((s, i) => (
              <div key={i} className="px-5 py-3.5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-gray-800 truncate">{aliasMap[s.note] ?? s.note}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      s.type === 'credit' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {s.type === 'credit' ? '+' : '-'}{fmt(s.avg_amount)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {s.envelope_name} · seen {s.count} time{s.count !== 1 ? 's' : ''} in last 90 days
                  </p>
                </div>
                <button
                  onClick={() => saveFromSuggestion(s)}
                  className="shrink-0 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                >
                  + Save as template
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Layout>
  )
}
