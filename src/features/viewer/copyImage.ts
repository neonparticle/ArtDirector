import { useEffect, useRef } from "react";
import { fileUrl } from "@/lib/asset-url";
import { type AssetSummary, commands } from "@/lib/bindings";
import { notify } from "@/stores/notice";

type Capture = () => string | null;

let source: { assetId: number; capture: Capture } | null = null;

/**
 * Lets the open viewer supply what it is showing (current frame, live 3D view) as a PNG
 * data URL when its asset is copied. Returning null falls back to the whole file.
 */
export function useFrameSource(assetId: number, capture: Capture) {
  const ref = useRef(capture);
  ref.current = capture;
  useEffect(() => {
    const own = { assetId, capture: () => ref.current() };
    source = own;
    return () => {
      if (source === own) source = null;
    };
  }, [assetId]);
}

export async function copyImage(asset: AssetSummary) {
  try {
    let dataUrl = source?.assetId === asset.id ? source.capture() : null;
    if (!dataUrl && asset.ext === "svg") dataUrl = await rasterizeSvg(asset);
    await commands.copyImage(asset.id, dataUrl);
    notify(`Copied ${asset.name}`);
  } catch (e) {
    notify(`Could not copy image: ${e instanceof Error ? e.message : String(e)}`, "error");
  }
}

function rasterizeSvg(asset: AssetSummary): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = asset.width ?? (img.naturalWidth || 512);
      canvas.height = asset.height ?? (img.naturalHeight || 512);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("SVG failed to load"));
    img.src = fileUrl(asset);
  });
}
