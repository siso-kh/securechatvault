
import { useState } from 'react'
import PoliciesTable from '../../components/policies/PoliciesTable'
import '../../styles/policies.css'

function AdminPolicies() {

  const [policies, setPolicies] = useState([
    {
      id: 1,
      name: 'Email',
      category: 'PII',
      severity: 'high',
      action: 'Mask before send',
      enabled: true
    },
    {
      id: 2,
      name: 'Phone',
      category: 'PII',
      severity: 'medium',
      action: 'Mask before send',
      enabled: true
    },
    {
      id: 3,
      name: 'API key',
      category: 'Secret',
      severity: 'high',
      action: 'Block message',
      enabled: true
    },
    {
      id: 4,
      name: 'Password after keyword',
      category: 'Secret',
      severity: 'high',
      action: 'Block message',
      enabled: true
    },
    {
      id: 5,
      name: 'Credit card',
      category: 'Financial',
      severity: 'high',
      action: 'Mask before send',
      enabled: true
    },
    {
      id: 6,
      name: 'IP address',
      category: 'Network',
      severity: 'low',
      action: 'Warn only',
      enabled: false
    },
    {
      id: 7,
      name: 'JWT',
      category: 'Token',
      severity: 'high',
      action: 'Block message',
      enabled: true
    }
  ])

  return (
    <div className="policies-page">

      <div className="policies-header">

        <h1>Policies</h1>

        <button className="add-rule-btn">
          Add rule
        </button>

      </div>

      <PoliciesTable
        policies={policies}
        setPolicies={setPolicies}
      />

    </div>
  )
}

export default AdminPolicies
