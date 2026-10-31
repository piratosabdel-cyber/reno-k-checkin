import { useEffect, useRef, useState } from 'react'
import { capturerVideo } from '../../lib/photo'

/**
 * Viseur plein écran intégré à l'app. Volontairement AUCUN accès à la
 * galerie : la photo est forcément prise sur place, au moment de la visite.
 */
export default function CameraCapture({
  onPhoto,
  onFermer,
}: {
  onPhoto: (photo: Blob, priseA: string) => void
  onFermer: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [pret, setPret] = useState(false)
  const [capture, setCapture] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let annule = false
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then((s) => {
        if (annule) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => undefined)
        }
      })
      .catch((e: unknown) => {
        const nom = e instanceof DOMException ? e.name : ''
        setErreur(
          nom === 'NotAllowedError'
            ? "L'appareil photo est refusé pour cette appli. Appuie sur le cadenas à côté de l'adresse (ou Paramètres de l'appli) → Autorisations → Appareil photo → Autoriser, puis réessaie."
            : "Impossible d'ouvrir l'appareil photo. Ferme les autres applis qui l'utilisent, puis réessaie."
        )
      })
    if (!navigator.mediaDevices) setErreur("Cet appareil ne permet pas d'utiliser l'appareil photo ici.")
    return () => {
      annule = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function prendre() {
    if (!videoRef.current || capture) return
    setCapture(true)
    try {
      const blob = await capturerVideo(videoRef.current)
      onPhoto(blob, new Date().toISOString())
    } catch {
      setErreur('La photo a échoué, réessaie.')
      setCapture(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          onLoadedData={() => setPret(true)}
          className="h-full w-full object-cover"
        />
        {erreur && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="rounded-xl bg-white p-5 text-center text-base text-slate-800">{erreur}</p>
          </div>
        )}
        <p className="absolute left-0 right-0 top-4 text-center text-sm font-medium text-white drop-shadow">
          Vitrine, rayon ou frigo
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 bg-black px-6 py-6">
        <button onClick={onFermer} className="rounded-xl px-4 py-3 text-lg text-white active:bg-white/10">
          Annuler
        </button>
        <button
          onClick={prendre}
          disabled={!pret || capture}
          aria-label="Prendre la photo"
          className="h-20 w-20 rounded-full border-4 border-white bg-white/90 transition active:scale-95 disabled:opacity-40"
        />
        <span className="w-[84px]" />
      </div>
    </div>
  )
}
