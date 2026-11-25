
import { useState } from 'react'
import PoliciesTable from '../../components/policies/PoliciesTable'
import '../../styles/policies.css'

const initialPolicies = [
  { id: 1, name: 'Email', category: 'PII', severity: 'high', action: 'Mask before send', enabled: true },
  { id: 2, name: 'Phone', category: 'PII', severity: 'medium', action: 'Mask before send', enabled: true },
  { id: 3, name: 'API key', category: 'Secret', severity: 'high', action: 'Block message', enabled: true },
  { id: 4, name: 'Password after keyword', category: 'Secret', severity: 'high', action: 'Block message', enabled: true },
  { id: 5, name: 'Credit card', category: 'Financial', severity: 'high', action: 'Mask before send', enabled: true },
  { id: 6, name: 'IP address', category: 'Network', severity: 'low', action: 'Warn only', enabled: false },
  { id: 7, name: 'JWT', category: 'Token', severity: 'high', action: 'Block message', enabled: true }
]

const emptyForm = {
  name: '',
  regex: '',
  category: 'PII',
  severity: 'high',
  action: 'Mask before send'
}

function AdminPolicies() {
  const [policies, setPolicies] = useState(initialPolicies)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  function handleSave(e) {
    e.preventDefault()

    const newPolicy = {
      id: Date.now(),
      name: form.name.trim(),
      regex: form.regex.trim(),
      category: form.category,
      severity: form.severity,
      action: form.action,
      enabled: true
    }

    setPolicies(prev => [...prev, newPolicy])
    setForm(emptyForm)
    setIsFormOpen(false)
  }

  function handleCancel() {
    setForm(emptyForm)
    setIsFormOpen(false)
  }

  return (
    <div className="policies-page">

      <div className="policies-header">
        <h1>Policies</h1>

        <button
          className="add-rule-btn"
          onClick={() => setIsFormOpen(true)}
        >
          Add rule
        </button>
      </div>

      <PoliciesTable
        policies={policies}
        setPolicies={setPolicies}
      />

      {isFormOpen && (
        <div className="rule-overlay" onMouseDown={handleCancel}>
          <form
            className="rule-panel"
            onSubmit={handleSave}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="rule-fields">

              <div className="rule-field">
                <label htmlFor="rule-name">Name</label>
                <input
                  id="rule-name"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Enter rule name"
                  required
                />
              </div>

              <div className="rule-field">
                <label htmlFor="rule-regex">Regex pattern</label>
                <input
                  id="rule-regex"
                  name="regex"
                  value={form.regex}
                  onChange={handleChange}
                  placeholder="Enter regex pattern"
                  required
                />
              </div>

              <div className="rule-field">
                <label htmlFor="rule-category">Category</label>
                <select
                  id="rule-category"
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                >
                  <option value="PII">PII</option>
                  <option value="Secret">Secret</option>
                  <option value="Financial">Financial</option>
                  <option value="Network">Network</option>
                  <option value="Token">Token</option>
                </select>
              </div>

              <div className="rule-field">
                <label htmlFor="rule-severity">Severity</label>
                <select
                  id="rule-severity"
                  name="severity"
                  value={form.severity}
                  onChange={handleChange}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="rule-field">
                <label htmlFor="rule-action">Action</label>
                <select
                  id="rule-action"
                  name="action"
                  value={form.action}
                  onChange={handleChange}
                >
                  <option value="Mask before send">Mask before send</option>
                  <option value="Block message">Block message</option>
                  <option value="Warn only">Warn only</option>
                </select>
              </div>

            </div>

            <div className="rule-panel-actions">
              <button type="submit" className="save-rule-btn">
                Save rule
              </button>

              <button
                type="button"
                className="cancel-rule-btn"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  )
}

export default AdminPolicies
