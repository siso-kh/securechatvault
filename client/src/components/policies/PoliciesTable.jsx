
import PolicyRow from './PolicyRow'

function PoliciesTable({ policies, setPolicies }) {

  function togglePolicy(id) {

    setPolicies(prev =>
      prev.map(policy =>
        policy.id === id
          ? { ...policy, enabled: !policy.enabled }
          : policy
      )
    )

  }

  function deletePolicy(id) {

    setPolicies(prev =>
      prev.filter(policy => policy.id !== id)
    )

  }

  function editPolicy(id) {
    alert(`Edit policy ${id}`)
  }

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

          {policies.map(policy => (

            <PolicyRow
              key={policy.id}
              policy={policy}
              onToggle={() => togglePolicy(policy.id)}
              onEdit={() => editPolicy(policy.id)}
              onDelete={() => deletePolicy(policy.id)}
            />

          ))}

        </tbody>

      </table>

    </div>

  )
}

export default PoliciesTable
