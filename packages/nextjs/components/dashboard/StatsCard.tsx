import { type StatCardConfig } from "~~/utils/governanceStats";

interface StatsCardProps {
  config: StatCardConfig;
  value: number;
  isLoading?: boolean;
}

export const StatsCard = ({ config, value, isLoading = false }: StatsCardProps) => {
  const { title, sub, color, Icon } = config;

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm rounded-xl">
      <div className="card-body p-4">
        <div className="flex justify-between items-start">
          <h2 className="card-title text-sm font-medium">{title}</h2>
          <Icon className="h-4 w-4 text-base-content/60" />
        </div>
        <div className={`text-2xl font-bold ${color}`}>
          {isLoading ? <span className="loading loading-spinner loading-sm"></span> : value}
        </div>
        <p className="text-xs text-base-content/60">{sub}</p>
      </div>
    </div>
  );
};
