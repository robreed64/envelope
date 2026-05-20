import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Layout from '../components/Layout'
import InlineTip from '../components/InlineTip'
import EnvelopeCard from '../components/EnvelopeCard'
import IncomeForm from '../components/IncomeForm'
import GettingStartedChecklist from '../components/GettingStartedChecklist'
import MonthNav from '../components/MonthNav'
import BudgetTable from '../components/BudgetTable'
import MoneyMap from '../components/MoneyMap'
import { getHouseholds, createHousehold } from '../api/households'
import { getEnvelopes, createEnvelope, updateEnvelope } from '../api/envelopes'
import { getBulkPeriods, copyPeriods } from '../api/periods'
import { getIncome, addIncome, deleteIncome } from '../api/income'
import { createTransaction, createTransfer, createSplit } from '../api/transactions'
import { thisMonth, today, monthLabel, monthLabelStr, shiftMonth, fmt, envelopeLabel, ENVELOPE_TYPES, ENVELOPE_TEMPLATES, TEMPLATE_TYPE_SUGGESTIONS } from '../utils'

const TX_TYPE_ACTIVE = {
  debit: 'bg-rose-50 text-rose-700 border-rose-200',
  credit: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function SortableCard({ envelope, period, prevPeriod, householdId, month }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: envelope.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-50 z-50' : ''}
    >
      <EnvelopeCard
        envelope={envelope}
        period={period}
        prevPeriod={prevPeriod}
        householdId={householdId}
        month={month}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

function groupEnvelopes(envelopes) {
  const typeOrder = Object.keys(ENVELOPE_TYPES)
  const map = {}
  for (const env of envelopes) {
    const key = env.envelope_type || ''
    if (!map[key]) map[key] = []
    map[key].push(env)
  }
  const typed = typeOrder.filter((k) => map[k]).map((k) => ({ group: k, items: map[k] }))
  const untyped = map[''] ? [{ group: '', items: map[''] }] : []
  return [...typed, ...untyped]
}

export default function Dashboard() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [activeForm, setActiveForm] = useState(null)
  const [checklistDismissed, setChecklistDismissed] = useState(
    () => localStorage.getItem('envelope_checklist_dismissed') === 'true'
  )
  const [envName, setEnvName] = useState('')
  const [envType, setEnvType] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [transferFrom, setTransferFrom] = useState('')
  const [transferTo, setTransferTo] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDate, setTransferDate] = useState(today())
  const [transferNote, setTransferNote] = useState('')
  const [splitDate, setSplitDate] = useState(today())
  const [splitLegs, setSplitLegs] = useState([{ envelope_id: '', amount: '', note: '' }, { envelope_id: '', amount: '', note: '' }])
  const [txEnvelope, setTxEnvelope] = useState('')
  const [txType, setTxType] = useState('debit')
  const [txAmount, setTxAmount] = useState('')
  const [txDate, setTxDate] = useState(today())
  const [txNote, setTxNote] = useState('')
  const [typeNudgeDismissed, setTypeNudgeDismissed] = useState(false)

  const [budgetMode, setBudgetMode] = useState(false)
  const [mapMode, setMapMode] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const toggleForm = (name) => setActiveForm((cur) => (cur === name ? null : name))

  const toggleGroup = (g) => setCollapsedGroups((prev) => {
    const next = new Set(prev)
    if (next.has(g)) next.delete(g); else next.add(g)
    return next
  })

  const [month, setMonthState] = useState(() => localStorage.getItem('envelope_month') || thisMonth())
  const setMonth = (m) => { setMonthState(m); localStorage.setItem('envelope_month', m) }
  const isCurrentMonth = month === thisMonth()
  const nextMonth = shiftMonth(month, 1)
  const prevMonth = shiftMonth(month, -1)
  const [newMonthDismissed, setNewMonthDismissed] = useState(false)
  useEffect(() => {
    setNewMonthDismissed(localStorage.getItem(`envelope_new_month_${month}`) === 'true')
  }, [month])

  const { data: households = [], isLoading: loadingHouseholds } = useQuery({
    queryKey: ['households'],
    queryFn: () => getHouseholds().then((r) => r.data),
  })

  const household = households[0]

  const { data: envelopes = [], isLoading: loadingEnvelopes } = useQuery({
    queryKey: ['envelopes', household?.id],
    queryFn: () => getEnvelopes(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const { data: bulkPeriods = [] } = useQuery({
    queryKey: ['periods', household?.id, month],
    queryFn: () => getBulkPeriods(household.id, month).then((r) => r.data),
    enabled: !!household,
  })

  const { data: incomeEntries = [] } = useQuery({
    queryKey: ['income', household?.id, month],
    queryFn: () => getIncome(household.id, month).then((r) => r.data),
    enabled: !!household,
  })

  const { data: prevBulkPeriods = [] } = useQuery({
    queryKey: ['periods', household?.id, prevMonth],
    queryFn: () => getBulkPeriods(household.id, prevMonth).then((r) => r.data),
    enabled: !!household,
  })

  const periodByEnvelope = useMemo(
    () => Object.fromEntries(bulkPeriods.map((p) => [p.envelope_id, p])),
    [bulkPeriods]
  )

  const prevPeriodByEnvelope = useMemo(
    () => Object.fromEntries(prevBulkPeriods.map((p) => [p.envelope_id, p])),
    [prevBulkPeriods]
  )

  const totalIncome = incomeEntries.reduce((s, e) => s + parseFloat(e.amount), 0)
  const totalAllocated = Object.values(periodByEnvelope).reduce(
    (s, p) => s + parseFloat(p?.allocated ?? 0), 0
  )
  const totalSpent = Object.values(periodByEnvelope).reduce(
    (s, p) => s + parseFloat(p?.spent ?? 0), 0
  )
  const unallocated = Math.round((totalIncome - totalAllocated) * 100) / 100
  const overBudgetCount = Object.values(periodByEnvelope).filter(
    (p) => p && parseFloat(p.balance) < 0
  ).length

  const envelopeIds = useMemo(() => envelopes.map((e) => e.id), [envelopes])

  const createHouseholdMutation = useMutation({
    mutationFn: (name) => createHousehold(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  })

  const createEnvelopeMutation = useMutation({
    mutationFn: (data) => createEnvelope(household.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envelopes', household.id] })
      setActiveForm(null)
      setEnvName('')
      setEnvType('')
    },
  })

  const addIncomeMutation = useMutation({
    mutationFn: (data) => addIncome(household.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['income', household.id, month] })
      setActiveForm(null)
    },
  })

  const deleteIncomeMutation = useMutation({
    mutationFn: (id) => deleteIncome(household.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['income', household.id, month] }),
  })

  const transferMutation = useMutation({
    mutationFn: (data) => createTransfer(household.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods', household.id] }, { exact: false })
      setActiveForm(null)
      setTransferFrom('')
      setTransferTo('')
      setTransferAmount('')
      setTransferDate(today())
      setTransferNote('')
    },
  })

  const splitMutation = useMutation({
    mutationFn: (data) => createSplit(household.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods', household.id] }, { exact: false })
      setActiveForm(null)
      setSplitDate(today())
      setSplitLegs([{ envelope_id: '', amount: '', note: '' }, { envelope_id: '', amount: '', note: '' }])
    },
  })

  const addTxMutation = useMutation({
    mutationFn: ({ envelopeId, data }) => createTransaction(household.id, envelopeId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods', household.id] }, { exact: false })
      setActiveForm(null)
      setTxEnvelope('')
      setTxType('debit')
      setTxAmount('')
      setTxDate(today())
      setTxNote('')
    },
  })

  const updateSplitLeg = (i, field, value) =>
    setSplitLegs((prev) => prev.map((leg, idx) => idx === i ? { ...leg, [field]: value } : leg))

  const splitTotal = splitLegs.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  const copyMutation = useMutation({
    mutationFn: () => copyPeriods(household.id, month, nextMonth),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods', household.id] }, { exact: false })
      setMonth(nextMonth)
    },
  })

  const copyFromPrevMutation = useMutation({
    mutationFn: () => copyPeriods(household.id, prevMonth, month),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['periods', household.id] }, { exact: false }),
  })

  const setEnvelopeTypeMutation = useMutation({
    mutationFn: ({ id, type }) => updateEnvelope(household.id, id, { envelope_type: type }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['envelopes', household.id] }),
  })

  const dismissNewMonth = () => {
    localStorage.setItem(`envelope_new_month_${month}`, 'true')
    setNewMonthDismissed(true)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIndex = envelopes.findIndex((e) => e.id === active.id)
    const newIndex = envelopes.findIndex((e) => e.id === over.id)
    const reordered = arrayMove(envelopes, oldIndex, newIndex)
    qc.setQueryData(['envelopes', household.id], (old) => ({
      ...old,
      data: reordered,
    }))
    reordered.forEach((env, i) => {
      if (env.sort_order !== i + 1) {
        updateEnvelope(household.id, env.id, { sort_order: i + 1 })
      }
    })
  }

  if (loadingHouseholds) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24 text-gray-400">Loading…</div>
      </Layout>
    )
  }

  if (!household) {
    return (
      <Layout>
        <div className="max-w-sm mx-auto text-center py-16">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Welcome to Envelope Budget</h2>
          <p className="text-gray-500 text-sm mb-6">Create your first budget to get started.</p>
          <div className="flex gap-2">
            <input
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder="e.g. Family Budget"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => createHouseholdMutation.mutate(householdName)}
              disabled={!householdName.trim()}
              className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  const checklistSteps = [
    {
      label: 'Create your envelopes',
      hint: 'Set up spending categories like Groceries, Rent, Gas',
      done: envelopes.length > 0,
      action: () => toggleForm('envelope'),
      actionLabel: 'Add envelope',
    },
    {
      label: 'Record your income',
      hint: 'Enter your monthly take-home pay',
      done: totalIncome > 0,
      action: () => toggleForm('income'),
      actionLabel: 'Add income',
    },
    {
      label: 'Set envelope budgets',
      hint: 'Decide how much to spend in each category',
      done: totalAllocated > 0,
      action: () => setBudgetMode(true),
      actionLabel: 'Set budgets',
    },
    {
      label: 'Import or enter transactions',
      hint: 'Bring in spending from your bank or enter one manually',
      done: totalSpent > 0,
      action: () => toggleForm('transaction'),
      actionLabel: 'Add transaction',
    },
  ]
  const showChecklist = !checklistDismissed && !checklistSteps.every((s) => s.done)

  const dismissChecklist = () => {
    localStorage.setItem('envelope_checklist_dismissed', 'true')
    setChecklistDismissed(true)
  }

  const untypedEnvelopes = envelopes.filter((e) => !e.envelope_type)

  const actionBtn = (key, label, variant = 'outline') => {
    const isActive = activeForm === key
    if (variant === 'solid') {
      return (
        <button
          onClick={() => toggleForm(key)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            isActive
              ? 'bg-indigo-700 text-white ring-2 ring-indigo-400 ring-offset-1'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {label}
        </button>
      )
    }
    if (variant === 'outline-indigo') {
      return (
        <button
          onClick={() => toggleForm(key)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors border ${
            isActive
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-indigo-600 text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          {label}
        </button>
      )
    }
    return (
      <button
        onClick={() => toggleForm(key)}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors border ${
          isActive
            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{household.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {actionBtn('income', '+ Add Income', 'outline-indigo')}
          {actionBtn('transaction', '✎ Add Transaction', 'outline')}
          {actionBtn('transfer', '⇄ Transfer', 'outline')}
          {actionBtn('split', '⊕ Split', 'outline')}
          {actionBtn('envelope', '+ Add Envelope', 'solid')}
        </div>
      </div>

      {/* Sticky view switcher */}
      <div className="sticky top-14 z-[9] -mx-4 px-4 py-2 mb-4 bg-white/95 backdrop-blur-sm border-b border-gray-100 flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { label: 'Envelope', active: !budgetMode && !mapMode, onClick: () => { setBudgetMode(false); setMapMode(false) } },
            { label: 'Budget', active: budgetMode,              onClick: () => { setBudgetMode(true);  setMapMode(false)  } },
            { label: 'Map',    active: mapMode,                 onClick: () => { setMapMode(true);    setBudgetMode(false) } },
          ].map(({ label, active, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                active ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <MonthNav month={month} onChange={setMonth}>
          {Object.values(periodByEnvelope).some(Boolean) && (
            <button
              onClick={() => copyMutation.mutate()}
              disabled={copyMutation.isPending}
              className="text-xs text-gray-400 hover:text-indigo-600 ml-2 transition-colors disabled:opacity-50"
              title={`Copy all budgets to ${monthLabelStr(nextMonth)}`}
            >
              {copyMutation.isPending ? 'Copying…' : `Copy → ${monthLabelStr(nextMonth)}`}
            </button>
          )}
        </MonthNav>
      </div>

      {activeForm === 'income' && (
        <IncomeForm
          onSave={(data) => addIncomeMutation.mutate(data)}
          onCancel={() => setActiveForm(null)}
          isPending={addIncomeMutation.isPending}
        />
      )}

      {activeForm === 'transfer' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
          <h3 className="font-medium text-gray-800 mb-3">Transfer Between Envelopes</h3>
          <div className="flex flex-wrap gap-2">
            <select
              value={transferFrom}
              onChange={(e) => setTransferFrom(e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">From envelope…</option>
              {envelopes.map((e) => (
                <option key={e.id} value={e.id}>{envelopeLabel(e)}</option>
              ))}
            </select>
            <select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">To envelope…</option>
              {envelopes.filter((e) => e.id !== transferFrom).map((e) => (
                <option key={e.id} value={e.id}>{envelopeLabel(e)}</option>
              ))}
            </select>
            <div className="min-w-28 relative">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="0.00"
                className="border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-28"
              />
            </div>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              placeholder="Note (optional)"
              className="min-w-0 flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => transferMutation.mutate({
                from_envelope_id: transferFrom,
                to_envelope_id: transferTo,
                amount: transferAmount,
                date: transferDate,
                note: transferNote || undefined,
              })}
              disabled={!transferFrom || !transferTo || !transferAmount || transferFrom === transferTo || transferMutation.isPending}
              className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Transfer
            </button>
            <button onClick={() => setActiveForm(null)} className="text-gray-400 hover:text-gray-600 px-2">✕</button>
          </div>
        </div>
      )}

      {activeForm === 'split' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-800">Split Payment Across Envelopes</h3>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={splitDate}
                onChange={(e) => setSplitDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button onClick={() => setActiveForm(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
          </div>
          <div className="space-y-2 mb-3">
            {splitLegs.map((leg, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center">
                <select
                  value={leg.envelope_id}
                  onChange={(e) => updateSplitLeg(i, 'envelope_id', e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Envelope…</option>
                  {envelopes.map((e) => (
                    <option key={e.id} value={e.id}>{envelopeLabel(e)}</option>
                  ))}
                </select>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={leg.amount}
                    onChange={(e) => updateSplitLeg(i, 'amount', e.target.value)}
                    placeholder="0.00"
                    className="border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-28"
                  />
                </div>
                <input
                  value={leg.note}
                  onChange={(e) => updateSplitLeg(i, 'note', e.target.value)}
                  placeholder="Note (optional)"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {splitLegs.length > 2 && (
                  <button
                    onClick={() => setSplitLegs((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-gray-300 hover:text-rose-400 text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSplitLegs((prev) => [...prev, { envelope_id: '', amount: '', note: '' }])}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              + Add row
            </button>
            <div className="flex items-center gap-4">
              {splitTotal > 0 && (
                <span className="text-sm text-gray-500">Total: <span className="font-semibold text-gray-800">{fmt(splitTotal)}</span></span>
              )}
              <button
                onClick={() => splitMutation.mutate({
                  date: splitDate,
                  legs: splitLegs
                    .filter((l) => l.envelope_id && l.amount)
                    .map((l) => ({ envelope_id: l.envelope_id, amount: l.amount, note: l.note || null })),
                })}
                disabled={splitLegs.filter((l) => l.envelope_id && l.amount).length < 2 || splitMutation.isPending}
                className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {splitMutation.isPending ? 'Saving…' : 'Save Split'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeForm === 'transaction' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-800">Add Transaction</h3>
            <button onClick={() => setActiveForm(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              {[['debit', 'Expense'], ['credit', 'Income']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTxType(val)}
                  className={`px-3 py-2 font-medium transition-colors ${
                    txType === val ? TX_TYPE_ACTIVE[val] : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={txEnvelope}
              onChange={(e) => setTxEnvelope(e.target.value)}
              className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Envelope…</option>
              {envelopes.map((e) => (
                <option key={e.id} value={e.id}>{envelopeLabel(e)}</option>
              ))}
            </select>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                placeholder="0.00"
                className="border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-28"
              />
            </div>
            <input
              type="date"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={txNote}
              onChange={(e) => setTxNote(e.target.value)}
              placeholder="Note (optional)"
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => addTxMutation.mutate({
                envelopeId: txEnvelope,
                data: { amount: txAmount, type: txType, date: txDate, note: txNote || null },
              })}
              disabled={!txEnvelope || !txAmount || addTxMutation.isPending}
              className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {addTxMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {activeForm === 'envelope' && (() => {
        const existingNames = new Set(envelopes.map((e) => e.name))
        const remainingTemplates = ENVELOPE_TEMPLATES.filter((t) => !existingNames.has(t.name))
        const templateGroups = [...new Set(remainingTemplates.map((t) => t.group))]
        return (
          <div className="bg-white rounded-xl border border-indigo-100 shadow-sm p-4 mb-4">
            <h3 className="font-medium text-gray-800 mb-3">New Envelope</h3>
            {remainingTemplates.length > 0 && (
              <div className="mb-3">
                <select
                  value=""
                  onChange={(e) => {
                    const name = e.target.value
                    if (!name) return
                    setEnvName(name)
                    setEnvType(TEMPLATE_TYPE_SUGGESTIONS[name] || '')
                  }}
                  className="w-full border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— pick from suggestions —</option>
                  {templateGroups.map((group) => (
                    <optgroup key={group} label={ENVELOPE_TYPES[group]?.label ?? group}>
                      {remainingTemplates.filter((t) => t.group === group).map((t) => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                value={envName}
                onChange={(e) => setEnvName(e.target.value)}
                placeholder="Or type a custom name…"
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={envType}
                onChange={(e) => setEnvType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Type (optional)</option>
                {Object.entries(ENVELOPE_TYPES).map(([val, { label }]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <button
                onClick={() => createEnvelopeMutation.mutate({ name: envName, envelope_type: envType || null })}
                disabled={!envName.trim() || createEnvelopeMutation.isPending}
                className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Add
              </button>
              <button onClick={() => setActiveForm(null)} className="text-gray-400 hover:text-gray-600 px-2">✕</button>
            </div>
          </div>
        )
      })()}

      {showChecklist && (
        <GettingStartedChecklist steps={checklistSteps} onDismiss={dismissChecklist} />
      )}

      {isCurrentMonth && incomeEntries.length === 0 && envelopes.length > 0 && !newMonthDismissed && !showChecklist && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold text-amber-900 text-sm mb-1">
              New month — {monthLabelStr(month)}
            </p>
            <p className="text-amber-700 text-sm mb-3">No income recorded yet. Get this month started:</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { dismissNewMonth(); toggleForm('income') }}
                className="bg-white border border-amber-300 text-amber-800 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-amber-100 transition-colors"
              >
                + Record income
              </button>
              <button
                onClick={() => { dismissNewMonth(); copyFromPrevMutation.mutate() }}
                disabled={copyFromPrevMutation.isPending}
                className="bg-white border border-amber-300 text-amber-800 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                {copyFromPrevMutation.isPending ? 'Copying…' : '↩ Copy last month\'s budgets'}
              </button>
              <button
                onClick={() => { dismissNewMonth(); navigate('/recurring') }}
                className="bg-white border border-amber-300 text-amber-800 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-amber-100 transition-colors"
              >
                🔁 Apply recurring
              </button>
            </div>
          </div>
          <button onClick={dismissNewMonth} className="text-amber-400 hover:text-amber-700 shrink-0">✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-4 sm:gap-6">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-0.5">Income</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(totalIncome)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-0.5">Allocated</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(totalAllocated)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-0.5">Spent</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(totalSpent)}</p>
          </div>
          <div className="border-l border-gray-100 pl-6">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-0.5">Unallocated</p>
            <p className={`text-2xl font-bold ${unallocated < 0 ? 'text-rose-600' : unallocated === 0 ? 'text-emerald-600' : 'text-amber-500'}`}>
              {fmt(unallocated)}
            </p>
          </div>
          {overBudgetCount > 0 && (
            <div className="border-l border-rose-100 pl-6">
              <p className="text-xs font-medium text-rose-300 uppercase tracking-widest mb-0.5">Over budget</p>
              <p className="text-2xl font-bold text-rose-600">{overBudgetCount}</p>
            </div>
          )}
        </div>

        {incomeEntries.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">{monthLabelStr(month)}</p>
            <div className="flex flex-wrap gap-2">
              {incomeEntries.map((entry) => (
                <div key={entry.id} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${entry.is_estimate ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700'}`}>
                  <span>{entry.source}</span>
                  {entry.is_estimate && <span className="text-xs text-gray-400 italic">est.</span>}
                  <span className="font-medium">{fmt(entry.amount)}</span>
                  <button
                    onClick={() => deleteIncomeMutation.mutate(entry.id)}
                    className={`ml-1 ${entry.is_estimate ? 'text-gray-300 hover:text-gray-500' : 'text-emerald-400 hover:text-emerald-700'}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {totalAllocated > 0 && (() => {
        const TYPE_BAR_COLORS = { needs: '#60a5fa', wants: '#a78bfa', dreams: '#fbbf24', fix: '#fb7185', emergency: '#94a3b8' }
        const byType = {}
        for (const env of envelopes) {
          const t = env.envelope_type
          if (!t) continue
          const p = periodByEnvelope[env.id]
          if (!p) continue
          if (!byType[t]) byType[t] = { allocated: 0, spent: 0 }
          byType[t].allocated += parseFloat(p.allocated ?? 0)
          byType[t].spent += parseFloat(p.spent ?? 0)
        }
        const rows = Object.keys(ENVELOPE_TYPES).filter((t) => byType[t]?.allocated > 0 || byType[t]?.spent > 0)
        if (rows.length === 0) return null
        return (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Spent vs. Budget by Type</p>
            <div className="space-y-3">
              {rows.map((t) => {
                const { allocated, spent } = byType[t]
                const pct = allocated > 0 ? Math.min((spent / allocated) * 100, 100) : 100
                const over = spent > allocated
                const typeInfo = ENVELOPE_TYPES[t]
                return (
                  <div key={t}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block w-2 h-2 rounded-full ${typeInfo.dot}`} />
                        <span className="font-medium text-gray-600">{typeInfo.label}</span>
                      </div>
                      <div className="tabular-nums">
                        <span className={over ? 'text-rose-600 font-semibold' : 'text-gray-700'}>{fmt(spent)}</span>
                        <span className="text-gray-400"> / {fmt(allocated)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: over ? '#f43f5e' : TYPE_BAR_COLORS[t] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {totalIncome > 0 && envelopes.length > 0 && (
        <div className={`rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-4 ${
          unallocated < 0
            ? 'bg-rose-50 border border-rose-100'
            : unallocated === 0
            ? 'bg-emerald-50 border border-emerald-100'
            : 'bg-amber-50 border border-amber-100'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <span className={`text-lg ${
              unallocated < 0 ? 'text-rose-500' : unallocated === 0 ? 'text-emerald-500' : 'text-amber-500'
            }`}>
              {unallocated < 0 ? '⚠' : unallocated === 0 ? '✓' : '●'}
            </span>
            <p className={`text-sm font-medium ${
              unallocated < 0 ? 'text-rose-700' : unallocated === 0 ? 'text-emerald-700' : 'text-amber-700'
            }`}>
              {unallocated < 0
                ? `Over-allocated by ${fmt(Math.abs(unallocated))} — reduce your budget allocations to match income.`
                : unallocated === 0
                ? 'Every dollar has a job. Your income is fully allocated.'
                : `${fmt(unallocated)} unallocated — give every dollar a job.`}
            </p>
          </div>
          {unallocated !== 0 && (
            <button
              onClick={() => setBudgetMode(true)}
              className={`shrink-0 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${
                unallocated < 0
                  ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              }`}
            >
              {unallocated < 0 ? 'Edit Budget' : 'Allocate'}
            </button>
          )}
        </div>
      )}

      {untypedEnvelopes.length > 0 && !typeNudgeDismissed && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {untypedEnvelopes.length === 1 ? '1 envelope' : `${untypedEnvelopes.length} envelopes`} without a type
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Types group cards and power the Money Map. Pick one for each:</p>
            </div>
            <button onClick={() => setTypeNudgeDismissed(true)} className="text-gray-300 hover:text-gray-500 text-sm shrink-0 ml-4">✕</button>
          </div>
          <div className="flex flex-col gap-2">
            {untypedEnvelopes.map((env) => (
              <div key={env.id} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 min-w-0 flex-1 truncate">{env.name}</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return
                    setEnvelopeTypeMutation.mutate({ id: env.id, type: e.target.value })
                  }}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                >
                  <option value="">Set type…</option>
                  {Object.entries(ENVELOPE_TYPES).map(([val, { label }]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {loadingEnvelopes ? (
        <div className="text-gray-400 text-center py-12">Loading…</div>
      ) : envelopes.length === 0 ? (
        <div className="space-y-4">
          <InlineTip icon="📬" title="Create your first envelope">
            Envelopes are spending categories — Groceries, Rent, Gas, etc. Click <strong>+ Add Envelope</strong> above to create one, or use the <strong>?</strong> button to run the setup wizard and create several at once.
          </InlineTip>
        </div>
      ) : totalIncome === 0 && envelopes.length > 0 ? (
        <div className="mb-4">
          <InlineTip icon="💰" title="Record your income">
            You have envelopes but no income recorded this month. Click <strong>+ Add Income</strong> to enter your take-home pay so you can allocate it to your envelopes.
          </InlineTip>
        </div>
      ) : mapMode ? (
        <MoneyMap
          envelopes={envelopes}
          periodByEnvelope={periodByEnvelope}
          totalIncome={totalIncome}
          household={household}
          householdId={household.id}
        />
      ) : budgetMode ? (
        <BudgetTable
          envelopes={envelopes}
          periodByEnvelope={periodByEnvelope}
          householdId={household.id}
          month={month}
          totalIncome={totalIncome}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={envelopeIds} strategy={rectSortingStrategy}>
            <div className="space-y-8">
              {groupEnvelopes(envelopes).map(({ group, items }) => {
                let gAllocated = 0, gBalance = 0
                if (group) {
                  for (const e of items) {
                    const p = periodByEnvelope[e.id]
                    if (p) { gAllocated += parseFloat(p.allocated); gBalance += parseFloat(p.balance) }
                  }
                }
                const typeInfo = ENVELOPE_TYPES[group]
                return (
                <div key={group || '__untyped__'}>
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => toggleGroup(group)}
                      className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors"
                    >
                      <span className="text-[10px] leading-none">{collapsedGroups.has(group) ? '▶' : '▼'}</span>
                      {typeInfo && <span className={`inline-block w-2 h-2 rounded-full ${typeInfo.dot}`} />}
                      {typeInfo ? typeInfo.label : 'Untagged'}
                    </button>
                    {group && (
                      <div className="ml-auto flex items-center gap-3">
                        <span className="text-xs tabular-nums text-gray-400">{fmt(gAllocated)} allocated</span>
                        <span className={`text-xs tabular-nums font-medium ${gBalance < 0 ? 'text-rose-500' : gBalance === 0 ? 'text-gray-400' : 'text-emerald-600'}`}>{fmt(gBalance)} left</span>
                      </div>
                    )}
                  </div>
                  <div className={collapsedGroups.has(group) ? 'hidden' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'}>
                    {items.map((env) => (
                      <SortableCard
                        key={env.id}
                        envelope={env}
                        period={periodByEnvelope[env.id]}
                        prevPeriod={prevPeriodByEnvelope[env.id]}
                        householdId={household.id}
                        month={month}
                      />
                    ))}
                  </div>
                </div>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </Layout>
  )
}
