import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { getHouseholds } from '../api/households'
import { exportBackup, deleteData, restoreBackup } from '../api/backup'
import { triggerDownload } from '../utils'

const ITEMS = [
  {
    key: 'envelopes',
    label: 'Envelopes & budgets',
    desc: 'Envelope definitions, types, rollover settings, and monthly allocations',
    icon: '🗂',
    warn: 'Deleting envelopes also removes all their transactions.',
  },
  {
    key: 'map',
    label: 'Money Map settings',
    desc: 'Financial season and annual income tier',
    icon: '🗺',
    warn: null,
  },
  {
    key: 'recurring',
    label: 'Recurring rules',
    desc: 'Scheduled recurring transaction templates',
    icon: '🔁',
    warn: null,
  },
  {
    key: 'income',
    label: 'Income records',
    desc: 'All recorded income entries',
    icon: '💰',
    warn: null,
  },
  {
    key: 'transactions',
    label: 'Transactions',
    desc: 'All imported and manually entered transactions',
    icon: '📋',
    warn: null,
  },
  {
    key: 'household',
    label: 'Household (start over)',
    desc: 'Delete the entire household and all its data. A fresh household is created and the setup wizard restarts.',
    icon: '🏠',
    warn: 'This deletes everything — envelopes, transactions, income, and settings. You will restart the setup wizard.',
  },
]

export default function DataManagement() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [selected, setSelected] = useState(new Set(ITEMS.filter((i) => i.key !== 'household').map((i) => i.key)))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const [backupFile, setBackupFile] = useState(null)   // parsed JSON
  const [restoreSelected, setRestoreSelected] = useState(new Set())
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState(null)
  const [restoreError, setRestoreError] = useState(null)

  const [exporting, setExporting] = useState(false)

  const { data: households = [] } = useQuery({
    queryKey: ['households'],
    queryFn: () => getHouseholds().then((r) => r.data),
  })
  const household = households[0]

  const invalidateBudgetData = () =>
    ['envelopes', 'households', 'income', 'recurring', 'transactions', 'notifications', 'periods'].forEach(
      (key) => qc.invalidateQueries({ queryKey: [key] })
    )

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const toggleAll = (set) =>
    setSelected(set.size === ITEMS.length ? new Set() : new Set(ITEMS.map((i) => i.key)))

  const toggleRestore = (key) =>
    setRestoreSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const handleExport = async () => {
    if (!household || selected.size === 0) return
    setExporting(true)
    try {
      const res = await exportBackup(household.id, [...selected])
      const date = new Date().toISOString().slice(0, 10)
      triggerDownload(res.data, `envelope-backup-${date}.json`)
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = async () => {
    if (!household || selected.size === 0) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteData(household.id, [...selected])
      setConfirmDelete(false)
      if (selected.has('household')) {
        qc.clear()
        navigate('/')
      } else {
        invalidateBudgetData()
      }
    } catch (err) {
      setDeleteError(err.response?.data?.detail ?? 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        setBackupFile(data)
        setRestoreResult(null)
        setRestoreError(null)
        // pre-select items that are present in the file
        const present = new Set(ITEMS.map((i) => i.key).filter((k) => data[k] !== undefined))
        setRestoreSelected(present)
      } catch {
        setRestoreError('Invalid backup file — could not parse JSON.')
        setBackupFile(null)
      }
    }
    reader.readAsText(file)
  }

  const handleRestore = async () => {
    if (!household || !backupFile || restoreSelected.size === 0) return
    setRestoring(true)
    setRestoreError(null)
    setRestoreResult(null)
    try {
      const res = await restoreBackup(household.id, backupFile, [...restoreSelected])
      setRestoreResult(res.data.restored)
      invalidateBudgetData()
    } catch (err) {
      setRestoreError(err.response?.data?.detail ?? 'Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  const itemsInFile = backupFile ? ITEMS.filter((i) => backupFile[i.key] !== undefined) : []

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Data Management</h1>
        <p className="text-gray-500 text-sm mt-1">Export, restore, or delete your household data</p>
      </div>

      <div className="max-w-2xl space-y-6">

        {/* Item selector */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Select data</h2>
            <button
              onClick={() => toggleAll(selected)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {selected.size === ITEMS.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="space-y-2">
            {ITEMS.map((item) => (
              <label key={item.key} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selected.has(item.key)}
                  onChange={() => toggle(item.key)}
                  className="mt-0.5 rounded"
                />
                <span className="text-lg leading-none mt-0.5">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Export */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Export</h2>
          <p className="text-xs text-gray-400 mb-4">Download selected data as a JSON backup file.</p>
          <button
            onClick={handleExport}
            disabled={exporting || selected.size === 0 || !household}
            className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {exporting ? 'Exporting…' : '↓ Export selected'}
          </button>
        </section>

        {/* Restore */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Restore from backup</h2>
          <p className="text-xs text-gray-400 mb-4">
            Upload a backup file and choose which items to restore. Existing records with matching
            references are skipped — existing envelopes with the same name are not overwritten.
          </p>

          <div className="flex items-center gap-3 mb-4">
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileRef.current.click()}
              className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              {backupFile ? `✓ ${backupFile.household_name || 'backup'} loaded` : '↑ Choose backup file'}
            </button>
            {backupFile && (
              <button
                onClick={() => { setBackupFile(null); setRestoreResult(null); setRestoreError(null); fileRef.current.value = '' }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            )}
          </div>

          {backupFile && (
            <>
              <div className="space-y-2 mb-4">
                {itemsInFile.length === 0 ? (
                  <p className="text-sm text-gray-400">No recognizable data in this file.</p>
                ) : itemsInFile.map((item) => (
                  <label key={item.key} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restoreSelected.has(item.key)}
                      onChange={() => toggleRestore(item.key)}
                      className="mt-0.5 rounded"
                    />
                    <span className="text-base leading-none mt-0.5">{item.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.label}</p>
                      {Array.isArray(backupFile[item.key]) && (
                        <p className="text-xs text-gray-400">{backupFile[item.key].length} records</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              {restoreResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-4 text-sm text-emerald-700">
                  Restored: {Object.entries(restoreResult).map(([k, n]) => `${n} ${k}`).join(', ')}
                </div>
              )}
              {restoreError && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 mb-4 text-sm text-rose-700">
                  {restoreError}
                </div>
              )}

              <button
                onClick={handleRestore}
                disabled={restoring || restoreSelected.size === 0}
                className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {restoring ? 'Restoring…' : '↑ Restore selected'}
              </button>
            </>
          )}
        </section>

        {/* Delete */}
        <section className="bg-white rounded-xl border border-rose-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-rose-700 mb-1">Delete data</h2>
          <p className="text-xs text-gray-400 mb-4">
            Permanently delete selected data. This cannot be undone — export a backup first.
          </p>

          {[...selected].map((k) => {
              const warn = ITEMS.find((i) => i.key === k)?.warn
              return warn ? (
                <div key={k} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-amber-700">
                  ⚠ {warn}
                </div>
              ) : null
          })}

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={selected.size === 0 || !household}
              className="border border-rose-300 text-rose-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-rose-50 disabled:opacity-50 transition-colors"
            >
              Delete selected…
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                Delete {[...selected].join(', ')}?
              </span>
              {deleteError && <span className="text-xs text-rose-600">{deleteError}</span>}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-rose-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                onClick={() => { setConfirmDelete(false); setDeleteError(null) }}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          )}
        </section>

      </div>
    </Layout>
  )
}
