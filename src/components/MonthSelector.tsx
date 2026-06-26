import { formatMonthLabel, shiftMonth } from '../utils/bills'

interface Props {
  month: string
  onChange: (m: string) => void
}

export default function MonthSelector({ month, onChange }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950 shrink-0">
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        className="w-10 h-10 flex items-center justify-center text-2xl leading-none text-slate-400 rounded-full active:bg-slate-800 transition-colors"
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="font-semibold text-slate-100 text-base">{formatMonthLabel(month)}</span>
      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        className="w-10 h-10 flex items-center justify-center text-2xl leading-none text-slate-400 rounded-full active:bg-slate-800 transition-colors"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  )
}
