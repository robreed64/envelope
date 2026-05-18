export default function GettingStartedChecklist({ steps, onDismiss }) {
  const doneCount = steps.filter((s) => s.done).length
  const pct = (doneCount / steps.length) * 100

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-4 mb-6">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">Getting started</h3>
          <p className="text-xs text-gray-500 mt-0.5">{doneCount} of {steps.length} steps complete</p>
        </div>
        <button onClick={onDismiss} className="text-gray-300 hover:text-gray-500 transition-colors text-lg leading-none ml-3 mt-0.5">✕</button>
      </div>

      <div className="w-full bg-indigo-100 rounded-full h-1.5 mb-4">
        <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${step.done ? 'bg-white/50' : 'bg-white shadow-sm'}`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
              step.done ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-500'
            }`}>
              {step.done ? '✓' : i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium leading-tight ${step.done ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-700'}`}>
                {step.label}
              </p>
              {!step.done && step.hint && (
                <p className="text-xs text-gray-400 mt-0.5">{step.hint}</p>
              )}
            </div>
            {!step.done && (
              <button
                onClick={step.action}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium shrink-0 transition-colors"
              >
                {step.actionLabel} →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
