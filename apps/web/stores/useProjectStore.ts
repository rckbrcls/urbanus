import type { BoundingBox } from "@/features/map";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage, getErrorMessageFromResponse } from "@/lib/errors";
import type { SewerNetwork } from "@/types/sewer";

export interface ProjectStats {
  streetCount: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  bounds: BoundingBox;
  areaKm2: number;
  center: [number, number];
  zoom: number;
  stats: ProjectStats;
  streets: GeoJSON.FeatureCollection;
  sewerNetwork?: SewerNetwork | null;
}

const API_URL = "/api/projects";
const REQUEST_TIMEOUT_MS = 15_000;

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error("Request timed out");
    }
    throw error;
  }
};

// API Functions
const fetchProjects = async (): Promise<Project[]> => {
  const response = await fetchWithTimeout(API_URL);
  if (!response.ok) {
    const message = await getErrorMessageFromResponse(
      response,
      "Failed to fetch projects",
    );
    throw new Error(message);
  }
  return response.json();
};

const fetchProject = async (id: string): Promise<Project> => {
  const response = await fetchWithTimeout(`${API_URL}/${id}`);
  if (!response.ok) {
    const message = await getErrorMessageFromResponse(
      response,
      "Failed to fetch project",
    );
    throw new Error(message);
  }
  return response.json();
};

const createProject = async (project: Project): Promise<Project> => {
  const response = await fetchWithTimeout(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!response.ok) {
    const message = await getErrorMessageFromResponse(
      response,
      "Failed to create project",
    );
    throw new Error(message);
  }
  return response.json();
};

const deleteProject = async (id: string): Promise<void> => {
  const response = await fetchWithTimeout(`${API_URL}/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const message = await getErrorMessageFromResponse(
      response,
      "Failed to delete project",
    );
    throw new Error(message);
  }
};

const updateProject = async (project: Project): Promise<Project> => {
  // Use POST with upsert (server uses replace_one with upsert=True)
  const response = await fetchWithTimeout(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!response.ok) {
    const message = await getErrorMessageFromResponse(
      response,
      "Failed to update project",
    );
    throw new Error(message);
  }
  return response.json();
};

// React Query Hooks
export const useProjects = () => {
  return useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
    retry: 1,
  });
};

export const useProject = (id: string) => {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: () => fetchProject(id),
    enabled: !!id,
    retry: 1,
  });
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to create project"));
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to delete project"));
    },
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProject,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", data.id] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to update project"));
    },
  });
};
