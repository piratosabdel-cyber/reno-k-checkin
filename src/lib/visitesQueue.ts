import { openDB, type DBSchema } from 'idb'
import { supabase } from './supabase'
import type { Commerce, ResultatVisite, TypeCommerce } from '../types/database'

/**
 * File locale des visites (séparée de celle des pointages ouvriers).
 * Chaque visite est d'abord écrite ici, photo comprise, puis envoyée au
 * serveur : si le réseau manque, rien n'est perdu et l'envoi reprend tout
 * seul au retour de la connexion.
 */

export interface NouveauCommerce {
  id: string
  nom: string
  adresse: string | null
  commune: string | null
  type: TypeCommerce
}

export interface VisiteEnAttente {
  client_uuid: string
  commercial_id: string
  commerce_id: string
  commerce_nom: string
  nouveau_commerce: NouveauCommerce | null
  type_commerce: TypeCommerce
  contact_nom: string | null
  contact_fonction: string | null
  contact_telephone: string | null
  contact_email: string | null
  adresse_livraison?: string | null
  adresse_facturation?: string | null
  numero_tva?: string | null
  reseau_social?: string | null
  resultat: ResultatVisite
  plateaux: number | null
  palettes: number | null
  date_relance: string | null
  remarques: string[]
  commentaire: string | null
  a_completer: boolean
  lat_ouverture: number | null
  lng_ouverture: number | null
  precision_ouverture_m: number | null
  lat_envoi: number | null
  lng_envoi: number | null
  precision_envoi_m: number | null
  adresse_gps: string | null
  heure_ouverture: string
  heure_appareil: string
  photo: Blob
  photo_prise_a: string
  synchro_differee: boolean
  appareil_id: string
  modele_appareil: string
  derniere_erreur?: string | null
}

interface AdalaDB extends DBSchema {
  visites_en_attente: {
    key: string
    value: VisiteEnAttente
  }
}

const dbPromise = openDB<AdalaDB>('adala-visites', 1, {
  upgrade(db) {
    db.createObjectStore('visites_en_attente', { keyPath: 'client_uuid' })
  },
})

export async function mettreEnFile(v: VisiteEnAttente) {
  const db = await dbPromise
  await db.put('visites_en_attente', v)
}

export async function listerVisitesEnAttente(commercialId: string): Promise<VisiteEnAttente[]> {
  const db = await dbPromise
  return (await db.getAll('visites_en_attente')).filter((v) => v.commercial_id === commercialId)
}

/** Identifiant de la tablette, créé une seule fois. */
export function identifiantAppareil(): string {
  try {
    let id = localStorage.getItem('adala-appareil-id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('adala-appareil-id', id)
    }
    return id
  } catch {
    return 'inconnu'
  }
}

/** Liste des commerces gardée sur la tablette pour la reconnaissance hors connexion. */
export function commercesEnCache(): Commerce[] {
  try {
    return JSON.parse(localStorage.getItem('adala-commerces') ?? '[]') as Commerce[]
  } catch {
    return []
  }
}

export async function rafraichirCommerces(): Promise<Commerce[]> {
  const { data, error } = await supabase.from('commerces').select('*').order('nom')
  if (error || !data) return commercesEnCache()
  try {
    localStorage.setItem('adala-commerces', JSON.stringify(data))
  } catch {
    // stockage plein ou bloqué : on fonctionne sans cache
  }
  return data as Commerce[]
}

function raison(error: { code?: string; message?: string; statusCode?: string }): string {
  if (error.code === '42501' || error.statusCode === '403') return 'refusé par une règle de sécurité (compte bloqué ?)'
  return `erreur serveur ${error.code ?? error.statusCode ?? ''} ${error.message ?? ''}`.trim()
}

/** Une coupure réseau n'a pas de code ; un refus du serveur en a un. */
function estRefusServeur(error: { code?: string; statusCode?: string } | null) {
  return !!(error?.code || error?.statusCode)
}

/**
 * Envoie les visites en attente. Idempotent : commerce, photo et visite
 * déjà reçus (même identifiant) sont simplement ignorés.
 */
