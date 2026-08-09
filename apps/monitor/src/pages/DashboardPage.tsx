import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { formatMoney, formatPercent } from "../format";

export function DashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const dashboard = useQuery({
    queryKey: ["dashboard", projectId],
    queryFn: () => api.getProjectDashboard(projectId!),
    enabled: !!projectId,
  });

  if (dashboard.isLoading) return <div className="page-loading">Loading project…</div>;
  if (dashboard.isError || !dashboard.data) return <div className="page-error">Could not load this project.</div>;

  const d = dashboard.data;

  return (
    <div className="wrap">
      <h1>{d.project.name}</h1>
      <p className="sub">{d.project.address}</p>

      <div className="grid kpis">
        <div className="card kpi">
          <div className="label">Progress</div>
          <div className="value">{formatPercent(d.overallProgressPct)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Budget used</div>
          <div className="value">
            {formatPercent((Number(d.budget.totalActualMinor) / Number(d.budget.totalPlannedMinor)) * 100)}
          </div>
          <div className="note">
            {formatMoney(d.budget.totalActualMinor, d.budget.currency)} of{" "}
            {formatMoney(d.budget.totalPlannedMinor, d.budget.currency)}
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Next milestone</div>
          {d.nextMilestone ? (
            <>
              <div className="value">
                {d.nextMilestone.daysRemaining}
                <span style={{ fontSize: "1rem", fontWeight: 400, color: "var(--muted)" }}> days</span>
              </div>
              <div className="note">{d.nextMilestone.name}</div>
            </>
          ) : (
            <div className="note">None scheduled</div>
          )}
        </div>
        <div className="card kpi">
          <div className="label">Open findings</div>
          <div className="value">{d.openFindingsCount}</div>
          <div className="note">{d.openFindingsCount === 0 ? "all reviewed" : "awaiting review"}</div>
        </div>
      </div>

      <section className="section">
        <h2>Phase timeline</h2>
        <p className="hint">Progress blends task completion and verified milestones.</p>
        <div className="card">
          {d.phases.map((p) => (
            <div className="phase" key={p.id}>
              <div className="name">
                {p.name}
                <em>{p.status.replace("_", " ")}</em>
              </div>
              <div className="bar">
                <i className={p.progressPct >= 100 ? "ok" : ""} style={{ width: `${Math.min(100, p.progressPct)}%` }} />
              </div>
              <div className="pct">{formatPercent(p.progressPct)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Budget</h2>
        <p className="hint">Planned vs. actual by line.</p>
        {d.budget.burnTier !== "ok" && (
          <div className={`alert ${d.budget.burnTier}`}>
            <span>{d.budget.burnTier === "critical" ? "✖" : "⚠"}</span>
            <div>
              <strong>
                {d.budget.burnRate === null ? "Spending with no measured progress" : `Burn rate ${d.budget.burnRate}×`}
                {" — "}
              </strong>
              {formatMoney(d.budget.totalActualMinor, d.budget.currency)} spent at{" "}
              {formatPercent(d.overallProgressPct)} progress.
            </div>
          </div>
        )}
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th className="num">Planned</th>
                <th className="num">Actual</th>
                <th className="num">Used</th>
              </tr>
            </thead>
            <tbody>
              {d.budget.lines.map((line) => {
                const planned = Number(BigInt(line.plannedAmountMinor));
                const actual = Number(BigInt(line.actualAmountMinor));
                const pct = planned > 0 ? (actual / planned) * 100 : 0;
                return (
                  <tr key={line.category}>
                    <td>{line.category}</td>
                    <td className="num">{formatMoney(line.plannedAmountMinor, line.currency)}</td>
                    <td className={`num${actual > planned ? " over" : ""}`}>
                      {formatMoney(line.actualAmountMinor, line.currency)}
                    </td>
                    <td className={`num${pct > 100 ? " over" : ""}`}>{formatPercent(pct)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{formatMoney(d.budget.totalPlannedMinor, d.budget.currency)}</td>
                <td className="num">{formatMoney(d.budget.totalActualMinor, d.budget.currency)}</td>
                <td className="num">
                  {formatPercent((Number(d.budget.totalActualMinor) / Number(d.budget.totalPlannedMinor)) * 100)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
