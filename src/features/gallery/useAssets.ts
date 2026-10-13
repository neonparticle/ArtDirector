import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { type AssetQuery, type AssetSummary, commands } from "@/lib/bindings";
import { qk } from "@/lib/query-keys";
import { useUi } from "@/stores/ui";

export function useAssetQuery(): AssetQuery {
  const { projectId, folder, filters } = useUi(
    useShallow((s) => ({ projectId: s.projectId, folder: s.folder, filters: s.filters })),
  );
  return useMemo(
    () => ({
      projectId,
      folder: projectId != null ? folder : null,
      kinds: filters.kinds,
      search: filters.search || null,
      tag: filters.tag,
      favoritesOnly: filters.favoritesOnly,
      hideDuplicates: filters.hideDuplicates,
      hideArtifacts: filters.hideArtifacts,
      minPx: filters.minPx,
      sort: filters.sort,
      desc: filters.desc,
    }),
    [projectId, folder, filters],
  );
}

export function useAssets() {
  const query = useAssetQuery();
  return useQuery({
    queryKey: qk.assets(query),
    queryFn: () => commands.queryAssets(query),
    placeholderData: keepPreviousData,
  });
}

export function useKindCounts(projectId: number | null) {
  return useQuery({
    queryKey: qk.kinds(projectId),
    queryFn: () => commands.kindCounts(projectId),
  });
}

export function useTags(projectId: number | null) {
  return useQuery({
    queryKey: qk.tags(projectId),
    queryFn: () => commands.listTags(projectId),
  });
}

export function useAssetDetail(id: number | null) {
  return useQuery({
    queryKey: qk.asset(id ?? -1),
    queryFn: () => commands.getAsset(id as number),
    enabled: id != null,
  });
}

/** Looks up a summary from whatever asset list is currently cached. */
export function useCachedAsset(id: number | null): AssetSummary | undefined {
  const { data } = useAssets();
  return useMemo(() => (id == null ? undefined : data?.find((a) => a.id === id)), [data, id]);
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; favorite: boolean }) => commands.setFavorite(v.id, v.favorite),
    onMutate: ({ id, favorite }) => {
      qc.setQueriesData<AssetSummary[]>({ queryKey: qk.assetsAll }, (list) =>
        list?.map((a) => (a.id === id ? { ...a, favorite } : a)),
      );
    },
    onSettled: (_, __, { id }) => {
      qc.invalidateQueries({ queryKey: qk.asset(id) });
      if (useUi.getState().filters.favoritesOnly) {
        qc.invalidateQueries({ queryKey: qk.assetsAll });
      }
    },
  });
}

export function useTagMutations(id: number) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.asset(id) });
    qc.invalidateQueries({ queryKey: qk.tagsAll });
  };
  return {
    add: useMutation({
      mutationFn: (tag: string) => commands.addTag(id, tag),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (tag: string) => commands.removeTag(id, tag),
      onSuccess: invalidate,
    }),
  };
}
