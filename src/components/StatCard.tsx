import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  variant?: "default" | "fire" | "success" | "warning" | "critical";
  linkTo?: string;
}

const variantStyles = {
  default: "border-border",
  fire: "border-primary/30 fire-glow",
  success: "border-success/30",
  warning: "border-warning/30",
  critical: "border-critical/30",
};

const iconVariantStyles = {
  default: "bg-secondary text-secondary-foreground",
  fire: "fire-gradient text-primary-foreground",
  success: "bg-success/20 text-success",
  warning: "bg-warning/20 text-warning",
  critical: "bg-critical/20 text-critical",
};

export default function StatCard({ title, value, subtitle, icon: Icon, trend, variant = "default", linkTo }: StatCardProps) {
  const navigate = useNavigate();
  return (
    <div
      onClick={linkTo ? () => navigate(linkTo) : undefined}
      className={cn(
        "rounded-lg border bg-card p-5 card-hover animate-slide-in",
        variantStyles[variant],
        linkTo && "cursor-pointer"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-card-foreground">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={cn("mt-1 text-xs font-medium", trend.positive ? "text-success" : "text-critical")}>
              {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}% vs ostatni miesiąc
            </p>
          )}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", iconVariantStyles[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
