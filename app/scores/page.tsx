"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useProfile } from "@/lib/profile";
import { OPERATION_CONFIG, type Operation } from "@/lib/game/operations";

interface BestScore {
  operation: Operation;
  bestScore: number;
  plays: number;
}

export default function ScoresPage() {
  const { profile, ready } = useProfile();
  const [scores, setScores] = useState<BestScore[] | null>(null);

  useEffect(() => {
    if (!ready || !profile) return;
    fetch(`/api/scores?profileId=${profile.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setScores)
      .catch(() => setScores([]));
  }, [ready, profile]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-10">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Retour"
          className="neu-pressable flex h-9 w-9 items-center justify-center rounded-full text-muted"
        >
          ‹
        </Link>
        <h1 className="text-2xl font-bold">Mes meilleurs scores</h1>
      </header>

      {ready && !profile && (
        <p className="text-muted">Aucun profil sélectionné.</p>
      )}

      {profile && scores === null && <p className="text-muted">Chargement…</p>}

      {profile && scores !== null && scores.length === 0 && (
        <p className="text-muted">
          Aucune partie enregistrée pour l’instant. Joue une session&nbsp;!
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {scores?.map((s) => (
          <li
            key={s.operation}
            className="neu-raised flex items-center justify-between rounded-2xl px-6 py-5"
          >
            <span className="flex items-center gap-3">
              <span className="w-6 text-center text-xl text-accent">
                {OPERATION_CONFIG[s.operation]?.symbol ?? "?"}
              </span>
              <span className="text-lg font-medium">
                {OPERATION_CONFIG[s.operation]?.label ?? s.operation}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-2xl font-extrabold">
                {s.bestScore}
              </span>
              <span className="text-xs text-muted">
                {s.plays} partie{s.plays > 1 ? "s" : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
