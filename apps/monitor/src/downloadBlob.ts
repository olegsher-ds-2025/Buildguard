import { useState } from "react";

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function useDownload(fetchBlob: () => Promise<Blob>, filename: string) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start() {
    setPending(true);
    setFailed(false);
    try {
      saveBlob(await fetchBlob(), filename);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return { start, pending, failed };
}
