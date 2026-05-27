interface Props {
  title: string;
  value: string;
  subtitle: string;
}

export default function DashboardCard({
  title,
  value,
  subtitle,
}: Props) {
  return (
    <div className="dashboard-card">
      <span className="dashboard-card-title">
        {title}
      </span>

      <h2 className="dashboard-card-value">
        {value}
      </h2>

      <p className="dashboard-card-subtitle">
        {subtitle}
      </p>
    </div>
  );
}