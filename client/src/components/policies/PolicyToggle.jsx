
function PolicyToggle({ enabled, onChange }) {

  return (
    <button
      type="button"
      className={`policy-toggle ${enabled ? 'enabled' : ''}`}
      onClick={onChange}
      aria-label={enabled ? 'Disable policy' : 'Enable policy'}
      aria-pressed={enabled}
    >
      <span className="toggle-circle"></span>
    </button>
  )
}

export default PolicyToggle
