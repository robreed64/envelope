export default function InlineTip({ icon = '💡', title, children }) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-4 flex gap-3">
      <span className="text-xl shrink-0 mt-0.5">{icon}</span>
      <div>
        {title && <p className="text-sm font-semibold text-indigo-800 mb-1">{title}</p>}
        <p className="text-sm text-indigo-700 leading-relaxed">{children}</p>
      </div>
    </div>
  )
}
