import { ArrowDownCircle, Loader2 } from "lucide-react";
import { installUpdate, useUpdate } from "@/stores/update";

export function UpdateIndicator() {
  const status = useUpdate((s) => s.status);
  const version = useUpdate((s) => s.update?.version);
  const progress = useUpdate((s) => s.progress);

  if (status === "installing") {
    return (
      <span className="flex items-center gap-1.5 text-gold">
        <Loader2 className="size-3 animate-spin" />
        updating{progress != null && ` ${Math.round(progress * 100)}%`}
      </span>
    );
  }
  if (status !== "available") return null;
  return (
    <button
      type="button"
      onClick={installUpdate}
      title="Download the update and restart ArtDirector"
      className="flex items-center gap-1.5 rounded px-1.5 text-ember hover:bg-ember/10 hover:text-gold"
    >
      <ArrowDownCircle className="size-3" />
      update to v{version}
    </button>
  );
}
