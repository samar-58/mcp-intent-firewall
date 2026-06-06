import type { ServiceStatus } from "@mcp-intent-firewall/shared";

const services: ServiceStatus[] = [
  { name: "API", status: "placeholder" },
  { name: "MCP Registry", status: "placeholder" },
  { name: "Policy Engine", status: "placeholder" },
  { name: "Approvals", status: "placeholder" },
];

export function App() {
  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">MCP Intent Firewall</p>
        <h1>Guarded AI Agent Control Plane</h1>
      </section>

      <section className="statusGrid" aria-label="Workspace boundaries">
        {services.map((service) => (
          <article className="statusCard" key={service.name}>
            <h2>{service.name}</h2>
            <span>{service.status}</span>
          </article>
        ))}
      </section>
    </main>
  );
}
