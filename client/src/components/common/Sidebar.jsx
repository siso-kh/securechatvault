
import { useState } from 'react'

import {
  Plus,
  Clock,
  ChartNoAxesColumn,
  ShieldCheck,
  CircleUserRound
} from 'lucide-react'

import SidebarItem from './SidebarItem'

function Sidebar() {

  const [activeItem, setActiveItem] = useState('policies')

  return (
    <aside className="admin-sidebar">

      {/* Top section */}
      <div className="sidebar-top">
        <button className="sidebar-add" title="Ajouter">
          <Plus size={21} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-navigation">

        <SidebarItem
          icon={Clock}
          label="History"
          active={activeItem === 'history'}
          onClick={() => setActiveItem('history')}
        />

        <SidebarItem
          icon={ChartNoAxesColumn}
          label="Analytics"
          active={activeItem === 'analytics'}
          onClick={() => setActiveItem('analytics')}
        />

        <SidebarItem
          icon={ShieldCheck}
          label="Policies"
          active={activeItem === 'policies'}
          onClick={() => setActiveItem('policies')}
        />

      </nav>

      {/* Bottom section */}
      <div className="sidebar-bottom">
        <button className="sidebar-user" title="Profile">
          <CircleUserRound size={19} />
        </button>
      </div>

    </aside>
  )
}

export default Sidebar
