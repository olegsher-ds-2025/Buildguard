import { useQuery } from "@tanstack/react-query";
import type { ProjectRole } from "@buildguard/shared-types";
import { api } from "./api";
import { useAuth } from "./auth";

export const REVIEWER_ROLES: ProjectRole[] = ["owner", "project_manager", "inspector"];

export function useMyProjectRole(projectId: string | undefined) {
  const { user } = useAuth();
  const members = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api.listMembers(projectId!),
    enabled: !!projectId,
  });
  const role = members.data?.find((m) => m.userId === user?.id)?.role;
  return { role, isLoading: members.isLoading, isReviewer: !!role && REVIEWER_ROLES.includes(role) };
}
