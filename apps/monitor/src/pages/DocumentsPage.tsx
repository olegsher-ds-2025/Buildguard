import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../api";

export function DocumentsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
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
        kind: "plan",
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      });

      // 2. PUT the file straight to object storage (storage-first — bypasses our API entirely).
      const putRes = await fetch(created.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload to storage failed (${putRes.status})`);

      // 3. Confirm — the API independently verifies the object exists before persisting anything.
      await api.confirmDocumentUpload(projectId, created.documentId, created.versionId, {
        title: title || file.name,
        kind: "plan",
      });

      setTitle("");
      if (fileInput.current) fileInput.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  if (documents.isLoading) return <div className="page-loading">Loading documents…</div>;
  if (documents.isError) return <div className="page-error">Could not load documents.</div>;

  return (
    <div className="wrap">
      <h1>Documents</h1>
      <p className="sub">Plans, contracts and other project files.</p>

      <section className="section">
        <div className="card upload-card">
          <input
            type="text"
            placeholder="Title (defaults to filename)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input ref={fileInput} type="file" />
          {error && <p className="form-error">{error}</p>}
          <button className="primary" onClick={onUpload} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload document"}
          </button>
        </div>
      </section>

      <section className="section">
        {documents.data?.length === 0 ? (
          <p className="hint">No documents yet.</p>
        ) : (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Kind</th>
                  <th>Version</th>
                  <th>Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {documents.data?.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.title}</td>
                    <td>{doc.kind}</td>
                    <td>{doc.currentVersion ? `v${doc.currentVersion.versionNo}` : "—"}</td>
                    <td>
                      {doc.currentVersion ? new Date(doc.currentVersion.uploadedAt).toLocaleDateString() : "—"}
                    </td>
                    <td>
                      <button onClick={() => download.mutate(doc.id)} disabled={!doc.currentVersion}>
                        Download
                      </button>
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
