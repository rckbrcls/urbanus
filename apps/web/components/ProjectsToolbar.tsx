'use client';

import { useTranslation } from '@/i18n';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Search, ArrowUpDown, LayoutGrid, List, X } from 'lucide-react';

export type SortOption =
  | 'newest'
  | 'oldest'
  | 'name-az'
  | 'name-za'
  | 'area-desc'
  | 'area-asc'
  | 'streets-desc'
  | 'streets-asc';

export type ViewMode = 'grid' | 'list';

interface ProjectsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
  minArea: string;
  onMinAreaChange: (value: string) => void;
  maxArea: string;
  onMaxAreaChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  filteredCount: number;
  totalCount: number;
}

export default function ProjectsToolbar({
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  minArea,
  onMinAreaChange,
  maxArea,
  onMaxAreaChange,
  viewMode,
  onViewModeChange,
  filteredCount,
  totalCount,
}: ProjectsToolbarProps) {
  const t = useTranslation('projects');

  const hasActiveFilters = search.trim() !== '' || minArea !== '' || maxArea !== '';
  const isFiltered = filteredCount !== totalCount;

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'newest', label: t.filters.sortNewest },
    { value: 'oldest', label: t.filters.sortOldest },
    { value: 'name-az', label: t.filters.sortNameAZ },
    { value: 'name-za', label: t.filters.sortNameZA },
    { value: 'area-desc', label: t.filters.sortLargestArea },
    { value: 'area-asc', label: t.filters.sortSmallestArea },
    { value: 'streets-desc', label: t.filters.sortMostStreets },
    { value: 'streets-asc', label: t.filters.sortFewestStreets },
  ];

  function handleClearFilters() {
    onSearchChange('');
    onMinAreaChange('');
    onMaxAreaChange('');
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <InputGroup className="min-w-[200px] flex-1">
        <InputGroupAddon>
          <Search className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder={t.filters.search}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </InputGroup>

      {/* Sort */}
      <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
        <SelectTrigger className="w-[180px]">
          <ArrowUpDown className="size-4" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Area Range */}
      <div className="flex items-center">
        <Input
          type="number"
          min={0}
          step={0.1}
          placeholder={t.filters.minArea}
          value={minArea}
          onChange={(e) => onMinAreaChange(e.target.value)}
          className="w-24 rounded-r-none border-r-0 focus-visible:z-10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
        />
        <Input
          type="number"
          min={0}
          step={0.1}
          placeholder={t.filters.maxArea}
          value={maxArea}
          onChange={(e) => onMaxAreaChange(e.target.value)}
          className="w-24 rounded-l-none focus-visible:z-10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
        />
      </div>

      {/* View Toggle */}
      <ToggleGroup
        type="single"
        variant="outline"
        value={viewMode}
        onValueChange={(v) => {
          if (v) onViewModeChange(v as ViewMode);
        }}
      >
        <ToggleGroupItem value="grid" aria-label={t.filters.gridView}>
          <LayoutGrid className="size-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="list" aria-label={t.filters.listView}>
          <List className="size-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearFilters}
          className="text-muted-foreground"
        >
          <X className="mr-1 size-3" />
          {t.filters.clearFilters}
        </Button>
      )}

      {/* Result Count */}
      <span className="ml-auto text-sm text-muted-foreground">
        {isFiltered
          ? `${filteredCount} ${t.filters.projectCountFiltered} ${totalCount} ${t.filters.projectCount}`
          : `${totalCount} ${t.filters.projectCount}`}
      </span>
    </div>
  );
}
