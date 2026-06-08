import { useState } from 'react'
import { today, nextMonthOf, fmt } from '../utils'

const SOURCE_DEFAULTS = { fixed: 'Salary', hourly: 'Wages', variable: 'Freelance' }

export default function IncomeForm({ onSave, onCancel, isPending }) {
  const [incomeType, setIncomeType] = useState('fixed')
  const [incomeSource, setIncomeSource] = useState('Salary')
  const [incomeAmount, setIncomeAmount] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState('40')
  const [incomeDate, setIncomeDate] = useState(today())
  const [incomeBudgetMonth, setIncomeBudgetMonth] = useState('')

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

  const handleSave = () => {
    if (!incomeAmount || !incomeSource) return
    onSave({
      amount: incomeAmount,
      source: incomeSource,
      date: incomeDate,
      budget_month: incomeBudgetMonth || undefined,
    })
  }

  const nm = nextMonthOf(incomeDate)
  const sameLabel = new Date((incomeDate || today()) + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-white rounded-xl border border-indigo-100 shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-800">Record Income</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      {/* Income type tiles */}
      <div className="grid grid-cols-3 gap-2 mb-4">
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
            <span className="text-xs text-gray-400 leading-tight hidden sm:block">{desc}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <input
          value={incomeSource}
          onChange={(e) => setIncomeSource(e.target.value)}
          placeholder="Source label (e.g. Salary)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {incomeType === 'hourly' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={hourlyRate}
                  onChange={(e) => updateHourly(e.target.value, hoursPerWeek)}
                  placeholder="Hourly rate"
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <input
                type="number"
                min="1"
                max="80"
                step="1"
                value={hoursPerWeek}
                onChange={(e) => updateHourly(hourlyRate, e.target.value)}
                placeholder="Hours / week"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {parseFloat(incomeAmount) > 0 && (
              <div className="bg-indigo-50 rounded-lg px-4 py-2.5 text-sm text-indigo-700 font-medium">
                ≈ {fmt(incomeAmount)} / month
                <span className="ml-2 text-xs font-normal text-indigo-400">({fmt(hourlyRate)} × {hoursPerWeek} hrs × 52 ÷ 12)</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
                placeholder={incomeType === 'variable' ? 'Typical monthly take-home' : 'Monthly take-home amount'}
                className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {incomeType === 'variable' && (
              <p className="text-xs text-amber-600">Use a conservative estimate — record the actual amount each month.</p>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <input
            type="date"
            value={incomeDate}
            onChange={(e) => { setIncomeDate(e.target.value); setIncomeBudgetMonth('') }}
            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={incomeBudgetMonth}
            onChange={(e) => setIncomeBudgetMonth(e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="Which month to budget this income toward"
          >
            <option value="">Budget → {sameLabel}</option>
            <option value={nm.first}>Budget → {nm.label}</option>
          </select>
          <button
            onClick={handleSave}
            disabled={!incomeAmount || !incomeSource || isPending}
            className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
