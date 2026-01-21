import { getServerSession } from "next-auth";
import { Address } from "~~/components/scaffold-eth";
import { authOptions } from "~~/utils/auth";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="flex flex-col items-center px-4 py-10 sm:py-20">
      <h1 className="text-4xl font-bold mb-4">Admin Dashboard</h1>
      <div className="bg-base-200 rounded-xl p-6 max-w-lg w-full">
        <p className="text-lg mb-4">Welcome to the admin panel!</p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Logged in as:</span>
            {session?.user?.userAddress && <Address address={session.user.userAddress} />}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Admin Status:</span>
            <span className="badge badge-success">Verified Admin</span>
          </div>
        </div>
        <div className="mt-6 p-4 bg-base-300 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Gated Content</h2>
          <p className="text-base-content/70">
            This content is only visible to authenticated admin users. You have successfully signed in with Ethereum and
            verified your admin status.
          </p>
        </div>
      </div>
    </div>
  );
}
