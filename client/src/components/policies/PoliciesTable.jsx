import PolicyRow from './PolicyRow'

function PoliciesTable({ policies, onToggle, onEdit, onDelete }) {
  return (
    <div className="policies-table-container">
      <table className="policies-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Severity</th>
            <th>Action</th>
            <th>Enabled</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {policies.map((policy) => (
            <PolicyRow
              key={policy._id}
              policy={policy}
              onToggle={() => onToggle(policy)}
              onEdit={() => onEdit(policy)}
              onDelete={() => onDelete(policy)}
            />
          ))}

          {policies.length === 0 && (
            <tr>
              <td colSpan="6" style={{ textAlign: 'center', padding: '25px 0' }}>
                No policies yet. Add your first rule.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default PoliciesTable