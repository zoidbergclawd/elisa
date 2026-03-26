import { useState, useEffect } from 'react';
import { authFetch } from '../../lib/apiClient';

export interface ProjectSummary {
  projectDir: string;
  slug: string;
  sessionId: string;
  goal: string;
  state: string;
  savedAt: string;
  framework?: string;
}

interface Props {
  onSelectProject: (projectDir: string) => void;
}

export default function ProjectPicker({ onSelectProject }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch('/api/projects')
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load projects')))
      .then((data: ProjectSummary[]) => {
        if (!cancelled) {
          setProjects(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-4" data-testid="project-picker-loading">
        <p className="text-sm text-atelier-text-muted animate-pulse">Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-400">Could not load projects</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="p-4" data-testid="project-picker-empty">
        <p className="text-sm text-atelier-text-muted">No projects yet -- build your first nugget!</p>
      </div>
    );
  }

  return (
    <div className="p-4" data-testid="project-picker">
      <h3 className="text-sm font-semibold text-atelier-text-secondary mb-3">Recent Projects</h3>
      <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
        {projects.map(project => (
          <button
            key={project.projectDir}
            onClick={() => onSelectProject(project.projectDir)}
            className="text-left p-3 rounded-xl border border-border-subtle bg-atelier-surface/50 hover:border-accent-sky/40 hover:bg-atelier-surface transition-colors cursor-pointer"
            data-testid="project-card"
          >
            <p className="text-sm font-medium text-atelier-text truncate">
              {project.goal || project.slug}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              {project.savedAt && (
                <span className="text-xs text-atelier-text-muted">
                  {formatDate(project.savedAt)}
                </span>
              )}
              {project.framework && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent-sky/10 text-accent-sky border border-accent-sky/20">
                  {project.framework}
                </span>
              )}
            </div>
            <p className="text-xs text-atelier-text-muted mt-1 capitalize">{project.state}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
