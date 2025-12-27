import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BoundingBox } from "../app/components/Map/types";

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
}

interface ProjectState {
  projects: Project[];
  addProject: (project: Project) => void;
  deleteProject: (id: string) => void;
  getProject: (id: string) => Project | undefined;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      addProject: (project) =>
        set((state) => ({ projects: [project, ...state.projects] })),
      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
        })),
      getProject: (id) => get().projects.find((p) => p.id === id),
    }),
    {
      name: "project-storage",
    }
  )
);
