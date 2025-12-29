import { BoundingBox } from "@/types/map-types";
import { create } from "zustand";
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

export interface ProjectState {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  addProject: (project: Project) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  getProject: (id: string) => Project | undefined;
}

const API_URL = "http://localhost:8000";

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  isLoading: false,
  error: null,

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/projects`);
      if (!response.ok) throw new Error("Failed to fetch projects");
      const projects = await response.json();
      set({ projects, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  addProject: async (project) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (!response.ok) throw new Error("Failed to create project");
      const newProject = await response.json();
      set((state) => ({
        projects: [newProject, ...state.projects],
        isLoading: false,
      }));
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  deleteProject: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/projects/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete project");
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        isLoading: false,
      }));
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  getProject: (id) => get().projects.find((p) => p.id === id),
}));
