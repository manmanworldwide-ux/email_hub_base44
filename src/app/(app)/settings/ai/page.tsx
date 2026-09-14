import { requireSession } from "@/lib/auth/session";
import { listIntegrations } from "@/lib/ai/integrations";
import { PROVIDERS, platformAiStatus } from "@/lib/ai/llm";
import { AiIntegrationsManager } from "@/components/ai-integrations-manager";

export const metadata = { title: "AI provider" };

export default async function AiSettingsPage() {
  const { supabase, user } = await requireSession();
  const [integrations, platform] = await Promise.all([listIntegrations(supabase, user.id), platformAiStatus(supabase)]);
  return <AiIntegrationsManager integrations={integrations} providers={PROVIDERS} platform={platform} />;
}
