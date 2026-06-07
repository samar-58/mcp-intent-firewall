import type { NavSection } from "./shared/types";
import {
  IconDashboard,
  IconPolicy,
  IconServer,
  IconAudit,
  IconHistory,
  IconShield,
} from "./shared";

const navItems: { id: NavSection; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <IconDashboard /> },
  { id: "policies", label: "Policies", icon: <IconPolicy /> },
  { id: "registry", label: "MCP Registry", icon: <IconServer /> },
  { id: "audit", label: "Audit Trail", icon: <IconAudit /> },
  { id: "history", label: "History", icon: <IconHistory /> },
];

export function Sidebar(props: {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
  pendingCount: number;
}) {
  return (
    <aside className="sidebar" role="navigation" aria-label="Main navigation">
      <div className="sidebar__brand">
        <div className="sidebar__logo">
          <IconShield />
        </div>
        <div className="sidebar__brand-text">
          <span className="sidebar__brand-name">MCP Firewall</span>
          <span className="sidebar__brand-sub">Control Plane</span>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar__item ${props.active === item.id ? "sidebar__item--active" : ""}`}
            onClick={() => props.onNavigate(item.id)}
            aria-current={props.active === item.id ? "page" : undefined}
          >
            <span className="sidebar__item-icon">{item.icon}</span>
            <span className="sidebar__item-label">{item.label}</span>
            {item.id === "dashboard" && props.pendingCount > 0 && (
              <span className="sidebar__badge">{props.pendingCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__status">
          <span className="sidebar__status-dot" />
          <span>System Online</span>
        </div>
      </div>
    </aside>
  );
}
