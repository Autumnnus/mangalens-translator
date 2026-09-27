import { ProviderCheck, UsageSummary } from "@/lib/aiUsage";
import { AiProviderConfig } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Client side of the usage ledger and the provider key check. */

export const aiUsageKeys = {
  summary: ["ai-usage"] as const,
  check: (providerId: string) => ["ai-provider-check", providerId] as const,
};

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const parse = async <T>(response: Response, fallback: string, valid: (data: T) => boolean): Promise<T> => {
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error || fallback);
  // A signed-out session is redirected to the login page instead of a JSON error.
  if (!valid(data)) throw new Error(fallback);
  return data;
};

export const fetchUsageSummary = () =>
  fetch(`/api/ai/usage?tz=${encodeURIComponent(timeZone())}`, { credentials: "same-origin", cache: "no-store" }).then(
    (response) =>
      parse<UsageSummary>(response, "Usage could not be loaded", (data) => Array.isArray(data.limits) && !!data.today),
  );

/** Usage summary; refreshed every 30 s while a screen that shows it is open. */
export const useAiUsage = (enabled = true) =>
  useQuery({
    queryKey: aiUsageKeys.summary,
    queryFn: fetchUsageSummary,
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 10_000,
  });

/** Checks a provider's keys; the result stays cached per provider for the session. */
export const useProviderCheck = (providerId: string) => {
  const queryClient = useQueryClient();
  const result = useQuery<ProviderCheck | null>({
    queryKey: aiUsageKeys.check(providerId),
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: (provider: AiProviderConfig) =>
      fetch("/api/ai/providers/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ provider }),
      }).then((response) => parse<ProviderCheck>(response, "Check failed", (data) => Array.isArray(data.keys))),
    onSuccess: (data) => queryClient.setQueryData(aiUsageKeys.check(providerId), data),
  });
  return { result: result.data || null, check: mutation.mutate, checking: mutation.isPending, error: mutation.error };
};
