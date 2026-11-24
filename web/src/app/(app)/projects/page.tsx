import { ProjectList } from '@/features/projects/ProjectList';
import { ProjectMocks } from '@/features/projects/ProjectMocks';

export default function ProjectsPage() {
  return (
    <ProjectMocks>
      <ProjectList />
    </ProjectMocks>
  );
}
