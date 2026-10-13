import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { commands, type Project } from "@/lib/bindings";
import { qk } from "@/lib/query-keys";
import { useUpdateProject } from "./useProjects";

export function EditProjectDialog({
  project,
  onOpenChange,
}: {
  project: Project | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [excludes, setExcludes] = useState("");
  const update = useUpdateProject();
  const settings = useQuery({ queryKey: qk.settings, queryFn: () => commands.getSettings() });

  useEffect(() => {
    if (project) {
      setName(project.name);
      setExcludes(project.excludes.join("\n"));
    }
  }, [project]);

  const save = () => {
    if (!project) return;
    update.mutate(
      {
        id: project.id,
        name: name.trim() || project.name,
        excludes: excludes.split(/[\n,]/).map((s) => s.trim()),
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={!!project} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription className="font-mono text-xs" data-selectable>
            {project?.root}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="project-name">Name</Label>
          <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="project-excludes">Excluded folder names</Label>
          <textarea
            id="project-excludes"
            value={excludes}
            onChange={(e) => setExcludes(e.target.value)}
            rows={6}
            placeholder={(settings.data?.defaultExcludes ?? []).join("\n")}
            className="w-full resize-none rounded-md border border-input bg-void/60 px-3 py-2 font-mono text-xs text-bone outline-none placeholder:text-dust/60 focus-visible:border-ember/70 focus-visible:ring-2 focus-visible:ring-ember/25"
          />
          <p className="text-xs text-dust">
            One folder name per line, matched at any depth. Leave empty to use the defaults from
            Settings. Changing this triggers a rescan.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
