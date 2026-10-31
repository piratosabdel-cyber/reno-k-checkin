/**
 * L'app répond sur deux adresses : celle de Reno-K (chantiers) et
 * visites.adalacola.com (commerciaux Adala). Même code, même base ; seuls le
 * nom, le logo et les couleurs changent selon l'adresse ouverte.
 * En local : ajouter ?marque=adala à l'adresse (mémorisé ensuite).
 */
function detecterAdala(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('marque')
    if (param) localStorage.setItem('marque', param)
    if (/adala/i.test(window.location.hostname)) return true
    return localStorage.getItem('marque') === 'adala'
  } catch {
    return /adala/i.test(window.location.hostname)
  }
}

export const estAdala = detecterAdala()
