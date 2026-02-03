'use client';

import { use } from 'react';
import { useProject } from '../../../stores/useProjectStore';
import { ProjectEditor } from './ProjectEditor';

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { data: project, isLoading } = useProject(id);

    return <ProjectEditor project={project} isLoading={isLoading} />;
}
