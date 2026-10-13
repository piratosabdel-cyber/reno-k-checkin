import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** Nombre de chantiers proposés par des ouvriers et pas encore approuvés — mis à jour en temps réel. */
export function usePropositionsEnAttente() {
  const [nombre, setNombre] = useState(0)

  useEffect(() => {
    let actif = true
    async function charger() {
      const { count } = await supabase
        .from('chantiers')
        .select('id', { count: 'exact', head: true })
        .eq('statut', 'en_attente')
      if (actif) setNombre(count ?? 0)
    }
    charger()

    const channel = supabase
      .channel('chantiers-propositions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chantiers' }, charger)
      .subscribe()

    return () => {
      actif = false
      supabase.removeChannel(channel)
    }
  }, [])

  return nombre
}
