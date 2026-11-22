
import PolicyToggle from './PolicyToggle'

function PolicyRow({ policy, onToggle, onEdit, onDelete }) {

  return (
    <tr>

      <td className="policy-name">
        {policy.name}
      </td>

      <td>
        {policy.category}
      </td>

      <td>
        <span className={`severity ${policy.severity}`}>
          <span className="severity-dot"></span>
          {policy.severity}
        </span>
      </td>

      <td>
        {policy.action}
      </td>

      <td>
        <PolicyToggle
          enabled={policy.enabled}
          onChange={onToggle}
        />
      </td>

      <td>
        <div className="policy-actions">

          <button onClick={onEdit}>
            Edit
          </button>

          <button onClick={onDelete}>
            Delete
          </button>

        </div>
      </td>

    </tr>
  )
}

export default PolicyRow
