import { useState } from "react";
import type { PhotoSummary } from "@buildguard/shared-types";
import { t, type MessageKey } from "../i18n/he";
import { PhotoMarkup } from "./PhotoMarkup";
import { usePhotos, type PhotoFilter } from "./usePhotos";

export function PhotoStrip({ projectId, filter }: { projectId: string; filter: PhotoFilter }) {
  const photos = usePhotos(projectId, filter);
  const [selected, setSelected] = useState<PhotoSummary | null>(null);

  if (!photos.data || photos.data.length === 0) return null;

  return (
    <>
      <div className="photo-strip">
        {photos.data.map((photo) => (
          <button
            key={photo.id}
            type="button"
            className="photo-thumb"
            aria-label={t("photos.open")}
            onClick={() => setSelected(photo)}
          >
            <PhotoMarkup src={photo.url} shapes={photo.markup} />
            <span className="photo-tag">{t(`photos.tag.${photo.tag}` as MessageKey)}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="photo-modal" role="dialog" aria-modal="true" onClick={() => setSelected(null)}>
          <div className="photo-modal-body" onClick={(e) => e.stopPropagation()}>
            <PhotoMarkup src={selected.url} shapes={selected.markup} />
            <div className="photo-modal-bar">
              <span className="photo-tag">{t(`photos.tag.${selected.tag}` as MessageKey)}</span>
              <button type="button" onClick={() => setSelected(null)}>
                {t("photos.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
