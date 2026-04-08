'use client';

import { Project } from '@/stores/useProjectStore';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MapThumbnail } from '@/components/MapThumbnail';
import { useTranslation } from '@/i18n';
import ProjectContextMenu from '@/components/ProjectContextMenu';

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const [, setIsHovered] = useState(false);
  const t = useTranslation('projects');

  return (
    <ProjectContextMenu project={project}>
      <div
        className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 transition-all hover:shadow-lg hover:ring-zinc-300 dark:bg-zinc-900 dark:ring-zinc-800 dark:hover:ring-zinc-700"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => router.push(`/projects/${project.id}`)}
      >
        {/* Map Thumbnail */}
        <div className="relative aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <MapThumbnail project={project} />

          {/* Overlay Gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-60 transition-opacity group-hover:opacity-40" />

          {/* Date Badge */}
          <div className="absolute top-2 right-2 rounded-md bg-white/90 px-2 py-1 text-[10px] font-medium text-zinc-600 shadow-sm backdrop-blur-sm dark:bg-zinc-900/90 dark:text-zinc-400">
            {new Date(project.createdAt).toLocaleDateString()}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col p-4">
          <h3 className="mb-1 text-base font-semibold text-zinc-900 transition-colors group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400">
            {project.name}
          </h3>

          <div className="mt-auto flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <div className="flex gap-3">
              <span className="flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                {project.areaKm2.toFixed(1)} km²
              </span>
              <span className="flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 01-1.447-.894L15 7m0 13V7" />
                </svg>
                {project.stats.streetCount} {t.streets}
              </span>
            </div>
          </div>
        </div>
      </div>
    </ProjectContextMenu>
  );
}
