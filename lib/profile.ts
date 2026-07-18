"use client";

import { useEffect, useState } from "react";

export interface StoredProfile {
  id: number;
  name: string;
}

const KEY = "calcul-mental.profile";

export function readProfile(): StoredProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProfile;
    if (typeof parsed?.id === "number" && typeof parsed?.name === "string") {
      return parsed;
    }
  } catch {
    // ignore : localStorage indisponible ou JSON corrompu
  }
  return null;
}

export function writeProfile(profile: StoredProfile | null): void {
  if (typeof window === "undefined") return;
  if (profile) {
    window.localStorage.setItem(KEY, JSON.stringify(profile));
  } else {
    window.localStorage.removeItem(KEY);
  }
}

/** Hook : profil courant + setter, avec `ready` pour éviter le flash SSR. */
export function useProfile() {
  const [profile, setProfileState] = useState<StoredProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProfileState(readProfile());
    setReady(true);
  }, []);

  const setProfile = (next: StoredProfile | null) => {
    writeProfile(next);
    setProfileState(next);
  };

  return { profile, setProfile, ready };
}
