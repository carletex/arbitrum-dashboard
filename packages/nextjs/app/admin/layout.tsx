import { AccessDenied } from "./_components/AccessDenied";
import { SignIn } from "./_components/SignIn";
import { getServerSession } from "next-auth";
import { authOptions } from "~~/utils/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <SignIn />;
  }

  if (!session.user.isAdmin) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
