import { MatchingDashboard } from "./_components/MatchingDashboard";

export default function AdminMatchingPage() {
  return (
    <div className="mx-auto w-full max-w-[1480px] px-5 py-1 lg:py-3 space-y-4">
      <h1 className="text-4xl font-bold">Proposal Matching Dashboard</h1>
      <MatchingDashboard />
    </div>
  );
}
