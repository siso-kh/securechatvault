
import { ShieldCheck, Users, FileText, Activity } from 'lucide-react'

export default function AdminDashboard() {
  return (
    <div className="p-8">

      <div className="mb-8">
        <h1 className="text-3xl font-semibold">
          Admin Dashboard
        </h1>

        <p className="mt-2 text-sm text-muted">
          Welcome to the SecureChat Vault administration panel.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

        <div className="rounded-lg border border-line bg-surface p-5">
          <ShieldCheck size={25} className="mb-3 text-crimson" />
          <h2 className="text-lg font-medium">Security Policies</h2>
          <p className="mt-2 text-sm text-muted">
            Manage security rules and sensitive data detection.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <Users size={25} className="mb-3 text-crimson" />
          <h2 className="text-lg font-medium">Users</h2>
          <p className="mt-2 text-sm text-muted">
            Manage registered users.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <Activity size={25} className="mb-3 text-crimson" />
          <h2 className="text-lg font-medium">Activity</h2>
          <p className="mt-2 text-sm text-muted">
            Monitor application activity.
          </p>
        </div>

      </div>
    </div>
  )
}
