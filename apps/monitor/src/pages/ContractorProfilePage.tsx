import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/** Not project-scoped — a contractor's own categories/availability, used by the matching engine on every tender. */
export function ContractorProfilePage() {
  const queryClient = useQueryClient();

  const profile = useQuery({
    queryKey: ["contractor-profile-me"],
    queryFn: () => api.getMyContractorProfile(),
  });

  const workCategories = useQuery({
    queryKey: ["work-categories"],
    queryFn: () => api.listWorkCategories(),
  });

  const update = useMutation({
    mutationFn: (patch: { currentlyAvailable?: boolean; categoryIds?: string[] }) =>
      api.updateMyContractorProfile(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contractor-profile-me"] }),
  });

  if (profile.isLoading) return <div className="page-loading">Loading your profile…</div>;
  if (profile.isError || !profile.data) return <div className="page-error">Could not load your contractor profile.</div>;

  const selectedIds = new Set(profile.data.categories.map((c) => c.id));

  function toggleCategory(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update.mutate({ categoryIds: Array.from(next) });
  }

  return (
    <div className="wrap">
      <h1>{profile.data.companyName}</h1>
      <p className="sub">Verification: {profile.data.verificationStatus}</p>

      <section className="section">
        <div className="card">
          <label style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
            <input
              type="checkbox"
              checked={profile.data.currentlyAvailable}
              onChange={(e) => update.mutate({ currentlyAvailable: e.target.checked })}
              disabled={update.isPending}
            />
            Currently available for new tenders
          </label>
        </div>
      </section>

      <section className="section">
        <h2>Work categories</h2>
        <p className="hint">Used by the matching engine to invite you to relevant tenders.</p>
        <div className="card" style={{ display: "flex", gap: ".8rem", flexWrap: "wrap" }}>
          {workCategories.data?.map((c) => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
              <input
                type="checkbox"
                checked={selectedIds.has(c.id)}
                onChange={() => toggleCategory(c.id)}
                disabled={update.isPending}
              />
              {c.name}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
