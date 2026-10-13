import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatAmount } from "../format";
import { t, tenderStatusLabel } from "../i18n/he";

export function TendersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [scopeDescription, setScopeDescription] = useState("");
  const [workCategoryId, setWorkCategoryId] = useState("");
  const [budgetMinMinor, setBudgetMinMinor] = useState("");
  const [budgetMaxMinor, setBudgetMaxMinor] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [error, setError] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api.listMembers(projectId!),
    enabled: !!projectId,
  });
  const myRole = members.data?.find((m) => m.userId === user?.id)?.role;
  const canManageTenders = myRole === "owner" || myRole === "project_manager";

  const workCategories = useQuery({
    queryKey: ["work-categories"],
    queryFn: () => api.listWorkCategories(),
    enabled: canManageTenders,
  });

  const tenders = useQuery({
    queryKey: ["tenders", projectId],
    queryFn: () => api.listTenders(projectId!),
    enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createTender(projectId!, {
        title,
        scopeDescription,
        workCategoryId,
        budgetMinMinor,
        budgetMaxMinor,
        currency,
      }),
    onSuccess: () => {
      setTitle("");
      setScopeDescription("");
      setBudgetMinMinor("");
      setBudgetMaxMinor("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["tenders", projectId] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? t("tenders.createError") : t("tenders.unreachable"));
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  if (tenders.isLoading) return <div className="page-loading">{t("tenders.loading")}</div>;
  if (tenders.isError) return <div className="page-error">{t("tenders.loadError")}</div>;

  return (
    <div className="wrap">
      <h1>{t("tenders.title")}</h1>
      <p className="sub">{t("tenders.subtitle")}</p>

      {canManageTenders && (
        <section className="section">
          <div className="card upload-card">
            <form onSubmit={onSubmit} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder={t("tenders.form.title")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{ flex: 2, minWidth: "12rem" }}
              />
              <select value={workCategoryId} onChange={(e) => setWorkCategoryId(e.target.value)} required>
                <option value="" disabled>
                  {t("tenders.form.category")}
                </option>
                {workCategories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder={t("tenders.form.budgetMin")}
                value={budgetMinMinor ? Number(budgetMinMinor) / 100 : ""}
                onChange={(e) => setBudgetMinMinor(String(Math.round(Number(e.target.value) * 100)))}
                required
                style={{ width: "8rem" }}
              />
              <input
                type="number"
                placeholder={t("tenders.form.budgetMax")}
                value={budgetMaxMinor ? Number(budgetMaxMinor) / 100 : ""}
                onChange={(e) => setBudgetMaxMinor(String(Math.round(Number(e.target.value) * 100)))}
                required
                style={{ width: "8rem" }}
              />
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: "5rem" }} />
              <textarea
                placeholder={t("tenders.form.scope")}
                value={scopeDescription}
                onChange={(e) => setScopeDescription(e.target.value)}
                required
                style={{ flexBasis: "100%" }}
              />
              <button type="submit" className="primary" disabled={create.isPending}>
                {create.isPending ? t("tenders.form.creating") : t("tenders.form.create")}
              </button>
            </form>
            {error && <p className="form-error">{error}</p>}
          </div>
        </section>
      )}

      <section className="section">
        {tenders.data?.length === 0 ? (
          <p className="hint">{t("tenders.empty")}</p>
        ) : (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>{t("tenders.col.title")}</th>
                  <th>{t("tenders.col.category")}</th>
                  <th>{t("tenders.col.budget")}</th>
                  <th>{t("tenders.col.status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tenders.data?.map((tender) => (
                  <tr key={tender.id}>
                    <td>{tender.title}</td>
                    <td>{tender.workCategory.name}</td>
                    <td>
                      {formatAmount(tender.budgetMinMinor)}–
                      {formatAmount(tender.budgetMaxMinor)} {tender.currency}
                    </td>
                    <td>{tenderStatusLabel(tender.status)}</td>
                    <td>
                      <Link to={`/projects/${projectId}/tenders/${tender.id}`}>{t("tenders.view")}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
