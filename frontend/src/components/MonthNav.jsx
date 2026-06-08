import { thisMonth, monthLabel, shiftMonth } from '../utils'

export default function MonthNav({ month, onChange, children }) {
  const isCurrent = month === thisMonth()
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        className="text-gray-400 hover:text-gray-700 px-1 transition-colors leading-none"
        title="Previous month"
      >←</button>
      <span className="text-sm text-gray-600 font-medium w-32 text-center">
        {monthLabel(new Date(month + 'T00:00:00'))}
      </span>
      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        className="text-gray-400 hover:text-gray-700 px-1 transition-colors leading-none"
        title="Next month"
      >→</button>
      {!isCurrent && (
        <button
          onClick={() => onChange(thisMonth())}
          className="text-xs text-indigo-600 hover:text-indigo-800 ml-1 transition-colors"
        >Today</button>
      )}
      {children}
    </div>
  )
}
