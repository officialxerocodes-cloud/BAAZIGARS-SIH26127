import { useMemo, useState } from "react";
import { recentSearches } from "../data/mockData";

const PAGE_SIZE = 5;

function TableRow({ row }) {
  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="py-3.5 px-4 font-medium">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded bg-navy text-white text-[10px] font-bold">
            IND
          </span>
          <span className="font-bold tracking-wide text-slate-900">
            {row.plate}
          </span>
        </div>
      </td>
      <td className="py-3.5 px-4 text-slate-900 font-medium">{row.model}</td>
      <td className="py-3.5 px-4 text-slate-500">{row.location}</td>
      <td className="py-3.5 px-4 text-slate-900 font-semibold">
        {row.speed} • {row.direction}
      </td>
      <td className="py-3.5 px-4 text-slate-500 tabular-nums">{row.time}</td>
      <td className="py-3.5 px-4">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${row.statusClass}`}
        >
          ● {row.status}
        </span>
      </td>
      <td className="py-3.5 px-4 text-right">
        <button className="text-navy hover:text-navy-dark text-sm font-semibold inline-flex items-center gap-1">
          Track Map
          <span className="material-symbols-outlined text-[15px]">
            arrow_outward
          </span>
        </button>
      </td>
    </tr>
  );
}

/**
 * Trajectory
 * Recent-searches audit table. Paginates client-side over `rows` — swap
 * in a fetched dataset and this keeps working unchanged.
 */
export default function Trajectory({
  rows = recentSearches,
  totalAudited = 14892,
  pageSize = PAGE_SIZE,
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  return (
    <section className="bg-white rounded-xl p-6 shadow-sm space-y-4 mb-8 border border-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Recent Trajectory Searches
          </h2>
          <p className="text-xs text-slate-500">
            Audit trail of law enforcement and traffic authority query history
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-900 text-sm shadow-sm">
            <span className="material-symbols-outlined text-[16px] text-slate-500">
              download
            </span>
            Export Log
          </button>
          <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-900 text-sm shadow-sm">
            <span className="material-symbols-outlined text-[16px] text-slate-500">
              refresh
            </span>
          </button>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <th className="py-3 px-4 rounded-l-lg">Plate Number</th>
              <th className="py-3 px-4">Vehicle Model / Class</th>
              <th className="py-3 px-4">Last Seen Location</th>
              <th className="py-3 px-4">Speed / Direction</th>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Alert Status</th>
              <th className="py-3 px-4 text-right rounded-r-lg">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {pageRows.map((row) => (
              <TableRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-slate-500 text-sm">
        <span>
          Showing {pageRows.length} of {totalAudited.toLocaleString()} audited
          search trajectories
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-900 font-medium disabled:opacity-50"
          >
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`px-2.5 py-1 rounded font-medium ${
                p === page
                  ? "bg-navy text-white"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-900"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-900 font-medium disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
