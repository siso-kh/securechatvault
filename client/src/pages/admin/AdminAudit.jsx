import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import DataTable from '../../components/common/DataTable'
import { formatDate } from '../../utils/formatDate'
import { listAudit } from '../../services/audit'

const apiError = (err) =>
  err.response?.data?.error || 'Cannot reach the server. Try again.'

const details = (meta) =>
  meta && Object.keys(meta).length
    ? Object.entries(meta)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' · ')
    : '—'

const COLUMNS = [
  {
    key: 'createdAt',
    label: 'When',
    width: '150px',
    render: (log) => <span className="text-muted">{formatDate(log.createdAt)}</span>,
  },
  {
    key: 'actor',
    label: 'Actor',
    render: (log) => log.actor?.email ?? 'unknown',
  },
  {
    key: 'action',
    label: 'Action',
    render: (log) => <code className="text-xs">{log.action}</code>,
  },
  {
    key: 'target',
    label: 'Target',
    render: (log) => <span className="text-xs text-muted">{log.target ?? '—'}</span>,
  },
  {
    key: 'meta',
    label: 'Details',
    render: (log) => <span className="text-xs text-muted">{details(log.meta)}</span>,
  },
]

export default function AdminAudit() {
  const [logs, setLogs] = useState(null) // null = loading
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    listAudit()
      .then((data) => setLogs(data.logs))
      .catch((err) => setError(apiError(err)))
  }, [])

  async function refresh() {
    setRefreshing(true)
    setError('')
    try {
      setLogs((await listAudit()).logs)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setRefreshing(false)
    }
  }

  const filtered = (logs ?? []).filter((log) =>
    `${log.action} ${log.actor?.email ?? ''} ${log.target ?? ''} ${details(log.meta)}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Audit log</h1>
          <p className="mt-2 text-sm text-muted">
            Every administrative action, newest first.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search audit log"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-sm border border-line bg-bg px-3 py-2 text-sm placeholder:text-faint focus:border-crimson focus:outline-none"
          />
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh audit log"
            title="Refresh"
            className="grid size-9 place-items-center rounded-sm border border-line text-muted hover:text-ink disabled:opacity-50"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-xs text-danger">
          {error}
        </p>
      )}

      {!logs && !error && <p className="text-sm text-muted">Loading…</p>}

      {logs && (
        <DataTable
          columns={COLUMNS}
          rows={filtered}
          empty={search ? 'No entries match your search.' : 'No admin actions recorded yet.'}
        />
      )}
    </div>
  )
}
