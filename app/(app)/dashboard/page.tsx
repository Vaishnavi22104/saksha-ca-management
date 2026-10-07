import { requireUser } from "@/lib/auth";
import { AdminDashboard } from "./AdminDashboard";
import { StaffDashboard } from "./StaffDashboard";
import { ClientDashboard } from "./ClientDashboard";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  return (
    <>
      {denied && <div className="notice red">You do not have permission to access that page.</div>}
      {user.role === "ADMIN" && <AdminDashboard user={user} />}
      {user.role === "STAFF" && <StaffDashboard user={user} />}
      {user.role === "CLIENT" && <ClientDashboard user={user} />}
    </>
  );
}
