import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { updateMe } from '../api/user'
import { addIncome } from '../api/income'
import { getEnvelopes, createEnvelope } from '../api/envelopes'
import { createPeriod } from '../api/periods'
import { updateHousehold } from '../api/households'
import { today, thisMonth, fmt, ENVELOPE_TYPES, ENVELOPE_TEMPLATES, TEMPLATE_TYPE_SUGGESTIONS } from '../utils'

const TEMPLATES = ENVELOPE_TEMPLATES

const DEFAULT_CHECKED = new Set([
  'Rent / Mortgage', 'Utilities', 'Groceries', 'Dining Out', 'Gas', 'Emergency Fund',
])

const TYPE_SUGGESTIONS = TEMPLATE_TYPE_SUGGESTIONS

const TYPE_DESCRIPTIONS = {
  needs:     'Fixed essentials you must pay every month',
  wants:     'Discretionary lifestyle spending',
  dreams:    'Savings toward goals and big purchases',
  fix:       'Debt repayment',
  emergency: 'Emergency savings buffer',
}

const TEMPLATE_GROUPS = [...new Set(TEMPLATES.map((t) => t.group))]

const TOTAL_STEPS = 5

export default function SetupWizard({ householdId, onClose }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeSource, setIncomeSource] = useState('Salary')
  const [incomeType, setIncomeType] = useState('fixed')
  const [hourlyRate, setHourlyRate] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState('40')

  const [checked, setChecked] = useState(new Set(DEFAULT_CHECKED))
  const [customName, setCustomName] = useState('')
  const [customList, setCustomList] = useState([])

  const [typeAssignments, setTypeAssignments] = useState({})

  const [budgets, setBudgets] = useState({})

  const [saving, setSaving] = useState(false)

  const { data: existingEnvelopes = [] } = useQuery({
    queryKey: ['envelopes', householdId],
    queryFn: () => getEnvelopes(householdId).then((r) => r.data),
    enabled: !!householdId,
  })
  const existingNames = new Set(existingEnvelopes.map((e) => e.name))

  const skipMutation = useMutation({
    mutationFn: () => updateMe({ wizard_skipped: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); onClose() },
  })

  const toggle = (name) => setChecked((prev) => {
    const next = new Set(prev)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  })

  const addCustom = () => {
    const name = customName.trim()
    if (!name || customList.includes(name)) return
    setCustomList((p) => [...p, name])
    setChecked((p) => new Set([...p, name]))
    setCustomName('')
  }

  const allEnvelopes = [
    ...TEMPLATES.map((t) => t.name),
    ...customList,
  ].filter((n) => checked.has(n))

  const getType = (name) => typeAssignments[name] ?? TYPE_SUGGESTIONS[name] ?? 'needs'
  const setType = (name, type) => setTypeAssignments((p) => ({ ...p, [name]: type }))

  const SOURCE_DEFAULTS = { fixed: 'Salary', hourly: 'Wages', variable: 'Freelance' }

  const selectIncomeType = (type) => {
    setIncomeType(type)
    setIncomeSource(SOURCE_DEFAULTS[type])
    if (type !== 'hourly') return
    const r = parseFloat(hourlyRate), h = parseFloat(hoursPerWeek)
    if (r > 0 && h > 0) setIncomeAmount(String(Math.round(r * h * 52 / 12 * 100) / 100))
  }

  const updateHourly = (rate, hours) => {
    setHourlyRate(rate)
    setHoursPerWeek(hours)
    const r = parseFloat(rate), h = parseFloat(hours)
    setIncomeAmount(r > 0 && h > 0 ? String(Math.round(r * h * 52 / 12 * 100) / 100) : '')
  }

  const income = parseFloat(incomeAmount) || 0
  const totalBudgeted = allEnvelopes.reduce((s, n) => s + (parseFloat(budgets[n]) || 0), 0)
  const unallocated = income - totalBudgeted

  const handleFinish = async () => {
    setSaving(true)
    try {
      if (income > 0) {
        await addIncome(householdId, {
          amount: incomeAmount,
          source: incomeSource || 'Income',
          date: today(),
          is_estimate: true,
        })
        await updateHousehold(householdId, { annual_income: income * 12 })
      }

      const newEnvelopes = allEnvelopes.filter((name) => !existingNames.has(name))
      for (let i = 0; i < newEnvelopes.length; i++) {
        const name = newEnvelopes[i]
        const allocated = parseFloat(budgets[name]) || 0
        const { data: env } = await createEnvelope(householdId, {
          name,
          sort_order: existingEnvelopes.length + i + 1,
          envelope_type: getType(name),
        })
        if (allocated > 0) {
          await createPeriod(householdId, env.id, {
            month: thisMonth(),
            allocated,
          })
        }
      }

      await updateMe({ wizard_completed: true })
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['households'] })
      qc.invalidateQueries({ queryKey: ['envelopes', householdId] })
      qc.invalidateQueries({ queryKey: ['periods', householdId] })
      qc.invalidateQueries({ queryKey: ['income', householdId] })
      setStep(6)
    } finally {
      setSaving(false)
    }
  }

  const handleDone = (to = '/') => {
    qc.invalidateQueries({ queryKey: ['envelopes', householdId] })
    onClose()
    if (to !== '/') navigate(to)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            {step > 1 && step < 6 && (
              <button onClick={() => setStep(step - 1)} className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg px-3 py-1.5 transition-colors">← Back</button>
            )}
            <span className="text-xs font-medium text-gray-400">
              {step < 6 ? `Step ${step} of ${TOTAL_STEPS}` : 'Complete'}
            </span>
          </div>
          {step < 6 && (
            <button
              onClick={() => skipMutation.mutate()}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip setup
            </button>
          )}
        </div>

        {/* Progress bar */}
        {step < 6 && (
          <div className="h-1 bg-gray-100 shrink-0">
            <div
              className="h-1 bg-indigo-500 transition-all"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-6">

          {/* Step 1 — Welcome */}
          {step === 1 && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-100 text-3xl flex items-center justify-center mx-auto mb-5">
                🏠
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Welcome to Envelope Budget</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                Envelope budgeting is one of the most effective ways to manage money. The idea is simple:
              </p>
              <div className="text-left space-y-3 bg-gray-50 rounded-xl p-4 mb-6">
                <div className="flex gap-3">
                  <span className="text-lg shrink-0">💰</span>
                  <p className="text-sm text-gray-700"><strong>Every dollar gets a job.</strong> When you get paid, you divide your money into categories — envelopes — before you spend it.</p>
                </div>
                <div className="flex gap-3">
                  <span className="text-lg shrink-0">📬</span>
                  <p className="text-sm text-gray-700"><strong>Spend from the envelope.</strong> Groceries come out of the Groceries envelope. Gas comes out of Gas. When an envelope is empty, you stop spending in that category.</p>
                </div>
                <div className="flex gap-3">
                  <span className="text-lg shrink-0">📊</span>
                  <p className="text-sm text-gray-700"><strong>You stay in control.</strong> No surprises at the end of the month. You always know exactly where your money is going.</p>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-6">This setup takes about 2 minutes. We'll help you create your envelopes and set your first budget.</p>
            </div>
          )}

          {/* Step 2 — Income */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Your monthly income</h2>
              <p className="text-sm text-gray-500 mb-4">Optional — how you get paid determines how we calculate it. You can skip this and add income later.</p>

              {/* Income type tiles */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { key: 'fixed',    icon: '💼', label: 'Fixed',    desc: 'Salary or set monthly pay' },
                  { key: 'hourly',   icon: '⏱',  label: 'Hourly',   desc: 'Paid by the hour' },
                  { key: 'variable', icon: '📈',  label: 'Variable', desc: 'Commission or freelance' },
                ].map(({ key, icon, label, desc }) => (
                  <button
                    key={key}
                    onClick={() => selectIncomeType(key)}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all ${
                      incomeType === key
                        ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xl">{icon}</span>
                    <span className={`text-sm font-semibold ${incomeType === key ? 'text-indigo-700' : 'text-gray-700'}`}>{label}</span>
                    <span className="text-xs text-gray-400 leading-tight">{desc}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source label</label>
                  <input
                    value={incomeSource}
                    onChange={(e) => setIncomeSource(e.target.value)}
                    placeholder="e.g. Salary, Wages, Freelance"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {incomeType === 'hourly' ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">After-tax hourly rate</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            value={hourlyRate}
                            onChange={(e) => updateHourly(e.target.value, hoursPerWeek)}
                            placeholder="0.00"
                            className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Hours per week</label>
                        <input
                          type="number"
                          min="1"
                          max="80"
                          step="1"
                          value={hoursPerWeek}
                          onChange={(e) => updateHourly(hourlyRate, e.target.value)}
                          placeholder="40"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    {income > 0 && (
                      <div className="bg-indigo-50 rounded-lg px-4 py-3 text-sm text-indigo-700 font-medium">
                        ≈ {fmt(income)} / month
                        <span className="ml-2 text-xs font-normal text-indigo-400">({fmt(parseFloat(hourlyRate))} × {hoursPerWeek} hrs × 52 ÷ 12)</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {incomeType === 'variable' ? 'Typical monthly take-home' : 'Monthly take-home amount'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={incomeAmount}
                        onChange={(e) => setIncomeAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    {incomeType === 'variable' && (
                      <p className="text-xs text-amber-600 mt-1.5">Use a conservative estimate — record the actual amount each month from the Income page.</p>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-4">You can add multiple income sources any time from the Income page.</p>
            </div>
          )}

          {/* Step 3 — Choose envelopes */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Choose your envelopes</h2>
              <p className="text-sm text-gray-500 mb-4">Select the spending categories that apply to you. You can add, rename, or remove any of these later.</p>
              <div className="space-y-4">
                {TEMPLATE_GROUPS.map((group) => (
                  <div key={group}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{ENVELOPE_TYPES[group]?.label ?? group}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TEMPLATES.filter((t) => t.group === group).map((t) => {
                        const alreadyExists = existingNames.has(t.name)
                        return alreadyExists ? (
                          <div
                            key={t.name}
                            className="text-left text-sm rounded-lg px-3 py-2 border border-emerald-200 bg-emerald-50 text-emerald-600 cursor-default"
                            title="Already in your budget"
                          >
                            ✓ {t.name}
                          </div>
                        ) : (
                          <button
                            key={t.name}
                            onClick={() => toggle(t.name)}
                            className={`text-left text-sm rounded-lg px-3 py-2 border transition-colors ${
                              checked.has(t.name)
                                ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-medium'
                                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {checked.has(t.name) ? '✓ ' : ''}{t.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {customList.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Custom</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {customList.map((name) => (
                        <button
                          key={name}
                          onClick={() => toggle(name)}
                          className={`text-left text-sm rounded-lg px-3 py-2 border transition-colors ${
                            checked.has(name)
                              ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-medium'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {checked.has(name) ? '✓ ' : ''}{name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustom()}
                    placeholder="Add a custom envelope…"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={addCustom}
                    disabled={!customName.trim()}
                    className="bg-gray-100 text-gray-700 rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-200 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4 — Tag envelope types */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Tag your envelopes</h2>
              <p className="text-sm text-gray-500 mb-4">
                Each envelope belongs to one of five types. The <strong>Money Map</strong> uses these to compare your spending mix against recommended targets for your income level.
              </p>

              <div className="bg-gray-50 rounded-xl p-3 mb-5 space-y-1.5">
                {Object.entries(ENVELOPE_TYPES).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${val.dot}`} />
                    <span className="text-sm font-medium text-gray-700 w-24 shrink-0">{val.label}</span>
                    <span className="text-xs text-gray-400">{TYPE_DESCRIPTIONS[key]}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-400 mb-3">We've pre-filled suggestions — click to change any.</p>

              <div className="space-y-2">
                {allEnvelopes.map((name) => {
                  const current = getType(name)
                  const typeInfo = ENVELOPE_TYPES[current]
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-gray-800 min-w-0 truncate">{name}</span>
                      <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                        {Object.entries(ENVELOPE_TYPES).map(([key, val]) => (
                          <button
                            key={key}
                            onClick={() => setType(name, key)}
                            title={val.label}
                            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                              current === key
                                ? val.badge + ' font-medium'
                                : 'border-gray-200 text-gray-300 hover:border-gray-300 hover:text-gray-500'
                            }`}
                          >
                            {val.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 5 — Set budgets */}
          {step === 5 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Set your monthly budgets</h2>
              <p className="text-sm text-gray-500 mb-4">How much do you want to spend in each category this month? You can change these anytime.</p>

              {income > 0 && (
                <>
                  <div className={`rounded-lg px-4 py-2.5 mb-3 flex items-center justify-between text-sm ${
                    unallocated < 0 ? 'bg-rose-50 text-rose-700' : unallocated === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    <span>Monthly income: <strong>{fmt(income)}</strong></span>
                    <span>{unallocated < 0 ? `Over by ${fmt(Math.abs(unallocated))}` : unallocated === 0 ? 'Fully allocated ✓' : `${fmt(unallocated)} left to allocate`}</span>
                  </div>
                </>
              )}

              <div className="space-y-2">
                {allEnvelopes.map((name) => {
                  const typeInfo = ENVELOPE_TYPES[getType(name)]
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${typeInfo.dot}`} />
                      <span className="flex-1 text-sm text-gray-800">{name}</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={budgets[name] ?? ''}
                          onChange={(e) => setBudgets((p) => ({ ...p, [name]: e.target.value }))}
                          placeholder="0.00"
                          className="border border-gray-300 rounded-lg pl-6 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-32"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              {allEnvelopes.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No envelopes selected — go back and pick some.</p>
              )}
            </div>
          )}

          {/* Step 6 — Done */}
          {step === 6 && (
            <div className="py-2">
              <div className="text-center mb-5">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-3xl flex items-center justify-center mx-auto mb-4">
                  🎉
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">You're all set!</h2>
                <p className="text-sm text-gray-500">Your budget is ready to go.</p>
              </div>

              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600 space-y-1.5 mb-5">
                <p>✓ <strong>{allEnvelopes.length}</strong> envelope{allEnvelopes.length !== 1 ? 's' : ''} created</p>
                {income > 0 && <p>✓ <strong>{fmt(income)}</strong>/month income recorded</p>}
                {totalBudgeted > 0 && <p>✓ <strong>{fmt(totalBudgeted)}</strong> budgeted for {new Date().toLocaleString('default', { month: 'long' })}</p>}
              </div>

              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">What to do next</p>
              <div className="space-y-2">
                {[
                  {
                    icon: '📥',
                    label: 'Import bank transactions',
                    hint: 'Download a file from your bank and assign spending to your envelopes',
                    to: '/import',
                  },
                  {
                    icon: '🔁',
                    label: 'Set up recurring bills',
                    hint: 'Rent, subscriptions, utilities — apply them each month in one click',
                    to: '/recurring',
                  },
                  {
                    icon: '📊',
                    label: 'Go to your dashboard',
                    hint: 'See your envelopes, record income, and track your budget',
                    to: '/',
                  },
                ].map(({ icon, label, hint, to }) => (
                  <button
                    key={to}
                    onClick={() => handleDone(to)}
                    className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50 transition-colors group text-left"
                  >
                    <span className="text-xl shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
                    </div>
                    <span className="text-gray-300 group-hover:text-indigo-500 transition-colors shrink-0">→</span>
                  </button>
                ))}
              </div>

              <p className="text-xs text-gray-400 text-center mt-4">
                Press <kbd className="bg-gray-100 rounded px-1.5 py-0.5">?</kbd> any time for help
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Get started →
            </button>
          )}
          {step === 2 && (
            <button
              onClick={() => setStep(3)}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Next: Choose envelopes →
            </button>
          )}
          {step === 3 && (
            <button
              onClick={() => setStep(4)}
              disabled={checked.size === 0}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              Next: Tag types →
            </button>
          )}
          {step === 4 && (
            <button
              onClick={() => setStep(5)}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Next: Set budgets →
            </button>
          )}
          {step === 5 && (
            <button
              onClick={handleFinish}
              disabled={saving || allEnvelopes.length === 0}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Setting up…' : 'Finish setup →'}
            </button>
          )}
          {step === 6 && (
            <button
              onClick={() => handleDone('/')}
              className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
            >
              Skip for now — go to dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
