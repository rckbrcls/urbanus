import type { BoundingBox } from "@/features/map";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { getErrorMessage, getErrorMessageFromResponse } from "@/lib/errors";

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
}

const API_URL = "http://localhost:8000";

// API Functions
const fetchProjects = async (): Promise<Project[]> => {
  const response = await fetch(`${API_URL}/projects`);
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
  const response = await fetch(`${API_URL}/projects/${id}`);
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
  const response = await fetch(`${API_URL}/projects`, {
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
  const response = await fetch(`${API_URL}/projects/${id}`, {
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
  const response = await fetch(`${API_URL}/projects`, {
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
  });
};

export const useProject = (id: string) => {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: () => fetchProject(id),
    enabled: !!id,
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
