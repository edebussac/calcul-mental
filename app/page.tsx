"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProfile, type StoredProfile } from "@/lib/profile";
import {
  OPERATION_CONFIG,
  OPERATION_MENU_ORDER,
} from "@/lib/game/operations";

export default function HomePage() {
  const { profile, setProfile, ready } = useProfile();

  if (!ready) return <main className="min-h-dvh" />;
  if (!profile) {
    return <ProfileSetup onReady={setProfile} />;
  }
  return <Home profile={profile} onChangeProfile={() => setProfile(null)} />;
}

function ProfileSetup({
  onReady,
}: {
  onReady: (p: StoredProfile) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function start() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error();
      const p = await res.json();
      onReady({ id: p.id, name: p.name });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-extrabold">Qui joue&nbsp;?</h1>
      <input
        aria-label="Prénom"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && start()}
        placeholder="Ton prénom"
        maxLength={50}
        className="neu-inset rounded-2xl px-5 py-4 text-lg outline-none"
      />
      {error && (
        <p className="text-sm text-danger">Impossible de créer le profil.</p>
      )}
      <button
        type="button"
        onClick={start}
        disabled={busy || name.trim() === ""}
        className="neu-pressable rounded-2xl py-4 text-lg font-semibold text-accent-strong disabled:opacity-50"
      >
        {busy ? "…" : "Commencer"}
      </button>
    </main>
  );
}

function Home({
  profile,
  onChangeProfile,
}: {
  profile: StoredProfile;
  onChangeProfile: () => void;
}) {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-4xl font-extrabold">Tests</h1>
        <button
          type="button"
          onClick={onChangeProfile}
          className="neu-pressable rounded-full px-4 py-2 text-sm font-semibold"
        >
          {profile.name}
        </button>
      </header>

      <Link
        href="/scores"
        className="neu-raised flex flex-col gap-1 rounded-3xl px-6 py-6"
      >
        <span className="text-lg font-bold">Mes meilleurs scores</span>
        <span className="text-sm text-muted">Historique enregistré</span>
      </Link>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Choisis un entraînement
        </h2>
        <div className="neu-raised flex flex-col rounded-3xl p-2">
          {OPERATION_MENU_ORDER.map((op) => {
            const config = OPERATION_CONFIG[op];
            return (
              <button
                key={op}
                type="button"
                disabled={!config.enabled}
                onClick={() => router.push(`/play/${op}`)}
                className="flex items-center justify-between rounded-2xl px-4 py-4 text-left enabled:active:bg-black/5 disabled:opacity-40"
              >
                <span className="flex items-center gap-3">
                  <span className="w-6 text-center text-xl text-accent">
                    {config.symbol}
                  </span>
                  <span className="text-lg font-medium">{config.label}</span>
                </span>
                <span className="text-sm text-muted">
                  {config.enabled ? "›" : "à venir"}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
