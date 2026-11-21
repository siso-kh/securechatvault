
function SidebarItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`sidebar-item ${active ? 'active' : ''}`}
    >
      <Icon size={19} strokeWidth={1.8} />
    </button>
  )
}

export default SidebarItem
