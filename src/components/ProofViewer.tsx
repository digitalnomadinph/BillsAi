import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

interface Props {
  fileId: string
  onReplace: () => void
}

export default function ProofViewer({ fileId, onReplace }: Props) {
  const file = useLiveQuery(() => db.files.get(fileId), [fileId])
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [fullScreen, setFullScreen] = useState(false)

  useEffect(() => {
    if (!file?.blob) return
    const url = URL.createObjectURL(file.blob)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!file) return <p className="text-xs text-slate-600">Loading proof…</p>

  const isImage = file.mimeType.startsWith('image/')

  return (
    <div className="space-y-2">
      {isImage && objectUrl ? (
        <>
          <div
            className="rounded-xl overflow-hidden bg-slate-800 border border-slate-700 cursor-pointer active:opacity-80"
            onClick={() => setFullScreen(true)}
          >
            <img src={objectUrl} alt="Payment proof" className="w-full object-contain max-h-52" />
            <p className="text-center text-[11px] text-slate-600 py-1.5">Tap to view full size</p>
          </div>

          {fullScreen && (
            <div
              className="fixed inset-0 bg-black z-50 flex flex-col"
              onClick={() => setFullScreen(false)}
            >
              <div className="flex items-center justify-between px-4 py-4 shrink-0">
                <span className="text-sm text-slate-400">Payment Proof</span>
                <button className="text-white text-2xl w-10 h-10 flex items-center justify-center">×</button>
              </div>
              <div className="flex-1 flex items-center justify-center p-3 overflow-hidden">
                <img src={objectUrl} alt="Payment proof" className="max-w-full max-h-full object-contain" />
              </div>
            </div>
          )}
        </>
      ) : objectUrl ? (
        <a
          href={objectUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 active:bg-slate-700"
        >
          <span className="text-2xl shrink-0">📄</span>
          <span className="text-sm text-slate-300 flex-1">View PDF receipt</span>
          <span className="text-slate-500 text-sm">↗</span>
        </a>
      ) : null}

      <button
        onClick={onReplace}
        className="text-xs text-slate-500 underline underline-offset-2"
      >
        Replace proof
      </button>
    </div>
  )
}
