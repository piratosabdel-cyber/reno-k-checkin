import type { ReactNode } from 'react'

export default function AdalaHeader({ titre, droite }: { titre: string; droite?: ReactNode }) {
  return (
    <header className="sticky top-0 z-[500] bg-[#1a1a1a] text-white shadow">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/adala/icon-192.png" alt="Adala Cola" className="h-10 w-10 shrink-0 rounded-full" />
          <span className="truncate text-lg font-bold">{titre}</span>
        </div>
        {droite}
      </div>
    </header>
  )
}
