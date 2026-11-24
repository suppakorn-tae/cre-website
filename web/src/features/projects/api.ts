import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';

import type { Project, ProjectFields } from './validation';

export const PAGE_SIZE = 10;

const keys = {
  all: ['projects'] as const,
  list: (q: string, page: number) => ['projects', 'list', q, page] as const,
  one: (id: string) => ['projects', 'one', id] as const,
};

/** One page of the user's projects, newest first. `q` searches name, nickname and island. */
export function useProjects(q: string, page: number) {
  return useQuery({
    queryKey: keys.list(q, page),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await browserApi().GET('/projects', {
        params: { query: { q: q || undefined, page, page_size: PAGE_SIZE } },
      });
      return data!;
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: keys.one(id),
    queryFn: async () => {
      const { data } = await browserApi().GET('/projects/{project_id}', {
        params: { path: { project_id: id } },
      });
      return data as Project;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProjectFields) => {
      // The contract types the create body as `ProjectFields & Record<string, never>`,
      // which no object satisfies, so the body is cast.
      const { data } = await browserApi().POST('/projects', { body: body as never });
      return data as Project;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProjectFields) => {
      const { data } = await browserApi().PATCH('/projects/{project_id}', {
        params: { path: { project_id: id } },
        body,
      });
      return data as Project;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await browserApi().DELETE('/projects/{project_id}', {
        params: { path: { project_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}
