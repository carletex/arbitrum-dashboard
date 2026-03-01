import { MatchingDashboard } from "./_components/MatchingDashboard";

export default function AdminMatchingPage() {
  return (
    <div className="flex flex-col px-4 py-10 sm:py-20 max-w-7xl mx-auto w-full">
      <h1 className="text-4xl font-bold mb-8">Proposal Matching Dashboard</h1>
      <MatchingDashboard />
    </div>
  );
}
