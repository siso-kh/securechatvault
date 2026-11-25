import { useEffect, useState } from 'react'
import PoliciesTable from '../../components/policies/PoliciesTable'
import {
  listPolicies,
  createPolicy,
  updatePolicy,
  setPolicyEnabled,
  deletePolicy,
} from '../../services/policies'
import '../../styles/policies.css'

const emptyForm = { name: '', pattern: '', category: '', severity: 'high', action: 'mask' }

const apiError = (err) =>
  err.response?.data?.error || 'Cannot reach the server. Try again.'

function AdminPolicies() {
  const [policies, setPolicies] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null = closed, 'new', or the policy being edited
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listPolicies().then(setPolicies).catch((e) => setError(apiError(e)))
  }, [])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function openNew() {
    setForm(emptyForm)
    setFormError('')
    setEditing('new')
  }

  function openEdit(policy) {
    setForm({
      name: policy.name,
      pattern: policy.pattern,
      category: policy.category,
      severity: policy.severity,
      action: policy.action,
    })
    setFormError('')
    setEditing(policy)
  }

  function close() {
    setEditing(null)
    setFormError('')
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const body = { ...form, name: form.name.trim(), category: form.category.trim() }
      if (editing === 'new') {
        const created = await createPolicy(body)
        setPolicies((prev) => [created, ...prev])
      } else {
        const updated = await updatePolicy(editing._id, body)
        setPolicies((prev) => prev.map((p) => (p._id === updated._id ? updated : p)))
      }
      close()
    } catch (err) {
      setFormError(apiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(policy) {
    setError('')
    try {
      const updated = await setPolicyEnabled(policy._id, !policy.enabled)
      setPolicies((prev) => prev.map((p) => (p._id === updated._id ? updated : p)))
    } catch (err) {
      setError(apiError(err))
    }
  }

  async function handleDelete(policy) {
    if (!window.confirm(`Delete "${policy.name}"? This cannot be undone.`)) return
    setError('')
    try {
      await deletePolicy(policy._id)
      setPolicies((prev) => prev.filter((p) => p._id !== policy._id))
    } catch (err) {
      setError(apiError(err))
    }
  }

  return (
    <div className="policies-page">
      <div className="policies-header">
        <h1>Policies</h1>
        <button className="add-rule-btn" onClick={openNew}>
          Add rule
        </button>
      </div>

      {error && <p role="alert" className="mb-3 text-xs text-danger">{error}</p>}
      {!policies && !error && <p className="text-sm text-muted">Loading…</p>}

      {policies && (
        <PoliciesTable
          policies={policies}
          onToggle={handleToggle}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {editing && (
        <div className="rule-overlay" onMouseDown={close}>
          <form
            className="rule-panel"
            onSubmit={handleSave}
            onMouseDown={(e) => e.stopPropagation()}
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
                  maxLength={80}
                  required
                />
              </div>

              <div className="rule-field">
                <label htmlFor="rule-pattern">Regex pattern</label>
                <input
                  id="rule-pattern"
                  name="pattern"
                  value={form.pattern}
                  onChange={handleChange}
                  placeholder="PRJ-[0-9]{4}"
                  maxLength={200}
                  spellCheck={false}
                  required
                />
              </div>

              <div className="rule-field">
                <label htmlFor="rule-category">Category (shown as [CATEGORY])</label>
                <input
                  id="rule-category"
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  placeholder="API_KEY"
                  maxLength={40}
                  required
                />
              </div>

              <div className="rule-field">
                <label htmlFor="rule-severity">Severity</label>
                <select id="rule-severity" name="severity" value={form.severity} onChange={handleChange}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="rule-field">
                <label htmlFor="rule-action">Action</label>
                <select id="rule-action" name="action" value={form.action} onChange={handleChange}>
                  <option value="mask">Mask before send</option>
                  <option value="block">Block message</option>
                  <option value="warn">Warn only</option>
                </select>
              </div>

              {formError && <p role="alert" className="m-0 text-xs text-danger">{formError}</p>}
            </div>

            <div className="rule-panel-actions">
              <button type="submit" className="save-rule-btn" disabled={saving}>
                {saving ? 'Saving…' : editing === 'new' ? 'Save rule' : 'Save changes'}
              </button>
              <button type="button" className="cancel-rule-btn" onClick={close}>
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