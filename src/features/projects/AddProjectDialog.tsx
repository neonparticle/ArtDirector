import { FolderPlus, FolderSearch } from "lucide-react";
import { useState } from "react";
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
import { pickFolder, useAddProject } from "./useProjects";

export function AddProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [path, setPath] = useState("");
  const add = useAddProject();

  const browse = async () => {
    const picked = await pickFolder();
    if (picked) setPath(picked);
  };

  const submit = () => {
    if (!path.trim()) return;
    add.mutate(path.trim(), {
      onSuccess: () => {
        setPath("");
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a project</DialogTitle>
          <DialogDescription>
            Point ArtDirector at a repo or folder. It indexes the art inside, skips build output,
            and keeps watching for changes. You can also drop folders straight onto the window.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={browse}
          className="group flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-iron-500 bg-void/40 px-6 py-8 text-dust transition-colors hover:border-ember/70 hover:text-bone"
        >
          <FolderSearch className="size-8 text-ember/80 transition-transform group-hover:scale-110" />
          <span className="text-sm">Browse for a folder</span>
        </button>

        <div className="grid gap-2">
          <Label htmlFor="project-path">Folder path</Label>
          <Input
            id="project-path"
            value={path}
            placeholder="C:\\Users\\you\\dev\\my-game"
            className="font-mono text-xs"
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          {add.error && <p className="text-xs text-arc">{String(add.error)}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!path.trim() || add.isPending}>
            <FolderPlus />
            Add project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
