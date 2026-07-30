/**
 * Profil courant — l'équivalent natif du `localStorage` du banc d'essai web.
 *
 * `expo-sqlite/kv-store` offre une API compatible AsyncStorage adossée à
 * SQLite, et est fourni **avec `expo-sqlite`** : aucune dépendance de plus pour
 * retenir une seule clé.
 *
 * Ce module ne contient aucune règle de jeu — seulement la mémoire de « qui
 * joue » entre deux lancements.
 */

import Storage from "expo-sqlite/kv-store";
import { useCallback, useEffect, useState } from "react";

export interface StoredProfile {
  id: number;
  name: string;
}

const KEY = "blitzmatic.profile";

export async function readProfile(): Promise<StoredProfile | null> {
  try {
    const raw = await Storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProfile;
    if (typeof parsed?.id === "number" && typeof parsed?.name === "string") {
      return parsed;
    }
  } catch {
    // ignore : magasin indisponible ou JSON corrompu — on repart sans profil
    // plutôt que d'empêcher l'app de démarrer.
  }
  return null;
}

export async function writeProfile(
  profile: StoredProfile | null,
): Promise<void> {
  if (profile) {
    await Storage.setItem(KEY, JSON.stringify(profile));
  } else {
    await Storage.removeItem(KEY);
  }
}

/** Profil courant + setter. `ready` distingue « pas encore lu » de « aucun ». */
export function useProfile() {
  const [profile, setProfileState] = useState<StoredProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void readProfile().then((p) => {
      if (!alive) return;
      setProfileState(p);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setProfile = useCallback(async (next: StoredProfile | null) => {
    await writeProfile(next);
    setProfileState(next);
  }, []);

  return { profile, setProfile, ready };
}
