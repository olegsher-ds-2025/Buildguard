import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { MeasurementKind, PlanPoint } from "@buildguard/shared-types";
import { api } from "../api";

export function CadViewerPage() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>();
  const queryClient = useQueryClient();
  const svgRef = useRef<SVGSVGElement>(null);

  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<MeasurementKind>("length");
  const [pendingPoints, setPendingPoints] = useState<PlanPoint[]>([]);

  const viewer = useQuery({
    queryKey: ["cad-viewer", projectId, documentId],
    queryFn: () => api.getCadViewerData(projectId!, documentId!),
    enabled: !!projectId && !!documentId,
  });

  useEffect(() => {
    if (viewer.data) {
      setHiddenLayers(new Set(viewer.data.layers.filter((l) => !l.defaultVisible).map((l) => l.id)));
    }
    // Re-seed exactly when a plan's data first arrives (or a different plan loads), not on every refetch/toggle.
  }, [viewer.data?.documentId]);

  const measurements = useQuery({
    queryKey: ["cad-measurements", projectId, documentId],
    queryFn: () => api.listMeasurements(projectId!, documentId!),
    enabled: !!projectId && !!documentId,
  });

  const createMeasurement = useMutation({
    mutationFn: () => api.createMeasurement(projectId!, documentId!, { kind, points: pendingPoints }),
    onSuccess: () => {
      setPendingPoints([]);
      queryClient.invalidateQueries({ queryKey: ["cad-measurements", projectId, documentId] });
    },
  });

  function toggleLayer(layerId: string) {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }

  function onSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = point.matrixTransform(ctm.inverse());
    setPendingPoints((prev) => [...prev, { x: Math.round(local.x), y: Math.round(local.y) }]);
  }

  const minPoints = kind === "area" ? 3 : 2;

  if (viewer.isLoading) return <div className="page-loading">Loading plan…</div>;
  if (viewer.isError || !viewer.data) return <div className="page-error">Could not load this plan.</div>;

  const data = viewer.data;

  return (
    <div className="wrap">
      <h1>Plan viewer</h1>
      <p className="sub">
        Demo drawing — real DWG/DXF conversion isn't wired up yet (see README). Layers and measurements below are
        fully functional against this canned plan.
      </p>

      <section className="section" style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 500px", minWidth: "320px" }}>
          <div className="card" style={{ padding: 0 }}>
            <svg
              ref={svgRef}
              viewBox={data.viewBox}
              onClick={onSvgClick}
              style={{ width: "100%", height: "auto", cursor: "crosshair", background: "#fafafa" }}
            >
              <g dangerouslySetInnerHTML={{ __html: data.baseSvgMarkup }} />
              {data.layers
                .filter((l) => !hiddenLayers.has(l.id))
                .map((l) => (
                  <g key={l.id} dangerouslySetInnerHTML={{ __html: l.svgMarkup }} />
                ))}
              {pendingPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4} fill="#e0245e" />
              ))}
              {pendingPoints.length > 1 && (
                <polyline
                  points={pendingPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={kind === "area" ? "#e0245e22" : "none"}
                  stroke="#e0245e"
                  strokeWidth={2}
                />
              )}
              {measurements.data?.map((m) => (
                <polyline
                  key={m.id}
                  points={m.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={m.kind === "area" ? "#2d6cdf22" : "none"}
                  stroke="#2d6cdf"
                  strokeWidth={2}
                />
              ))}
            </svg>
          </div>
        </div>

        <div style={{ flex: "0 0 260px" }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Layers</h3>
            {data.layers.map((l) => (
              <label key={l.id} style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".3rem" }}>
                <input
                  type="checkbox"
                  checked={!hiddenLayers.has(l.id)}
                  onChange={() => toggleLayer(l.id)}
                />
                <span style={{ width: "0.8rem", height: "0.8rem", background: l.colorHex, display: "inline-block" }} />
                {l.name}
              </label>
            ))}
          </div>

          <div className="card" style={{ marginTop: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Measure</h3>
            <select value={kind} onChange={(e) => { setKind(e.target.value as MeasurementKind); setPendingPoints([]); }}>
              <option value="length">Length</option>
              <option value="area">Area</option>
            </select>
            <p className="hint">
              Click on the plan to place {minPoints}+ points ({pendingPoints.length} so far).
            </p>
            <div className="row-actions">
              <button onClick={() => setPendingPoints([])} disabled={pendingPoints.length === 0}>
                Clear
              </button>
              <button
                className="primary"
                onClick={() => createMeasurement.mutate()}
                disabled={pendingPoints.length < minPoints || createMeasurement.isPending}
              >
                {createMeasurement.isPending ? "Saving…" : "Save measurement"}
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Saved measurements</h3>
            {measurements.data?.length === 0 ? (
              <p className="hint">None yet.</p>
            ) : (
              <ul style={{ paddingLeft: "1.1rem" }}>
                {measurements.data?.map((m) => (
                  <li key={m.id}>
                    {m.kind}: {m.valueMeters} {m.kind === "length" ? m.unit : `${m.unit}²`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
