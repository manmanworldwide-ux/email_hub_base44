import { requireAdminSession } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/users";
import { UsersTable } from "@/components/admin/users-table";

export const metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const { supabase, user } = await requireAdminSession();
  const users = await listUsers(supabase);
  return <UsersTable users={users} currentUserId={user.id} />;
}
