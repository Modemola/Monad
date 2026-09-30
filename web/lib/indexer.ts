"use client";

import { useQuery } from "@tanstack/react-query";

/// GraphQL endpoint of the hosted Envio indexer (see docs/INDEXER.md). Optional: without it
/// the app reads everything it needs straight from the contracts and simply omits the views
/// that need history — trade tape, loan book — rather than faking them.
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL;

/// Postgres numerics can arrive as strings or numbers depending on the GraphQL layer's
/// settings. Strings are exact; accept numbers only as a fallback.
export function big(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  return typeof value === "number" ? BigInt(Math.trunc(value)) : BigInt(value);
}

export function useIndexer<T>(key: string, query: string, variables: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ["indexer", key, variables],
    enabled: Boolean(INDEXER_URL),
    refetchInterval: 5_000,
    queryFn: async (): Promise<T> => {
      const response = await fetch(INDEXER_URL!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (!response.ok) throw new Error(`indexer responded ${response.status}`);
      const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
      if (body.errors?.length) throw new Error(body.errors[0]!.message);
      return body.data as T;
    },
  });
}
