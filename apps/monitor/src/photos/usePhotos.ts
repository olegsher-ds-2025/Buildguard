import { useQuery } from "@tanstack/react-query";
import type { PhotoTag } from "@buildguard/shared-types";
import { api } from "../api";

export interface PhotoFilter {
  inspectionId?: string;
  checklistItemId?: string;
  defectId?: string;
  tag?: PhotoTag;
}

export function usePhotos(projectId: string, filter: PhotoFilter) {
  return useQuery({
    queryKey: ["photos", projectId, filter],
    queryFn: () => api.listPhotos(projectId, filter),
  });
}
