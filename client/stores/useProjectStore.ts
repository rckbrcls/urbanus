import { BoundingBox } from "@/types/map-types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
  if (!response.ok) throw new Error("Failed to fetch projects");
  return response.json();
};

const fetchProject = async (id: string): Promise<Project> => {
  const response = await fetch(`${API_URL}/projects/${id}`);
  if (!response.ok) throw new Error("Failed to fetch project");
  return response.json();
};

const createProject = async (project: Project): Promise<Project> => {
  const response = await fetch(`${API_URL}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!response.ok) throw new Error("Failed to create project");
  return response.json();
};

const deleteProject = async (id: string): Promise<void> => {
  const response = await fetch(`${API_URL}/projects/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete project");
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
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
};
