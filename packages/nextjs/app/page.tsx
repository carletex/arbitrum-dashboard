import type { NextPage } from "next";
import { ArbitrumGovernanceDashboard } from "~~/components/dashboard/ArbitrumGovernanceDashboard";
import { type DashboardProposal, getDashboardProposals } from "~~/services/database/repositories/proposals";

const Home: NextPage = async () => {
  let proposals: DashboardProposal[];
  try {
    proposals = await getDashboardProposals();
  } catch (error) {
    console.error("Failed to fetch proposals:", error);
    proposals = [];
  }

  return <ArbitrumGovernanceDashboard proposals={proposals} />;
};

export default Home;
