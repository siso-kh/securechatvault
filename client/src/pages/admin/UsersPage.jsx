
import { useState } from 'react'
import '../../styles/users.css'

const initialUsers = [
  { id: 1, name: 'Amelia Hart', email: 'amelia.hart@studio.co', role: 'Owner', status: 'Active' },
  { id: 2, name: 'Jonas Rein', email: 'jonas.rein@studio.co', role: 'Editor', status: 'Active' },
  { id: 3, name: 'Priya Nair', email: 'priya.nair@studio.co', role: 'Editor', status: 'Active' },
  { id: 4, name: 'Tomas Berg', email: 'tomas.berg@studio.co', role: 'Viewer', status: 'Active' },
  { id: 5, name: 'Lena Okafor', email: 'lena.okafor@studio.co', role: 'Editor', status: 'Banned' },
  { id: 6, name: 'Marcus Feld', email: 'marcus.feld@studio.co', role: 'Viewer', status: 'Active' },
  { id: 7, name: 'Sofia Duarte', email: 'sofia.duarte@studio.co', role: 'Editor', status: 'Active' },
  { id: 8, name: 'Ravi Menon', email: 'ravi.menon@studio.co', role: 'Admin', status: 'Active' }
]

export default function UsersPage() {
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState('')

  function toggleBan(id) {
    setUsers(prev =>
      prev.map(user =>
        user.id === id
          ? { ...user, status: user.status === 'Active' ? 'Banned' : 'Active' }
          : user
      )
    )
  }

  function deleteUser(id) {
    setUsers(prev => prev.filter(user => user.id !== id))
  }

  const filteredUsers = users.filter(user =>
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
            onChange={e => setSearch(e.target.value)}
          />

          <button className="invite-user-btn">
            Invite user
          </button>
        </div>
      </div>

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
            {filteredUsers.map(user => (
              <tr key={user.id}>
                <td className="user-name">{user.name}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>

                <td>
                  <span className={`user-status ${user.status.toLowerCase()}`}>
                    <span className="user-status-dot"></span>
                    {user.status}
                  </span>
                </td>

                <td>
                  <div className="user-actions">
                    <button onClick={() => toggleBan(user.id)}>
                      {user.status === 'Active' ? 'Ban' : 'Unban'}
                    </button>

                    <button onClick={() => deleteUser(user.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

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

    </div>
  )
}
