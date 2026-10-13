import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PhotoLinks, PhotoMarkupShape, PhotoSummary, PhotoTag } from "@buildguard/shared-types";
import { api } from "../api";
import { t, type MessageKey } from "../i18n/he";
import { isNetworkError, useOffline } from "../offline/OfflineProvider";
import { compressImage } from "./compressImage";
import { PhotoMarkup } from "./PhotoMarkup";

interface Props {
  projectId: string;
  links: PhotoLinks;
  allowedTags: PhotoTag[];
  defaultTag: PhotoTag;
  onDone: (photo?: PhotoSummary) => void;
  onCancel?: () => void;
}

interface Picked {
  blob: Blob;
  takenAt: string;
}

function currentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 8000, maximumAge: 60000 });
  });
}

export function PhotoCapture({ projectId, links, allowedTags, defaultTag, onDone, onCancel }: Props) {
  const queryClient = useQueryClient();
  const { queuePhoto } = useOffline();
  const fileInput = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [processing, setProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shapes, setShapes] = useState<PhotoMarkupShape[]>([]);
  const [tag, setTag] = useState<PhotoTag>(defaultTag);
  const [withGps, setWithGps] = useState(false);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    if (!picked) return;
    const url = URL.createObjectURL(picked.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [picked]);

  const save = useMutation({
    mutationFn: async (): Promise<PhotoSummary | undefined> => {
      const blob = picked!.blob;
      const contentType = blob.type || "image/jpeg";
      const position = withGps ? await currentPosition() : null;
      const meta = {
        tag,
        ...links,
        takenAt: picked!.takenAt,
        ...(shapes.length > 0 && { markup: shapes }),
        ...(position && { gpsLat: position.coords.latitude, gpsLng: position.coords.longitude }),
      };
      const queue = async () => {
        await queuePhoto({ projectId, blob, contentType, meta });
        setQueued(true);
        return undefined;
      };
      if (!navigator.onLine) return queue();
      try {
        const { photoId, uploadUrl } = await api.createPhotoUpload(projectId, { contentType });
        const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
        if (!put.ok) throw Object.assign(new Error(`storage upload failed (${put.status})`), { status: put.status });
        return await api.confirmPhotoUpload(projectId, photoId, meta);
      } catch (err) {
        if (isNetworkError(err)) return queue();
        throw err;
      }
    },
    onSuccess: (photo) => {
      void queryClient.invalidateQueries({ queryKey: ["photos", projectId] });
      if (links.inspectionId) void queryClient.invalidateQueries({ queryKey: ["inspection", projectId, links.inspectionId] });
      void queryClient.invalidateQueries({ queryKey: ["defects", projectId] });
      if (photo) onDone(photo);
    },
  });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProcessing(true);
    const takenAt = new Date().toISOString();
    const blob = await compressImage(file);
    setShapes([]);
    setPicked({ blob, takenAt });
    setProcessing(false);
  }

  if (queued) {
    return (
      <div className="card photo-capture">
        <p className="item-meta">{t("offline.photoQueued")}</p>
        <div className="capture-actions">
          <button type="button" className="primary" onClick={() => onDone()}>
            {t("offline.close")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card photo-capture">
      <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      {previewUrl && picked ? (
        <>
          <PhotoMarkup src={previewUrl} shapes={shapes} onChange={setShapes} />
          <p className="item-meta">{t("photos.markup.hint")}</p>
          <label className="capture-field">
            {t("photos.tag")}
            <select value={tag} onChange={(e) => setTag(e.target.value as PhotoTag)}>
              {allowedTags.map((tg) => (
                <option key={tg} value={tg}>
                  {t(`photos.tag.${tg}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="capture-check">
            <input type="checkbox" checked={withGps} onChange={(e) => setWithGps(e.target.checked)} />
            {t("photos.saveGps")}
          </label>
        </>
      ) : (
        <button type="button" className="primary capture-big" onClick={() => fileInput.current?.click()} disabled={processing}>
          {processing ? t("photos.processing") : t("photos.takePhoto")}
        </button>
      )}
      {save.isPending && <p className="item-meta">{t("photos.uploading")}</p>}
      {save.isError && <p className="form-error">{t("photos.saveFailed")}</p>}
      <div className="capture-actions">
        {picked && (
          <>
            <button type="button" className="primary" onClick={() => save.mutate()} disabled={save.isPending}>
              {t("photos.save")}
            </button>
            <button type="button" onClick={() => fileInput.current?.click()} disabled={save.isPending}>
              {t("photos.retake")}
            </button>
          </>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={save.isPending}>
            {t("photos.cancel")}
          </button>
        )}
      </div>
    </div>
  );
}
