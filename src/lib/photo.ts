const COTE_MAX = 1600
const QUALITE = 0.75

/**
 * Capture l'image courante d'une vidéo caméra en JPEG compressé
 * (~200-300 Ko) : le côté le plus long est ramené à 1600 px.
 */
export function capturerVideo(video: HTMLVideoElement): Promise<Blob> {
  const w = video.videoWidth
  const h = video.videoHeight
  const ratio = Math.min(1, COTE_MAX / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * ratio)
  canvas.height = Math.round(h * ratio)
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Photo impossible'))), 'image/jpeg', QUALITE)
  )
}
