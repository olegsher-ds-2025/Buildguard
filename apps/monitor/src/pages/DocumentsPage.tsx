import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { DocumentKind } from "@buildguard/shared-types";
import { api } from "../api";
import { formatDate } from "../format";
import { he, t, type MessageKey } from "../i18n/he";

const kindLabel = (k: string) => {
  const key = `documents.kind.${k}`;
  return key in he ? t(key as MessageKey) : k;
};

export function DocumentsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DocumentKind>("plan");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const documents = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => api.listDocuments(projectId!),
    enabled: !!projectId,
  });

  const download = useMutation({
    mutationFn: (documentId: string) => api.getDocumentDownloadUrl(projectId!, documentId),
    onSuccess: (res) => {
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
    },
  });

  async function onUpload() {
    const file = fileInput.current?.files?.[0];
    if (!file || !projectId) return;
    setError(null);
    setUploading(true);
    try {
      // 1. Ask our API for a presigned upload URL — no file bytes sent to us yet.
      const created = await api.createDocumentUpload(projectId, {
        title: title || file.name,
        kind,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      });

      // 2. PUT the file straight to object storage (storage-first — bypasses our API entirely).
      const putRes = await fetch(created.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error(`${t("documents.storageFailed")} (${putRes.status})`);

      // 3. Confirm — the API independently verifies the object exists before persisting anything.
      await api.confirmDocumentUpload(projectId, created.documentId, created.versionId, {
        title: title || file.name,
        kind,
      });

      setTitle("");
      if (fileInput.current) fileInput.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("documents.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  if (documents.isLoading) return <div className="page-loading">{t("documents.loading")}</div>;
  if (documents.isError) return <div className="page-error">{t("documents.error")}</div>;

  return (
    <div className="wrap">
      <h1>{t("documents.title")}</h1>
      <p className="sub">{t("documents.subtitle")}</p>

      <section className="section">
        <div className="card upload-card">
          <input
            type="text"
            placeholder={t("documents.titlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
            <option value="plan">{kindLabel("plan")}</option>
            <option value="cad">{kindLabel("cad")}</option>
            <option value="contract">{kindLabel("contract")}</option>
            <option value="other">{kindLabel("other")}</option>
          </select>
          <input ref={fileInput} type="file" />
          {error && <p className="form-error">{error}</p>}
          <button className="primary" onClick={onUpload} disabled={uploading}>
            {uploading ? t("documents.uploading") : t("documents.upload")}
          </button>
        </div>
      </section>

      <section className="section">
        {documents.data?.length === 0 ? (
          <p className="hint">{t("documents.empty")}</p>
        ) : (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>{t("documents.col.title")}</th>
                  <th>{t("documents.col.kind")}</th>
                  <th>{t("documents.col.version")}</th>
                  <th>{t("documents.col.uploaded")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {documents.data?.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.title}</td>
                    <td>{kindLabel(doc.kind)}</td>
                    <td>{doc.currentVersion ? `v${doc.currentVersion.versionNo}` : "—"}</td>
                    <td>
                      {doc.currentVersion ? formatDate(doc.currentVersion.uploadedAt) : "—"}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button onClick={() => download.mutate(doc.id)} disabled={!doc.currentVersion}>
                          {t("documents.download")}
                        </button>
                        {(doc.kind === "plan" || doc.kind === "cad") && (
                          <Link to={`/projects/${projectId}/documents/${doc.id}/cad`}>{t("documents.cadViewer")}</Link>
                        )}
                      </div>
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
