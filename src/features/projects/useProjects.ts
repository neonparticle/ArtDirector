import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { commands } from "@/lib/bindings";
import { qk } from "@/lib/query-keys";
import { useUi } from "@/stores/ui";

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: () => commands.listProjects() });
}

export function useFolders(projectId: number | null) {
  return useQuery({
    queryKey: qk.folders(projectId ?? -1),
    queryFn: () => commands.listFolders(projectId as number),
    enabled: projectId != null,
  });
}

export async function pickFolder(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, title: "Add a project folder" });
  return typeof picked === "string" ? picked : null;
}

export function useAddProject() {
  const qc = useQueryClient();
  const selectProject = useUi((s) => s.selectProject);
  return useMutation({
    mutationFn: (path: string) => commands.addProject(path),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: qk.projects });
      selectProject(project.id);
    },
  });
}

export function useRemoveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => commands.removeProject(id),
    onSuccess: (_, id) => {
      const ui = useUi.getState();
      if (ui.projectId === id) ui.selectProject(null);
      for (const key of [qk.projects, qk.assetsAll, qk.kindsAll, qk.tagsAll]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; name: string; excludes: string[] }) =>
      commands.updateProject(v.id, v.name, v.excludes),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}

export function useRescan() {
  return useMutation({ mutationFn: (id: number) => commands.rescanProject(id) });
}
