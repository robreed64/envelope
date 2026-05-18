import { useState } from 'react'

const BANKS = [
  {
    name: 'Chase',
    steps: [
      'Sign in at chase.com and select your account',
      'Click the download icon (↓) near your transaction list',
      'Set your date range (up to 90 days at a time)',
      'Choose "Quicken" (.QFX) as the file format',
      'Click Download and drop the file here',
    ],
  },
  {
    name: 'Varo Bank',
    steps: [
      'Sign in at varomoney.com or open the Varo app',
      'Tap your account and go to "Transactions"',
      'Tap the download or export icon',
      'Select your date range',
      'Choose CSV format (Varo does not support QFX/OFX)',
      'Drop the downloaded file here',
    ],
  },
  {
    name: 'Ally Bank',
    steps: [
      'Sign in at ally.com and select your account',
      'Click "Transactions" in the account menu',
      'Click the download icon (↓) near the transaction list',
      'Choose your date range',
      'Select "Quicken" (.QFX) as the file format',
      'Click Download and drop the file here',
    ],
  },
  {
    name: 'Capital One',
    steps: [
      'Sign in at capitalone.com and open your account',
      'Click "Download" in the transactions section',
      'Set your date range',
      'Choose "Quicken (.QFX)" format',
      'Click Download and drop the file here',
    ],
  },
  {
    name: 'Citibank',
    steps: [
      'Sign in at citi.com and go to your account',
      'Click "Download" in the transaction area',
      'Select your date range',
      'Choose "Quicken" as the format',
      'Click Download and drop the file here',
    ],
  },
  {
    name: 'US Bank',
    steps: [
      'Sign in at usbank.com and select your account',
      'Click "Download Transactions" in account activity',
      'Choose your date range',
      'Select "OFX" or "Quicken" format',
      'Click Download and drop the file here',
    ],
  },
  {
    name: 'TD Bank',
    steps: [
      'Sign in at tdbank.com and view your account',
      'Look for "Download" or "Export" near your transactions',
      'Set your date range',
      'Choose "Quicken" (.QFX) format',
      'Click Download and drop the file here',
    ],
  },
  {
    name: 'Other / Credit Union',
    steps: [
      'Sign in and navigate to your account activity or history',
      'Look for "Download", "Export", or "Download Transactions"',
      'Choose "QFX", "OFX", or "Quicken" as the file format',
      'Prefer QFX/OFX over CSV — it\'s more reliable and includes more detail',
      'Drop the downloaded file in the upload zone above',
    ],
  },
]

export default function BankGuide() {
  const [open, setOpen] = useState(false)
  const [activeBank, setActiveBank] = useState(null)

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">🏦</span>
          <span className="text-sm font-medium text-gray-700">How do I get a file from my bank?</span>
        </div>
        <span className={`text-gray-400 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500 mb-3">
            Select your bank below for step-by-step export instructions. Look for <strong>QFX</strong> or <strong>OFX</strong> format — it's the most reliable. Most banks keep this under "Download" or "Export" near your transaction list.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {BANKS.map((bank) => (
              <button
                key={bank.name}
                onClick={() => setActiveBank(activeBank === bank.name ? null : bank.name)}
                className={`text-left text-sm rounded-lg border px-3 py-2 transition-colors ${
                  activeBank === bank.name
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-medium'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-white'
                }`}
              >
                {bank.name}
              </button>
            ))}
          </div>

          {activeBank && (() => {
            const bank = BANKS.find((b) => b.name === activeBank)
            return (
              <div className="bg-white border border-indigo-100 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-800 mb-2">{bank.name}</p>
                <ol className="space-y-1.5">
                  {bank.steps.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-gray-600">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
