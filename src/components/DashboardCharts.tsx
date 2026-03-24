import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { TaskWithDetails } from "@/hooks/useSupabaseData";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, isAfter, isBefore } from "date-fns";
import { pl } from "date-fns/locale";

const PRIORITY_COLORS: Record<string, string> = {
  krytyczny: "hsl(0 84% 60%)",
  wysoki: "hsl(38 92% 50%)",
  średni: "hsl(28 100% 50%)",
  niski: "hsl(142 71% 45%)",
};

const CHART_MUTED = "hsl(220 10% 50%)";

interface Props {
  tasks: TaskWithDetails[];
  companyId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export default function DashboardCharts({ tasks, companyId, dateFrom, dateTo }: Props) {
  const filtered = useMemo(() => {
    let result = tasks;
    if (companyId) result = result.filter(t => t.company_id === companyId);
    if (dateFrom) result = result.filter(t => isAfter(new Date(t.created_at), dateFrom) || new Date(t.created_at).getTime() === dateFrom.getTime());
    if (dateTo) result = result.filter(t => isBefore(new Date(t.created_at), dateTo) || new Date(t.created_at).getTime() === dateTo.getTime());
    return result;
  }, [tasks, companyId, dateFrom, dateTo]);

  const monthsCount = useMemo(() => {
    if (dateFrom && dateTo) {
      const diff = (dateTo.getFullYear() - dateFrom.getFullYear()) * 12 + dateTo.getMonth() - dateFrom.getMonth() + 1;
      return Math.max(2, Math.min(diff, 12));
    }
    return 6;
  }, [dateFrom, dateTo]);

  const referenceDate = dateTo ?? new Date();

  // --- Task trend ---
  const trendData = useMemo(() => {
    return Array.from({ length: monthsCount }, (_, i) => {
      const month = subMonths(referenceDate, monthsCount - 1 - i);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const created = filtered.filter(t =>
        isWithinInterval(new Date(t.created_at), { start, end })
      ).length;
      const closed = filtered.filter(t =>
        t.closed_at && isWithinInterval(new Date(t.closed_at), { start, end })
      ).length;
      return {
        name: format(month, "LLL", { locale: pl }),
        Utworzone: created,
        Zamknięte: closed,
      };
    });
  }, [filtered, monthsCount, referenceDate]);

  // --- Priority distribution ---
  const priorityData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.filter(t => t.status !== "Zamknięte").forEach(t => {
      counts[t.priority] = (counts[t.priority] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // --- SLA compliance per month ---
  const slaData = useMemo(() => {
    return Array.from({ length: monthsCount }, (_, i) => {
      const month = subMonths(referenceDate, monthsCount - 1 - i);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const closed = filtered.filter(t =>
        t.closed_at && isWithinInterval(new Date(t.closed_at), { start, end })
      );
      let slaOk = 0;
      closed.forEach(t => {
        const hours = (new Date(t.closed_at!).getTime() - new Date(t.created_at).getTime()) / 3600000;
        if (hours <= t.sla_hours) slaOk++;
      });
      return {
        name: format(month, "LLL", { locale: pl }),
        SLA: closed.length > 0 ? Math.round((slaOk / closed.length) * 100) : 100,
      };
    });
  }, [filtered, monthsCount, referenceDate]);

  const tooltipStyle = {
    contentStyle: {
      background: "hsl(220 18% 12%)",
      border: "1px solid hsl(220 14% 18%)",
      borderRadius: 8,
      fontSize: 12,
      color: "hsl(40 10% 92%)",
    },
    itemStyle: { color: "hsl(40 10% 92%)" },
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Task Trend */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-card-foreground">Trend zadań ({monthsCount} mies.)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trendData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
            <XAxis dataKey="name" tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="Utworzone" fill="hsl(28 100% 50%)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Zamknięte" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-primary" /> Utworzone</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-success" /> Zamknięte</span>
        </div>
      </div>

      {/* Priority Pie */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-card-foreground">Rozkład priorytetów</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={priorityData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {priorityData.map((entry) => (
                <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] ?? CHART_MUTED} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-muted-foreground">
          {priorityData.map(d => (
            <span key={d.name} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: PRIORITY_COLORS[d.name] }} />
              {d.name} ({d.value})
            </span>
          ))}
        </div>
      </div>

      {/* SLA Compliance */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-card-foreground">SLA Compliance (%)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={slaData}>
            <defs>
              <linearGradient id="slaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
            <XAxis dataKey="name" tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, "SLA"]} />
            <Area type="monotone" dataKey="SLA" stroke="hsl(142 71% 45%)" fill="url(#slaGrad)" strokeWidth={2} dot={{ r: 3, fill: "hsl(142 71% 45%)" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
