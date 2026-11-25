import { useEffect, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import { listUsers, setUserRole, setUserBanned, deleteUser } from '../../services/users'
import '../../styles/users.css'

const apiError = (err) =>
  err.response?.data?.error || 'Cannot reach the server. Try again.'

export default function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState(null) // null = loading
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)

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
    if (!window.confirm(`Delete ${user.email}? This cannot be undone.`)) return
    setError('')
    setBusyId(user.id)
    try {
      await deleteUser(user.id)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusyId(null)
    }
  }

  const filteredUsers = (users ?? []).filter((user) =>
    `${user.name} ${user.email} ${user.role}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (
    <div className="users-page">

      <div className="users-header">
        <h1>Users</h1>

        <div className="users-header-actions">
          <input
            type="search"
            placeholder="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <p role="alert" className="mb-3 text-xs text-danger">{error}</p>}
      {!users && !error && <p className="text-sm text-muted">Loading…</p>}

      {users && (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredUsers.map((user) => {
                const isSelf = user.id === me?.id
                const busy = busyId === user.id

                return (
                  <tr key={user.id}>
                    <td className="user-name">{user.name}{isSelf && ' (you)'}</td>
                    <td>{user.email}</td>

                    <td>
                      <select
                        aria-label={`Role for ${user.email}`}
                        value={user.role}
                        disabled={isSelf || busy}
                        onChange={(e) => handleRole(user, e.target.value)}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>

                    <td>
                      <span className={`user-status ${user.isBanned ? 'banned' : 'active'}`}>
                        <span className="user-status-dot"></span>
                        {user.isBanned ? 'Banned' : 'Active'}
                      </span>
                    </td>

                    <td>
                      <div className="user-actions">
                        <button onClick={() => handleToggleBan(user)} disabled={isSelf || busy}>
                          {user.isBanned ? 'Unban' : 'Ban'}
                        </button>

                        <button onClick={() => handleDelete(user)} disabled={isSelf || busy}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="5" className="users-empty">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
