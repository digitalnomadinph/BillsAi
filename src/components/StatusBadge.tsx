export type DisplayStatus = 'paid' | 'overdue' | 'unpaid'

export default function StatusBadge({ status, daysUntil }: { status: DisplayStatus; daysUntil?: number }) {
  if (status === 'paid') {
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-950 text-green-400 whitespace-nowrap">Paid</span>
  }
  if (status === 'overdue') {
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-950 text-red-400 whitespace-nowrap">Overdue</span>
  }
  if (daysUntil === 0) {
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950 text-amber-400 whitespace-nowrap">Due Today</span>
  }
  if (daysUntil !== undefined && daysUntil <= 3) {
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950 text-amber-400 whitespace-nowrap">Due Soon</span>
  }
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 whitespace-nowrap">Unpaid</span>
}
