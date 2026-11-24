
import Sidebar from '../components/common/Sidebar'
import DamaskBackground from '../components/common/DamaskBackground'
import '../styles/admin-layout.css'

function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <Sidebar />

      <main className="admin-main">
        <DamaskBackground fill>
          <div className="admin-page-content">
            {children}
          </div>
        </DamaskBackground>
      </main>
    </div>
  )
}

export default AdminLayout
