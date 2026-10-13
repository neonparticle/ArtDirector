import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CheckCircle2,
  Download,
  FolderSearch,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { type ReactNode, useState } from "react";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useCaptureStore } from "@/features/viewer/model/captureQueue";
import { commands, type Settings } from "@/lib/bindings";
import { formatBytes } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { useUi } from "@/stores/ui";
import { checkForUpdate, installUpdate, useUpdate } from "@/stores/update";

const DEFAULT_EXCLUDES = [
  "node_modules",
  ".git",
  "bin",
  "obj",
  "target",
  "dist",
  "build",
  "Library",
  "publish",
  "Release",
  ".idea",
  ".vs",
  ".vite",
];

export function SettingsDialog() {
  const openState = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const settings = useQuery({ queryKey: qk.settings, queryFn: commands.getSettings });

  return (
    <Dialog open={openState} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Tools, indexing and the thumbnail cache.</DialogDescription>
        </DialogHeader>
        {settings.data && openState && (
          <SettingsForm initial={settings.data} onDone={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({ initial, onDone }: { initial: Settings; onDone: () => void }) {
  const qc = useQueryClient();
  const bumpThumbEpoch = useUi((s) => s.bumpThumbEpoch);
  const [draft, setDraft] = useState<Settings>(initial);
  const [excludesText, setExcludesText] = useState((initial.defaultExcludes ?? []).join(", "));
  const patch = (p: Partial<Settings>) => setDraft((d) => ({ ...d, ...p }));

  const blender = useQuery({ queryKey: qk.blender, queryFn: commands.blenderInfo });
  const cache = useQuery({ queryKey: qk.cache, queryFn: commands.cacheInfo });

  const save = useMutation({
    mutationFn: () =>
      commands.saveSettings({
        ...draft,
        defaultExcludes: excludesText
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: (saved) => {
      qc.setQueryData(qk.settings, saved);
      qc.invalidateQueries({ queryKey: qk.blender });
      if (saved.thumbSize !== initial.thumbSize) bumpThumbEpoch();
      onDone();
    },
  });

  const clear = useMutation({
    mutationFn: commands.clearCache,
    onSuccess: () => {
      useCaptureStore.setState({ states: {}, errors: {}, queue: [] });
      bumpThumbEpoch();
      qc.invalidateQueries({ queryKey: qk.cache });
      qc.invalidateQueries({ queryKey: qk.assetsAll });
      qc.invalidateQueries({ queryKey: qk.assetAll });
    },
  });

  const browseExe = async (field: "blenderPath" | "asepritePath", title: string) => {
    const picked = await open({
      multiple: false,
      directory: false,
      title,
      filters: [{ name: "Executable", extensions: ["exe"] }],
    });
    if (typeof picked === "string") patch({ [field]: picked });
  };

  const thumbSize = draft.thumbSize ?? 256;

  return (
    <div className="grid gap-6">
      <Section title="Tools">
        <PathField
          id="blender-path"
          label="Blender"
          value={draft.blenderPath ?? ""}
          placeholder="Auto-detect (PATH, Program Files)"
          onChange={(v) => patch({ blenderPath: v || null })}
          onBrowse={() => browseExe("blenderPath", "Locate blender.exe")}
          status={
            blender.data?.path ? (
              <span className="flex items-center gap-1.5 text-[11px] text-dust">
                <CheckCircle2 className="size-3.5 text-gold" />
                <span className="truncate font-mono">{blender.data.path}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] text-dust">
                <XCircle className="size-3.5 text-arc" />
                Not found. .blend previews need Blender installed.
              </span>
            )
          }
        />
        <PathField
          id="aseprite-path"
          label="Aseprite"
          value={draft.asepritePath ?? ""}
          placeholder="Auto-detect (Steam, Program Files)"
          onChange={(v) => patch({ asepritePath: v || null })}
          onBrowse={() => browseExe("asepritePath", "Locate Aseprite.exe")}
          status={<span className="text-[11px] text-dust">Used by "Open in Aseprite".</span>}
        />
      </Section>

      <Section title="Indexing">
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="excludes">Excluded folder names</Label>
            <button
              type="button"
              onClick={() => setExcludesText(DEFAULT_EXCLUDES.join(", "))}
              className="flex items-center gap-1 text-[11px] text-dust hover:text-ember"
            >
              <RotateCcw className="size-3" /> Defaults
            </button>
          </div>
          <textarea
            id="excludes"
            value={excludesText}
            onChange={(e) => setExcludesText(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-iron-500 bg-void/60 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-ember/70"
          />
          <p className="text-[11px] text-dust">
            Applied to every project unless the project overrides them. Changes take effect on the
            next scan.
          </p>
        </div>
        <ToggleRow
          id="gitignore"
          label="Respect .gitignore"
          description="Skip files your repos ignore."
          checked={draft.respectGitignore ?? true}
          onChange={(v) => patch({ respectGitignore: v })}
        />
        <ToggleRow
          id="watch"
          label="Watch projects for changes"
          description="Re-index automatically when files are added, edited or removed."
          checked={draft.watchProjects ?? true}
          onChange={(v) => patch({ watchProjects: v })}
        />
      </Section>

      <Section title="Thumbnails">
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <Label>Thumbnail resolution</Label>
            <span className="font-mono text-xs text-gold tabular-nums">{thumbSize}px</span>
          </div>
          <Slider
            min={96}
            max={512}
            step={32}
            value={[thumbSize]}
            onValueChange={([v]) => patch({ thumbSize: v })}
          />
        </div>
        <div className="flex items-center gap-3 rounded-md border border-iron-700 bg-void/40 px-3 py-2.5">
          <HardDrive className="size-4 shrink-0 text-ember" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-bone">
              Cache {cache.data ? formatBytes(cache.data.bytes) : "…"}
            </div>
            <div className="truncate font-mono text-[10.5px] text-dust" data-selectable>
              {cache.data?.path}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => clear.mutate()}
            disabled={clear.isPending}
          >
            <Trash2 /> Clear
          </Button>
        </div>
      </Section>

      <Section title="Updates">
        <UpdatesRow />
      </Section>

      {save.error && <p className="text-xs text-arc">{String(save.error)}</p>}

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save settings
        </Button>
      </DialogFooter>
    </div>
  );
}

function UpdatesRow() {
  const version = useQuery({ queryKey: qk.appVersion, queryFn: getVersion, staleTime: Infinity });
  const status = useUpdate((s) => s.status);
  const next = useUpdate((s) => s.update?.version);
  const progress = useUpdate((s) => s.progress);

  const detail = {
    idle: "Checks automatically at launch and every few hours.",
    checking: "Checking for updates…",
    current: "You're on the latest version.",
    available: `Version ${next} is available.`,
    installing: `Installing ${next}${progress != null ? ` · ${Math.round(progress * 100)}%` : "…"}`,
  }[status];

  return (
    <div className="flex items-center gap-3 rounded-md border border-iron-700 bg-void/40 px-3 py-2.5">
      <Sparkles className="size-4 shrink-0 text-ember" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-bone">
          ArtDirector {version.data && `v${version.data}`}
        </div>
        <div className="truncate text-[11px] text-dust">{detail}</div>
      </div>
      {status === "available" || status === "installing" ? (
        <Button size="sm" onClick={installUpdate} disabled={status === "installing"}>
          <Download /> Install &amp; restart
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => checkForUpdate()}
          disabled={status === "checking"}
        >
          <RefreshCw className={status === "checking" ? "animate-spin" : undefined} /> Check
        </Button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4">
      <div className="flex items-center gap-3">
        <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-ember">{title}</h4>
        <div className="forge-rule flex-1 opacity-60" />
      </div>
      {children}
    </section>
  );
}

function PathField({
  id,
  label,
  value,
  placeholder,
  onChange,
  onBrowse,
  status,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onBrowse: () => void;
  status: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
        />
        <Button variant="outline" size="icon" onClick={onBrowse} title="Browse">
          <FolderSearch />
        </Button>
      </div>
      {status}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-0.5 text-[11px] text-dust">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