export async function synchroniserVisites(commercialId: string): Promise<{ envoyees: number; restantes: number }> {
  const file = await listerVisitesEnAttente(commercialId)
  let envoyees = 0

  for (const v of file) {
    const echec = async (error: { code?: string; message?: string; statusCode?: string }) => {
      if (!estRefusServeur(error)) return 'reseau' as const
      await mettreEnFile({ ...v, derniere_erreur: raison(error) })
      return 'refus' as const
    }

    if (v.nouveau_commerce) {
      const { error } = await supabase
        .from('commerces')
        .insert({ ...v.nouveau_commerce, cree_par: commercialId })
      if (error && error.code !== '23505') {
        if ((await echec(error)) === 'reseau') break
        continue
      }
    }

    const photoPath = `${commercialId}/${v.client_uuid}.jpg`
    const { error: errPhoto } = await supabase.storage
      .from('visites-photos')
      .upload(photoPath, v.photo, { contentType: 'image/jpeg', upsert: false })
    const dejaLa = errPhoto && /exist|duplicate/i.test(errPhoto.message)
    if (errPhoto && !dejaLa) {
      const e = errPhoto as { message: string; status?: number; statusCode?: string }
      const statut = e.statusCode ?? (e.status ? String(e.status) : undefined)
      if ((await echec({ message: e.message, statusCode: statut })) === 'reseau') break
      continue
    }

    const { error } = await supabase.from('visites').insert({
      client_uuid: v.client_uuid,
      commercial_id: v.commercial_id,
      commerce_id: v.commerce_id,
      type_commerce: v.type_commerce,
      contact_nom: v.contact_nom,
      contact_fonction: v.contact_fonction,
      contact_telephone: v.contact_telephone,
      contact_email: v.contact_email,
      // Absents des visites mises en file par une ancienne version de l'app.
      adresse_livraison: v.adresse_livraison ?? null,
      adresse_facturation: v.adresse_facturation ?? null,
      numero_tva: v.numero_tva ?? null,
      reseau_social: v.reseau_social ?? null,
      resultat: v.resultat,
      plateaux: v.plateaux,
      palettes: v.palettes,
      date_relance: v.date_relance,
      remarques: v.remarques,
      commentaire: v.commentaire,
      a_completer: v.a_completer,
      lat_ouverture: v.lat_ouverture,
      lng_ouverture: v.lng_ouverture,
      precision_ouverture_m: v.precision_ouverture_m,
      lat_envoi: v.lat_envoi,
      lng_envoi: v.lng_envoi,
      precision_envoi_m: v.precision_envoi_m,
      adresse_gps: v.adresse_gps,
      heure_ouverture: v.heure_ouverture,
      heure_appareil: v.heure_appareil,
      photo_path: photoPath,
      photo_prise_a: v.photo_prise_a,
      synchro_differee: v.synchro_differee,
      appareil_id: v.appareil_id,
      modele_appareil: v.modele_appareil,
    })

    if (!error || error.code === '23505') {
      const db = await dbPromise
      await db.delete('visites_en_attente', v.client_uuid)
      envoyees++
    } else if ((await echec(error)) === 'reseau') {
      // Le réseau a lâché : on garde la suite pour plus tard et on la marque différée.
      break
    }
  }

  // Ce qui n'est pas parti tout de suite est « synchronisé en différé ».
  const restantes = await listerVisitesEnAttente(commercialId)
  for (const v of restantes) {
    if (!v.synchro_differee) await mettreEnFile({ ...v, synchro_differee: true })
  }

  if (envoyees > 0) demanderArchivageDrive()
  return { envoyees, restantes: restantes.length }
}

/** Appel d'une fonction serveur avec la session en cours ; renvoie le message d'erreur éventuel. */
export async function appelServeur(chemin: string, corps: unknown): Promise<{ erreur: string | null }> {
  const { data } = await supabase.auth.getSession()
  try {
    const res = await fetch(chemin, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify(corps),
    })
    if (res.ok) return { erreur: null }
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    return { erreur: json.error ?? `Erreur ${res.status}` }
  } catch {
    return { erreur: 'Pas de connexion.' }
  }
}

/** Demande au serveur de copier les nouvelles visites dans Google Drive (sans attendre). */
export async function demanderArchivageDrive() {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    fetch('/api/drive-archiver', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(
      () => undefined
    )
  } catch {
    // l'archivage du soir rattrapera
  }
}
