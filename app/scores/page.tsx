"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useProfile } from "@/lib/profile";
import { OPERATION_CONFIG, type Operation } from "@/lib/game/operations";
import { analyzeFacts, type FactAnalysis, type FactStat } from "@/lib/game/adaptive";

interface BestScore {
  operation: Operation;
  bestScore: number;
  plays: number;
}

interface SessionRow {
  id: number;
  operation: Operation;
  correctCount: number;
  startedAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export default function ScoresPage() {
  const { profile, ready } = useProfile();
  const [scores, setScores] = useState<BestScore[] | null>(null);
  const [history, setHistory] = useState<SessionRow[] | null>(null);
  const [weakFacts, setWeakFacts] = useState<FactAnalysis[] | null>(null);

  useEffect(() => {
    if (!ready || !profile) return;
    fetch(`/api/scores?profileId=${profile.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setScores)
      .catch(() => setScores([]));
    fetch(`/api/history?profileId=${profile.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setHistory)
      .catch(() => setHistory([]));
    fetch(`/api/fact-stats?profileId=${profile.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((stats: FactStat[]) => setWeakFacts(analyzeFacts(stats).slice(0, 8)))
      .catch(() => setWeakFacts([]));
  }, [ready, profile]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-6 py-10">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Retour"
          className="neu-pressable flex h-9 w-9 items-center justify-center rounded-full text-muted"
        >
          ‹
        </Link>
        <h1 className="text-2xl font-bold">Mes scores</h1>
      </header>

      {ready && !profile && (
        <p className="text-muted">Aucun profil sélectionné.</p>
      )}

      {/* Records */}
      {profile && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
            Records
          </h2>
          {scores === null ? (
            <p className="text-muted">Chargement…</p>
          ) : scores.length === 0 ? (
            <p className="text-muted">Aucune partie enregistrée pour l’instant.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {scores.map((s) => (
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
                      meilleur · {s.plays} partie{s.plays > 1 ? "s" : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Historique */}
      {profile && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
            Historique
          </h2>
          {history === null ? (
            <p className="text-muted">Chargement…</p>
          ) : history.length === 0 ? (
            <p className="text-muted">Rien pour l’instant. Joue une session&nbsp;!</p>
          ) : (
            <ul className="neu-raised flex flex-col rounded-3xl p-2">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between rounded-2xl px-4 py-3"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-5 text-center text-accent">
                      {OPERATION_CONFIG[h.operation]?.symbol ?? "?"}
                    </span>
                    <span className="text-sm text-muted">
                      {formatDate(h.startedAt)}
                    </span>
                  </span>
                  <span className="text-sm font-semibold">
                    {h.correctCount} bonne{h.correctCount > 1 ? "s" : ""} réponse
                    {h.correctCount > 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Calculs les moins maîtrisés */}
      {profile && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
            Calculs à travailler
          </h2>
          {weakFacts === null ? (
            <p className="text-muted">Chargement…</p>
          ) : weakFacts.length === 0 ? (
            <p className="text-muted">
              Pas encore assez de données. Joue quelques parties de
              multiplication&nbsp;!
            </p>
          ) : (
            <ul className="neu-raised flex flex-col gap-4 rounded-3xl p-5">
              {weakFacts.map((f) => (
                <li key={`${f.a}x${f.b}`} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-semibold">
                      {f.a} × {f.b}
                    </span>
                    <span className="text-sm text-muted">
                      {formatMs(f.avgMs)} · {f.attempts} essai
                      {f.attempts > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="neu-inset h-2 w-full overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(6, f.difficulty * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Export des données */}
      {profile && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
            Exporter mes données
          </h2>
          <div className="flex gap-3">
            <a
              href={`/api/export?profileId=${profile.id}&format=json`}
              download
              className="neu-pressable flex-1 rounded-2xl py-4 text-center font-semibold"
            >
              JSON
            </a>
            <a
              href={`/api/export?profileId=${profile.id}&format=csv`}
              download
              className="neu-pressable flex-1 rounded-2xl py-4 text-center font-semibold"
            >
              CSV
            </a>
          </div>
        </section>
      )}
    </main>
  );
}
