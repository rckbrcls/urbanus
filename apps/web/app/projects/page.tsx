'use client';

import { useState, useMemo } from 'react';
import ProjectCard from '@/components/ProjectCard';
import ProjectListItem from '@/components/ProjectListItem';
import ProjectsToolbar, { type SortOption, type ViewMode } from '@/components/ProjectsToolbar';
import { useProjects } from '../../stores/useProjectStore';
import { useTranslation } from '@/i18n';

import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ProjectsPage() {
  const { data: projects = [], isLoading, isError, error, refetch, isFetching } = useProjects();
  const t = useTranslation('projects');
  const tc = useTranslation('common');

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // Filter by name
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }

    // Filter by area range
    const min = parseFloat(minArea);
    const max = parseFloat(maxArea);
    if (!isNaN(min)) {
      result = result.filter((p) => p.areaKm2 >= min);
    }
    if (!isNaN(max)) {
      result = result.filter((p) => p.areaKm2 <= max);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest': return b.createdAt - a.createdAt;
        case 'oldest': return a.createdAt - b.createdAt;
        case 'name-az': return a.name.localeCompare(b.name);
        case 'name-za': return b.name.localeCompare(a.name);
        case 'area-desc': return b.areaKm2 - a.areaKm2;
        case 'area-asc': return a.areaKm2 - b.areaKm2;
        case 'streets-desc': return b.stats.streetCount - a.stats.streetCount;
        case 'streets-asc': return a.stats.streetCount - b.stats.streetCount;
        default: return 0;
      }
    });

    return result;
  }, [projects, search, sortBy, minArea, maxArea]);

  return (
    <div className="flex flex-1 flex-col gap-8 px-6 pb-6 pt-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{t.title}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t.subtitle}
          </p>
        </div>
        <Link
          href="/map"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          {t.newProject}
        </Link>
      </div>

      {/* Toolbar */}
      {projects.length > 0 && (
        <ProjectsToolbar
          search={search}
          onSearchChange={setSearch}
          sortBy={sortBy}
          onSortChange={setSortBy}
          minArea={minArea}
          onMinAreaChange={setMinArea}
          maxArea={maxArea}
          onMaxAreaChange={setMaxArea}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filteredCount={filteredProjects.length}
          totalCount={projects.length}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 py-20 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="max-w-md space-y-2 px-6">
            <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              {error instanceof Error ? error.message : 'Failed to load projects'}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {isFetching ? tc.loading : t.subtitle}
            </p>
          </div>
          <Button onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? tc.loading : tc.retry}
          </Button>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 py-20 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
            <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">{t.noProjectsTitle}</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.noProjectsDescription}</p>
          <Link
            href="/map"
            className="mt-6 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {t.goToMap}
          </Link>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
          <Search className="mb-2 h-8 w-8" />
          <p className="text-sm">{t.filters.noResults}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredProjects.map((project) => (
            <ProjectListItem key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
