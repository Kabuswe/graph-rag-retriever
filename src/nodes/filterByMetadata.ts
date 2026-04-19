/**
 * filterByMetadata — applies date range, docType, and tag filters.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const filterByMetadataNode = async (state: any) => {
  const { rawChunks, dateRange, docTypes, tags } = state;

  let chunks = Array.isArray(rawChunks) ? [...rawChunks] : [];

  // Filter by date range
  if (dateRange?.start || dateRange?.from) {
    const from = new Date(dateRange.start ?? dateRange.from).getTime();
    const to = dateRange.end ? new Date(dateRange.end).getTime() : Date.now();
    chunks = chunks.filter((c: unknown) => {
      const item = c as Record<string, unknown>;
      const meta = item.metadata as Record<string, unknown> | undefined;
      const ingestedAt = meta?.ingestedAt as string | undefined;
      if (!ingestedAt) return true; // include if no date
      const ts = new Date(ingestedAt).getTime();
      return ts >= from && ts <= to;
    });
  }

  // Filter by docType
  if (Array.isArray(docTypes) && docTypes.length > 0) {
    chunks = chunks.filter((c: unknown) => {
      const item = c as Record<string, unknown>;
      const meta = item.metadata as Record<string, unknown> | undefined;
      return docTypes.includes(meta?.docType);
    });
  }

  // Filter by tags
  if (Array.isArray(tags) && tags.length > 0) {
    chunks = chunks.filter((c: unknown) => {
      const item = c as Record<string, unknown>;
      const meta = item.metadata as Record<string, unknown> | undefined;
      const chunkTags = (meta?.tags as string[]) ?? [];
      return tags.some((t: string) => chunkTags.includes(t));
    });
  }

  return {
    phase: "filter-metadata",
    filteredChunks: chunks,
  };
};
