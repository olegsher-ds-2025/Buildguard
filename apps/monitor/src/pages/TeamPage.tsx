import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import type { ProjectRole } from "@buildguard/shared-types";
import { api } from "../api";
import { useAuth } from "../auth";
import { roleLabel, t } from "../i18n/he";

const ROLES: ProjectRole[] = ["owner", "project_manager", "contractor", "inspector", "viewer"];

export function TeamPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("viewer");
  const [error, setError] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api.listMembers(projectId!),
    enabled: !!projectId,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["members", projectId] });
  }

  const invite = useMutation({
    mutationFn: () => api.inviteMember(projectId!, { email, role }),
    onSuccess: () => {
      setEmail("");
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? typeof err.body === "object" && err.body && "message" in err.body
            ? String((err.body as { message: unknown }).message)
            : t("team.addFailed")
          : t("team.unreachable"),
      );
    },
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, role: newRole }: { userId: string; role: ProjectRole }) =>
      api.changeMemberRole(projectId!, userId, { role: newRole }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(projectId!, userId),
    onSuccess: invalidate,
  });

  function onInviteSubmit(e: FormEvent) {
    e.preventDefault();
    invite.mutate();
  }

  if (members.isLoading) return <div className="page-loading">{t("team.loading")}</div>;
  if (members.isError) return <div className="page-error">{t("team.error")}</div>;

  const isOwner = members.data?.some((m) => m.userId === user?.id && m.isOwner) ?? false;

  return (
    <div className="wrap">
      <h1>{t("team.title")}</h1>
      <p className="sub">{t("team.subtitle")}</p>

      {isOwner && (
        <section className="section">
          <div className="card upload-card">
            <form onSubmit={onInviteSubmit} style={{ display: "flex", gap: ".6rem", flex: 1, flexWrap: "wrap" }}>
              <input
                type="email"
                placeholder={t("team.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ flex: 1, minWidth: "14rem" }}
              />
              <select value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
              <button type="submit" className="primary" disabled={invite.isPending}>
                {invite.isPending ? t("team.adding") : t("team.add")}
              </button>
            </form>
          </div>
          {error && <p className="form-error">{error}</p>}
        </section>
      )}

      <section className="section">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>{t("team.name")}</th>
                <th>{t("team.email")}</th>
                <th>{t("team.role")}</th>
                {isOwner && <th></th>}
              </tr>
            </thead>
            <tbody>
              {members.data?.map((m) => (
                <tr key={m.userId}>
                  <td>{m.displayName}</td>
                  <td>{m.email}</td>
                  <td>
                    {isOwner && !m.isOwner ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          changeRole.mutate({ userId: m.userId, role: e.target.value as ProjectRole })
                        }
                        disabled={changeRole.isPending}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{roleLabel(m.role)}</span>
                    )}
                  </td>
                  {isOwner && (
                    <td>
                      {!m.isOwner && (
                        <button onClick={() => remove.mutate(m.userId)} disabled={remove.isPending}>
                          {t("team.remove")}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
