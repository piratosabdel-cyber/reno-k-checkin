import type { ReactNode } from 'react'
import { useLangue, type Langue } from '../../lib/langue'

export default function AdalaHeader({ titre, droite }: { titre: string; droite?: ReactNode }) {
  const { langue, changerLangue } = useLangue()
  return (
    <header className="sticky top-0 z-[500] bg-[#1a1a1a] text-white shadow">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/adala/icon-192.png" alt="Adala Cola" className="h-10 w-10 shrink-0 rounded-full" />
          <span className="truncate text-lg font-bold">{titre}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-600 text-xs font-bold" role="group" aria-label="Langue / Taal">
            {(['fr', 'nl'] as Langue[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => changerLangue(l)}
                aria-pressed={langue === l}
                className={`px-2.5 py-2 ${langue === l ? 'bg-[#b83a2c] text-white' : 'text-slate-300'}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {droite}
        </div>
      </div>
    </header>
  )
}
