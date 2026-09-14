import type { Provider } from "@/types";
import { badRequest } from "@/lib/api/errors";
import { googleProvider } from "./google";
import { microsoftProvider } from "./microsoft";
import type { MailProvider } from "./types";

const providers: Record<Provider, MailProvider> = {
  google: googleProvider,
  microsoft: microsoftProvider,
};

export function getProvider(id: string): MailProvider {
  const provider = providers[id as Provider];
  if (!provider) throw badRequest(`Unknown provider: ${id}`, "unknown_provider");
  return provider;
}

export function isProvider(value: string): value is Provider {
  return value === "google" || value === "microsoft";
}

export { ProviderHttpError } from "./types";
export type { MailProvider } from "./types";
