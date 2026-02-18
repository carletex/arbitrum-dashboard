import Link from "next/link";
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

        {/* Admin Tools */}
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-3">Admin Tools</h2>
          <div className="flex flex-col gap-2">
            <Link href="/admin/rag" className="btn btn-primary w-full justify-start gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Proposal RAG Search
            </Link>
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
