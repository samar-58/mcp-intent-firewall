import { useState } from "react";
import type { NavSection } from "./components/shared/types";
import { useFirewallData } from "./hooks/useFirewallData";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { PolicyManager } from "./components/PolicyManager";
import { McpRegistry } from "./components/McpRegistry";
import { AuditTrail } from "./components/AuditTrail";
import { Conversations } from "./components/Conversations";
import { IconRefresh } from "./components/shared";

export function App() {
  const [activeSection, setActiveSection] = useState<NavSection>("dashboard");
  const data = useFirewallData();

  return (
    <div className="shell">
      <Sidebar
        active={activeSection}
        onNavigate={setActiveSection}
        pendingCount={data.pendingApprovals.length}
      />

      <div className="main">
        <header className="topbar">
          <div className="topbar__left">
            <h1 className="topbar__title">{sectionTitle(activeSection)}</h1>
            <p className="topbar__sub">{sectionSubtitle(activeSection)}</p>
          </div>
          <div className="topbar__actions">
            <button className="btn btn--ghost" onClick={data.refreshMcp}>
              <IconRefresh />
              Rediscover MCP
            </button>
            <button className="btn btn--ghost" onClick={data.refresh}>
              <IconRefresh />
              Refresh
            </button>
          </div>
        </header>

        <div className="content">
          {activeSection === "dashboard" && (
            <Dashboard
              readyServers={data.readyServers}
              totalServers={data.health.length}
              toolCount={data.tools.length}
              enabledPolicyCount={data.enabledPolicyCount}
              pendingCount={data.pendingApprovals.length}
              latestOutcome={data.latestLog?.outcome}
              message={data.message}
              onChoosePrompt={data.choosePrompt}
              onSendChat={data.sendChat}
              busy={data.busy}
              visibleResponse={data.visibleResponse}
              visibleRunLog={data.visibleRunLog}
              latestConversation={data.latestConversation}
              pendingApprovals={data.pendingApprovals}
              resolvingApprovalId={data.resolvingApprovalId}
              onResolveApproval={data.resolveApproval}
            />
          )}
          {activeSection === "policies" && (
            <PolicyManager
              tools={data.tools}
              policies={data.policies}
              conditionalPolicies={data.conditionalPolicies}
              inactivePolicies={data.inactivePolicies}
              newRule={data.newRule}
              setNewRule={data.setNewRule}
              onTogglePolicy={data.togglePolicy}
              onCreatePolicy={data.createPolicy}
              onSetToolPermission={data.setToolPermission}
            />
          )}
          {activeSection === "registry" && (
            <McpRegistry
              health={data.health}
              tools={data.tools}
              onRefreshMcp={data.refreshMcp}
            />
          )}
          {activeSection === "audit" && <AuditTrail logs={data.logs} />}
          {activeSection === "history" && (
            <Conversations conversations={data.conversations} />
          )}
        </div>
      </div>
    </div>
  );
}

function sectionTitle(section: NavSection): string {
  switch (section) {
    case "dashboard": return "Dashboard";
    case "policies": return "Policy Manager";
    case "registry": return "MCP Registry";
    case "audit": return "Audit Trail";
    case "history": return "Conversations";
  }
}

function sectionSubtitle(section: NavSection): string {
  switch (section) {
    case "dashboard": return "Monitor and control your guarded agent";
    case "policies": return "Configure tool permissions and guardrails";
    case "registry": return "Discover and manage MCP servers";
    case "audit": return "Review tool call decisions and outcomes";
    case "history": return "Browse past agent conversations";
  }
}
