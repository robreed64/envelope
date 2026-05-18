import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getNotifications } from '../api/notifications'

const SEVERITY = {
  high:   { dot: 'bg-rose-500',  label: 'text-rose-700',  row: 'bg-rose-50  border-l-2 border-l-rose-400'  },
  medium: { dot: 'bg-amber-400', label: 'text-amber-700', row: 'bg-amber-50 border-l-2 border-l-amber-400' },
  low:    { dot: 'bg-gray-300',  label: 'text-gray-600',  row: 'bg-gray-50  border-l-2 border-l-gray-300'  },
}

const DISMISSED_KEY = 'envelope_dismissed_alerts'

function getDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')) }
  catch { return new Set() }
}

function saveDismissed(set) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]))
}

export default function NotificationBell({ householdId }) {
  const navigate = useNavigate()
  const ref = useRef()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(getDismissed)

  const { data } = useQuery({
    queryKey: ['notifications', householdId],
    queryFn: () => getNotifications(householdId).then((r) => r.data),
    enabled: !!householdId,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  const currentMonth = data?.month
  const allAlerts = data?.alerts ?? []

  // clear dismissed keys from past months whenever month changes
  useEffect(() => {
    if (!currentMonth) return
    const fresh = new Set([...dismissed].filter((k) => k.endsWith(currentMonth)))
    if (fresh.size !== dismissed.size) {
      setDismissed(fresh)
      saveDismissed(fresh)
    }
  }, [currentMonth])

  const visible = allAlerts.filter((a) => !dismissed.has(a.id))
  const highCount = visible.filter((a) => a.severity === 'high').length
  const badgeCount = visible.length

  const updateDismissed = (addFn) => {
    const next = new Set(dismissed)
    addFn(next)
    setDismissed(next)
    saveDismissed(next)
  }

  const dismiss = (id) => updateDismissed((next) => next.add(id))

  const dismissAll = () => {
    updateDismissed((next) => visible.forEach((a) => next.add(a.id)))
    setOpen(false)
  }

  // close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative text-gray-400 hover:text-gray-700 transition-colors"
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {badgeCount > 0 && (
          <span className={`absolute -top-1 -right-1 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none ${
            highCount > 0 ? 'bg-rose-500' : 'bg-amber-400'
          }`}>
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 w-screen max-w-xs sm:w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">
              Alerts {badgeCount > 0 && <span className="text-gray-400 font-normal">({badgeCount})</span>}
            </span>
            {visible.length > 0 && (
              <button onClick={dismissAll} className="text-xs text-gray-400 hover:text-gray-600">
                Dismiss all
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                All clear — no alerts this month.
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {visible.map((alert) => {
                  const s = SEVERITY[alert.severity]
                  return (
                    <li key={alert.id} className={`flex items-start gap-3 px-4 py-3 ${s.row}`}>
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${s.dot}`} />
                      <button
                        className={`flex-1 text-left text-xs leading-relaxed ${s.label} hover:opacity-80`}
                        onClick={() => {
                          navigate(`/households/${householdId}/envelopes/${alert.envelope_id}`)
                          setOpen(false)
                        }}
                      >
                        {alert.message}
                      </button>
                      <button
                        onClick={() => dismiss(alert.id)}
                        className="text-gray-300 hover:text-gray-500 text-xs shrink-0 mt-0.5"
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
