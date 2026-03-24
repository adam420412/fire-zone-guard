import { cn } from "@/lib/utils";

// Base animated skeleton block
function Sk({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-secondary/70", className)} />
  );
}

// Cards grid skeleton (e.g. stat cards)
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sk className="h-8 w-8 rounded-lg" />
            <Sk className="h-3 w-24" />
          </div>
          <Sk className="h-8 w-16" />
          <Sk className="h-2 w-32" />
        </div>
      ))}
    </div>
  );
}

// Table rows skeleton
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border p-4 flex items-center gap-3">
        <Sk className="h-4 w-4 rounded" />
        <Sk className="h-3 w-32" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Sk className="h-9 w-9 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Sk className="h-3 w-48" />
              <Sk className="h-2 w-32" />
            </div>
            <Sk className="h-5 w-16 rounded-full" />
            <Sk className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Card grid skeleton (Buildings/Companies)
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Sk className="h-10 w-10 rounded-lg" />
              <div className="space-y-1.5">
                <Sk className="h-3 w-32" />
                <Sk className="h-2 w-24" />
              </div>
            </div>
            <Sk className="h-5 w-5 rounded-full" />
          </div>
          <Sk className="h-2 w-full" />
          <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
            {[0,1,2].map(j => (
              <div key={j} className="text-center space-y-1">
                <Sk className="h-6 w-10 mx-auto" />
                <Sk className="h-2 w-12 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Kanban columns skeleton
export function KanbanSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: 5 }).map((_, col) => (
        <div key={col} className="w-72 shrink-0 rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Sk className="h-4 w-4 rounded" />
            <Sk className="h-3 w-24" />
            <Sk className="ml-auto h-4 w-6 rounded-full" />
          </div>
          {Array.from({ length: 3 - (col % 2) }).map((_, card) => (
            <div key={card} className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2.5">
              <Sk className="h-4 w-5 rounded-full" />
              <Sk className="h-3 w-full" />
              <Sk className="h-2 w-3/4" />
              <div className="flex items-center justify-between pt-1">
                <Sk className="h-5 w-14 rounded-full" />
                <Sk className="h-5 w-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Page header skeleton
export function PageHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Sk className="h-7 w-48" />
        <Sk className="h-3 w-64" />
      </div>
      <Sk className="h-9 w-32 rounded-md" />
    </div>
  );
}
