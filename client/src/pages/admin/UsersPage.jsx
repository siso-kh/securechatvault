import { useEffect, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import {
  listUsers,
  setUserRole,
  setUserBanned,
  deleteUser,
} from '../../services/users'
import '../../styles/users.css'

const apiError = (err) =>
  err.response?.data?.error || 'Cannot reach the server. Try again.'

const PAGE_SIZE = 10

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'admins', label: 'Admins' },
  { id: 'banned', label: 'Banned' },
]

const roleLabel = (role) => (role === 'admin' ? 'Admin' : 'User')
const nextRole = (role) => (role === 'admin' ? 'user' : 'admin')

export default function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState(null) // null = loading
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [busyId, setBusyId] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)

  useEffect(() => {
    listUsers()
      .then((data) => setUsers(data.users))
      .catch((err) => setError(apiError(err)))
  }, [])

  const replaceUser = (updated) =>
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))

  async function handleRole(user, role) {
    if (role === user.role) return
    setError('')
    setBusyId(user.id)
    try {
      replaceUser(await setUserRole(user.id, role))
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggleBan(user) {
    setError('')
    setBusyId(user.id)
    try {
      replaceUser(await setUserBanned(user.id, !user.isBanned))
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(user) {
    setError('')
    setBusyId(user.id)
    try {
      await deleteUser(user.id)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      setConfirmingId(null)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusyId(null)
    }
  }

  function changeTab(next) {
    setTab(next)
    setVisible(PAGE_SIZE)
    setConfirmingId(null)
  }

  function changeSearch(value) {
    setSearch(value)
    setVisible(PAGE_SIZE)
    setConfirmingId(null)
  }

  const filteredUsers = (users ?? []).filter((user) => {
    if (tab === 'admins' && user.role !== 'admin') return false
    if (tab === 'banned' && !user.isBanned) return false
    return `${user.name} ${user.email} ${user.role}`
      .toLowerCase()
      .includes(search.toLowerCase())
  })

  const shownUsers = filteredUsers.slice(0, visible)
  const remaining = filteredUsers.length - shownUsers.length

  return (
    <div className="users-page">
      <div className="users-head">
        <div className="users-title">
          <h1>Users</h1>
          {users && (
            <span className="users-count">
              {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
            </span>
          )}
        </div>
      </div>

      <div className="users-toolbar">
        <div role="tablist" aria-label="Filter users" className="users-tabs">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className="users-tab"
              onClick={() => changeTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          type="search"
          className="users-search"
          placeholder="Search users"
          aria-label="Search users"
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="users-error">
          {error}
        </p>
      )}
      {!users && !error && <p className="users-loading">Loading…</p>}

      {users && (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th className="users-actions-col">Actions</th>
              </tr>
            </thead>

            <tbody>
              {shownUsers.map((user) => {
                const isSelf = user.id === me?.id
                const busy = busyId === user.id
                const confirming = confirmingId === user.id

                return (
                  <tr key={user.id} className={user.isBanned ? 'is-banned' : ''}>
                    <td>
                      <span className="user-name">
                        {user.name}
                        {isSelf && ' (you)'}
                      </span>
                      <span className="user-email">{user.email}</span>
                    </td>

                    <td>
                      {isSelf ? (
                        <span className="role-text">{roleLabel(user.role)}</span>
                      ) : (
                        <button
                          type="button"
                          className={`role-toggle role-${user.role}`}
                          aria-label={`Role for ${user.email}: ${roleLabel(user.role)}, click to make ${roleLabel(nextRole(user.role))}`}
                          title={`Click to make ${roleLabel(nextRole(user.role))}`}
                          disabled={busy}
                          onClick={() => handleRole(user, nextRole(user.role))}
                        >
                          {roleLabel(user.role)}
                        </button>
                      )}
                    </td>

                    <td>
                      <span className={`user-status ${user.isBanned ? 'banned' : ''}`}>
                        <span className="user-status-dot" />
                        {user.isBanned ? 'Banned' : 'Active'}
                      </span>
                    </td>

                    <td className="users-actions-col">
                      {confirming ? (
                        <div className="user-confirm">
                          <span>Delete?</span>
                          <button
                            type="button"
                            className="confirm-delete"
                            disabled={busy}
                            onClick={() => handleDelete(user)}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="confirm-cancel"
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        !isSelf && (
                          <div className="user-actions">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleToggleBan(user)}
                            >
                              {user.isBanned ? 'Unban' : 'Ban'}
                            </button>
                            <button
                              type="button"
                              className="action-delete"
                              disabled={busy}
                              onClick={() => setConfirmingId(user.id)}
                            >
                              Delete
                            </button>
                          </div>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}

              {shownUsers.length === 0 && (
                <tr>
                  <td colSpan="4" className="users-empty">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {remaining > 0 && (
            <div className="users-more">
              <button type="button" onClick={() => setVisible((n) => n + PAGE_SIZE)}>
                Load more ({remaining})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
