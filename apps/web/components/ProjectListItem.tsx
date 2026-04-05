'use client';

import { Project } from '@/stores/useProjectStore';
import { useRouter } from 'next/navigation';
import { MapThumbnail } from '@/components/MapThumbnail';
import { useTranslation } from '@/i18n';
import { ChevronRight } from 'lucide-react';

interface ProjectListItemProps {
  project: Project;
}

export default function ProjectListItem({ project }: ProjectListItemProps) {
  const router = useRouter();
  const t = useTranslation('projects');

  return (
    <div
      className="group flex cursor-pointer items-center gap-4 rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-200 transition-all hover:shadow-md hover:ring-zinc-300 dark:bg-zinc-900 dark:ring-zinc-800 dark:hover:ring-zinc-700"
      onClick={() => router.push(`/projects/${project.id}`)}
    >
      {/* Small map thumbnail */}
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        <MapThumbnail project={project} />
      </div>

      {/* Name + date */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-zinc-900 transition-colors group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400">
          {project.name}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {new Date(project.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Stats */}
      <div className="hidden items-center gap-6 text-xs text-zinc-500 sm:flex dark:text-zinc-400">
        <span>{project.areaKm2.toFixed(1)} km²</span>
        <span>
          {project.stats.streetCount} {t.streets}
        </span>
      </div>

      {/* Chevron */}
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
    </div>
  );
}
