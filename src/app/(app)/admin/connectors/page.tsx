import { requireAdminSession } from "@/lib/auth/session";
import { getAllConnectorStatus } from "@/lib/providers/credentials";
import { ConnectorsManager } from "@/components/admin/connectors-manager";
import { env } from "@/lib/env";

export const metadata = { title: "Mail connectors" };

export default async function AdminConnectorsPage() {
  await requireAdminSession();
  const status = await getAllConnectorStatus();
  return <ConnectorsManager connectors={[status.google, status.microsoft]} appUrl={env.appUrl} />;
}
