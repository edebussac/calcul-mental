/**
 * Réglages de l'app, **globaux à l'appareil** (et non par profil) : sur un
 * mobile de famille, l'énoncé à voix haute dépend du lieu — en voiture, dans la
 * chambre — bien plus que de qui joue.
 *
 * Même magasin que `profile.ts` (`expo-sqlite/kv-store`, fourni avec
 * `expo-sqlite`) : aucune dépendance de plus.
 */

import Storage from "expo-sqlite/kv-store";
import { useCallback, useState } from "react";

const VOICE_KEY = "blitzmatic.voice";

/**
 * Lecture **synchrone**, exposée exprès.
 *
 * L'écran de jeu ne peut pas se permettre l'aller-retour asynchrone : le
 * décompte dure 3 s, et si le réglage arrivait après la première question,
 * celle-ci serait la seule du round à ne pas être énoncée. `kv-store` est
 * adossé à SQLite local, cette lecture coûte une requête sur une clé.
 */
export function readVoiceEnabledSync(): boolean {
  try {
    return Storage.getItemSync(VOICE_KEY) === "1";
  } catch {
    // Magasin indisponible : on joue en silence plutôt que d'empêcher la
    // partie de démarrer.
    return false;
  }
}

export async function writeVoiceEnabled(enabled: boolean): Promise<void> {
  await Storage.setItemAsync(VOICE_KEY, enabled ? "1" : "0");
}

/**
 * Réglage « énoncé à voix haute », pour les écrans qui le modifient.
 *
 * Défaut **désactivé** : une app qui se met à parler toute seule au premier
 * lancement surprend plus qu'elle n'aide, et la classe est un des lieux où elle
 * sert. L'écran de jeu, lui, n'utilise pas ce hook mais `readVoiceEnabledSync`.
 */
export function useVoiceEnabled() {
  // Lecture synchrone à l'initialisation, sans effet de relecture : ce hook est
  // le seul écrivain du réglage, donc son état ne peut pas diverger du magasin.
  const [enabled, setEnabled] = useState(readVoiceEnabledSync);

  const setVoiceEnabled = useCallback((next: boolean) => {
    // L'état d'abord : la bascule doit répondre à l'instant, l'écriture peut
    // bien prendre son temps.
    setEnabled(next);
    void writeVoiceEnabled(next).catch(() => {
      /* réglage non retenu pour la prochaine fois — sans conséquence immédiate */
    });
  }, []);

  return { voiceEnabled: enabled, setVoiceEnabled };
}
