import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import { api } from "../api";
import { formatMoney, formatPercent } from "../format";
import { phaseStatusLabel, t } from "../i18n/he";
import { useMyProjectRole } from "../useMyProjectRole";
import { CachedNotice } from "../offline/CachedNotice";

export function DashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const dashboard = useQuery({
    queryKey: ["dashboard", projectId],
    queryFn: () => api.getProjectDashboard(projectId!),
    enabled: !!projectId,
  });

  const { role } = useMyProjectRole(projectId);
  const holdPoints = useQuery({
    queryKey: ["hold-points", projectId],
    queryFn: () => api.listHoldPoints(projectId!),
    enabled: !!projectId && !!role && role !== "contractor",
  });
  const openHoldPoints = holdPoints.data?.filter((h) => h.state === "open").length;

  if (dashboard.isLoading) return <div className="page-loading">{t("dashboard.loading")}</div>;
  if (dashboard.error instanceof ApiError && dashboard.error.status === 403) return <Navigate to="tenders" replace />;
  if (!dashboard.data) return <div className="page-error">{t("dashboard.error")}</div>;

  const d = dashboard.data;

  return (
    <div className="wrap">
      <CachedNotice show={dashboard.isError} />
      <h1>{d.project.name}</h1>
      <p className="sub">{d.project.address}</p>

      <div className="grid kpis">
        <div className="card kpi">
          <div className="label">{t("dashboard.progress")}</div>
          <div className="value">{formatPercent(d.overallProgressPct)}</div>
        </div>
        <div className="card kpi">
          <div className="label">{t("dashboard.budgetUsed")}</div>
          <div className="value">
            {formatPercent((Number(d.budget.totalActualMinor) / Number(d.budget.totalPlannedMinor)) * 100)}
          </div>
          <div className="note">
            {formatMoney(d.budget.totalActualMinor, d.budget.currency)} {t("dashboard.budgetOf")}{" "}
            {formatMoney(d.budget.totalPlannedMinor, d.budget.currency)}
          </div>
        </div>
        <div className="card kpi">
          <div className="label">{t("dashboard.nextMilestone")}</div>
          {d.nextMilestone ? (
            <>
              <div className="value">
                {d.nextMilestone.daysRemaining}
                <span style={{ fontSize: "1rem", fontWeight: 400, color: "var(--muted)" }}> {t("dashboard.days")}</span>
              </div>
              <div className="note">{d.nextMilestone.name}</div>
            </>
          ) : (
            <div className="note">{t("dashboard.noMilestone")}</div>
          )}
        </div>
        <div className="card kpi">
          <div className="label">{t("dashboard.openFindings")}</div>
          <div className="value">{d.openFindingsCount}</div>
          <div className="note">{d.openFindingsCount === 0 ? t("dashboard.allReviewed") : t("dashboard.awaitingReview")}</div>
        </div>
        {openHoldPoints !== undefined && (
          <Link to="hold-points" className="card kpi kpi-link">
            <div className="label">{t("holdPoints.dashboardKpi")}</div>
            <div className={`value${openHoldPoints > 0 ? " warn" : ""}`}>{openHoldPoints}</div>
            <div className="note">{openHoldPoints === 0 ? t("holdPoints.dashboardClear") : t("holdPoints.dashboardNote")}</div>
          </Link>
        )}
      </div>

      <section className="section">
        <h2>{t("dashboard.phases")}</h2>
        <p className="hint">{t("dashboard.phasesHint")}</p>
        <div className="card">
          {d.phases.map((p) => (
            <div className="phase" key={p.id}>
              <div className="name">
                {p.name}
                <em>{phaseStatusLabel(p.status)}</em>
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
        <h2>{t("dashboard.budget")}</h2>
        <p className="hint">{t("dashboard.budgetHint")}</p>
        {d.budget.burnTier !== "ok" && (
          <div className={`alert ${d.budget.burnTier}`}>
            <span>{d.budget.burnTier === "critical" ? "✖" : "⚠"}</span>
            <div>
              <strong>
                {d.budget.burnRate === null ? t("dashboard.noProgress") : `${t("dashboard.burnRate")} ${d.budget.burnRate}×`}
                {" — "}
              </strong>
              {formatMoney(d.budget.totalActualMinor, d.budget.currency)} {t("dashboard.spentAt")}{" "}
              {formatPercent(d.overallProgressPct)} progress.
            </div>
          </div>
        )}
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("dashboard.line")}</th>
                <th className="num">{t("dashboard.planned")}</th>
                <th className="num">{t("dashboard.actual")}</th>
                <th className="num">{t("dashboard.used")}</th>
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
                <td>{t("dashboard.total")}</td>
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
