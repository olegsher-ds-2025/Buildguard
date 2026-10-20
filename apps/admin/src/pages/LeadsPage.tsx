import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LEAD_AUDIENCE_LABELS,
  LEAD_BUDGET_LABELS,
  LEAD_KIND_LABELS,
  LEAD_PROJECT_KIND_LABELS,
  LEAD_ROLE_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_TEAM_SIZE_LABELS,
  LEAD_TOPIC_LABELS,
  LEAD_TRADE_LABELS,
  type LeadKind,
  type LeadStatus,
  type LeadSummary,
} from "@buildguard/shared-types";
import { api } from "../api";

const STATUSES = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];
const KINDS = Object.keys(LEAD_KIND_LABELS) as LeadKind[];
const AUDIENCES = Object.keys(LEAD_AUDIENCE_LABELS);

function details(lead: LeadSummary): string {
  const parts =
    lead.kind === "register"
      ? [
          lead.role && LEAD_ROLE_LABELS[lead.role],
          lead.projectCount !== null && `${lead.projectCount} פרויקטים`,
          lead.projectStage && `שלב: ${LEAD_STAGE_LABELS[lead.projectStage]}`,
          lead.projectKind && LEAD_PROJECT_KIND_LABELS[lead.projectKind],
          lead.budgetRange && `תקציב: ${LEAD_BUDGET_LABELS[lead.budgetRange]}`,
          lead.needContractors !== null && (lead.needContractors ? "מחפש קבלן" : "לא מחפש קבלן"),
          lead.trades.length > 0 && lead.trades.map((t) => LEAD_TRADE_LABELS[t]).join(", "),
          lead.teamSize && LEAD_TEAM_SIZE_LABELS[lead.teamSize],
          lead.region,
          lead.company,
        ]
      : [lead.topic && LEAD_TOPIC_LABELS[lead.topic]];
  return parts.filter(Boolean).join(" · ");
}

export function LeadsPage() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<LeadKind | "">("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [audience, setAudience] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const filter = { kind: kind || undefined, status: status || undefined, audience: audience || undefined };

  const leads = useQuery({ queryKey: ["admin", "leads", filter], queryFn: () => api.adminListLeads(filter) });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: LeadStatus; staffNotes?: string }) => api.adminUpdateLead(id, body),
    onSuccess: (_lead, { id }) => {
      setNotes((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)));
      queryClient.invalidateQueries({ queryKey: ["admin", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] });
    },
  });

  const exportCsv = useMutation({
    mutationFn: () => api.adminDownloadLeadsCsv(filter),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "leads.csv";
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="wrap" dir="rtl" lang="he">
      <h1>לידים</h1>
      <p className="sub">הרשמות לפיילוט ופניות מדף הנחיתה.</p>

      <div className="filters">
        <label>
          סוג
          <select value={kind} onChange={(e) => setKind(e.target.value as LeadKind | "")}>
            <option value="">הכול</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {LEAD_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          סטטוס
          <select value={status} onChange={(e) => setStatus(e.target.value as LeadStatus | "")}>
            <option value="">הכול</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          קהל
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="">הכול</option>
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {LEAD_AUDIENCE_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <div className="spacer" />
        <button onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending}>
          ייצוא CSV
        </button>
      </div>
      {exportCsv.isError && <p className="form-error">הייצוא נכשל.</p>}
      {update.isError && <p className="form-error">השמירה נכשלה.</p>}

      <section className="section">
        <div className="card">
          {leads.isLoading ? (
            <p className="hint">טוען לידים…</p>
          ) : leads.isError ? (
            <p className="form-error">לא ניתן לטעון לידים.</p>
          ) : leads.data?.length === 0 ? (
            <p className="hint">אין לידים.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>התקבל</th>
                  <th>סוג</th>
                  <th>קהל</th>
                  <th>שם</th>
                  <th>פרטי קשר</th>
                  <th>פרטים</th>
                  <th>הודעה</th>
                  <th>סטטוס</th>
                  <th>הערות צוות</th>
                </tr>
              </thead>
              <tbody>
                {leads.data?.map((l) => {
                  const draft = notes[l.id];
                  return (
                    <tr key={l.id}>
                      <td>{new Date(l.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td>{LEAD_KIND_LABELS[l.kind]}</td>
                      <td>{(l.audience && LEAD_AUDIENCE_LABELS[l.audience]) || "—"}</td>
                      <td>{l.name}</td>
                      <td>
                        <div className="lead-contact">
                          {l.phone && (
                            <a href={`tel:${l.phone}`} dir="ltr">
                              {l.phone}
                            </a>
                          )}
                          {l.email && (
                            <a href={`mailto:${l.email}`} dir="ltr">
                              {l.email}
                            </a>
                          )}
                          {l.marketingOptIn && <span className="hint">מאשר דיוור</span>}
                        </div>
                      </td>
                      <td>{details(l) || "—"}</td>
                      <td className="lead-message">{l.message ?? "—"}</td>
                      <td>
                        <select
                          value={l.status}
                          onChange={(e) => update.mutate({ id: l.id, status: e.target.value as LeadStatus })}
                          disabled={update.isPending}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {LEAD_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="lead-notes">
                          <textarea
                            rows={2}
                            value={draft ?? l.staffNotes ?? ""}
                            onChange={(e) => setNotes((prev) => ({ ...prev, [l.id]: e.target.value }))}
                          />
                          {draft !== undefined && draft !== (l.staffNotes ?? "") && (
                            <button
                              className="primary"
                              onClick={() => update.mutate({ id: l.id, staffNotes: draft })}
                              disabled={update.isPending}
                            >
                              שמירה
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
