import { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface AdminTableProps<T> {
  columns: AdminTableColumn<T>[];
  rows: T[] | undefined;
  isLoading?: boolean;
  total?: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
  emptyMessage?: string;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
}

export function AdminTable<T>({
  columns,
  rows,
  isLoading,
  total,
  limit,
  offset,
  onPageChange,
  emptyMessage = "NO_RECORDS",
  rowKey,
  onRowClick,
}: AdminTableProps<T>) {
  const list = rows ?? [];
  const totalCount = total ?? list.length;
  const showingFrom = list.length === 0 ? 0 : offset + 1;
  const showingTo = offset + list.length;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < totalCount;

  return (
    <div className="flex flex-col gap-3">
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/20 text-left">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "px-4 py-3 font-mono text-xs uppercase text-muted-foreground font-bold",
                      c.className,
                    )}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`s-${i}`} className="border-b border-border/10">
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : list.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-10 text-center font-mono text-xs text-muted-foreground"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-border/10 hover:bg-muted/10 transition-colors",
                      onRowClick && "cursor-pointer",
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn("px-4 py-3 align-middle", c.className)}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
        <span>
          {totalCount > 0
            ? `${showingFrom}-${showingTo} of ${totalCount}`
            : "0 results"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!hasPrev}
            onClick={() => onPageChange(Math.max(0, offset - limit))}
          >
            <ChevronLeft className="h-3 w-3" />
            Prev
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!hasNext}
            onClick={() => onPageChange(offset + limit)}
          >
            Next
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
