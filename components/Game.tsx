"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Keypad } from "@/components/Keypad";
import { haptic } from "@/lib/haptics";
import { useProfile } from "@/lib/profile";
import {
  initialSession,
  recordAnswer,
  type SessionState,
} from "@/lib/game/engine";
import { generateQuestion, type Question } from "@/lib/game/generator";
import {
  ADAPTIVE_PARAMS,
  buildFactPool,
  clampResponseMs,
  factKey,
  factToQuestion,
  isEngagedAttempt,
  pickFact,
  type FactStat,
  type WeightedFact,
} from "@/lib/game/adaptive";
import {
  maxIdle,
  registerActivity,
  startActivity,
  type Activity,
} from "@/lib/game/activity";
import { OPERATION_CONFIG, type Operation } from "@/lib/game/operations";

// Durée d'un round (s). Abaissée en e2e via NEXT_PUBLIC_ROUND_SECONDS.
const DURATION_SECONDS = Number(process.env.NEXT_PUBLIC_ROUND_SECONDS) || 60;
// Délai avant que les boutons de l'écran de résultat deviennent cliquables :
// évite un tap accidentel (dernier appui du round) sur "Rejouer"/"Accueil"/…
const RESULT_LOCK_MS = 500;
// Réponses ≤ 100 (10×10) → 3 chiffres max.
const MAX_ANSWER_DIGITS = 3;

type Phase = "playing" | "finished";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Temps moyen (ms) sur les bonnes réponses. */
function averageMs(session: SessionState): number {
  const correct = session.answers.filter((a) => a.isCorrect);
  if (correct.length === 0) return 0;
  return correct.reduce((sum, a) => sum + a.responseMs, 0) / correct.length;
}

/** Temps de la réponse la plus rapide (ms). */
function fastestMs(session: SessionState): number {
  const correct = session.answers.filter((a) => a.isCorrect);
  if (correct.length === 0) return 0;
  return Math.min(...correct.map((a) => a.responseMs));
}

function formatSeconds(ms: number): string {
  if (ms <= 0) return "—";
  return `${(ms / 1000).toFixed(1)} s`;
}

export function Game({
  operation,
  adaptive = false,
}: {
  operation: Operation;
  adaptive?: boolean;
}) {
  const router = useRouter();
  const { profile, ready } = useProfile();
  const config = OPERATION_CONFIG[operation];

  const [session, setSession] = useState<SessionState>(initialSession);
  const [question, setQuestion] = useState<Question | null>(null);
  const [input, setInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(DURATION_SECONDS);
  const [phase, setPhase] = useState<Phase>("playing");
  // Compteur de bonnes réponses servant UNIQUEMENT à rejouer l'animation de
  // validation : il change de clé, donc React remonte la case et l'animation
  // repart. Purement décoratif — il ne conditionne jamais la saisie.
  const [flash, setFlash] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );

  const questionStart = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  const sessionRef = useRef<SessionState>(session);
  const savedRef = useRef(false);
  // Source de vérité SYNCHRONE de la saisie : évite qu'un 2e appui rapide,
  // survenu avant le re-rendu, reparte de l'ancienne valeur et perde un chiffre.
  const inputRef = useRef("");
  // Même raison que `inputRef` : la question suivante est posée SYNCHRONEMENT,
  // sinon un appui survenu avant le re-rendu validerait encore la précédente et
  // compterait une réponse en trop.
  const questionRef = useRef<Question | null>(null);
  // Mode adaptatif : stats par fait (mises à jour EN COURS de partie), pool
  // pondéré recalculé après chaque réponse, et faits récemment posés.
  const statsRef = useRef<Map<string, FactStat>>(new Map());
  const poolRef = useRef<WeightedFact[] | null>(null);
  const recentlyAskedRef = useRef<string[]>([]);
  // Inactivité pendant la question courante : tout appui la remet à zéro, ce
  // qui permet de distinguer « bloqué mais il cherche » de « parti jouer ».
  const activityRef = useRef<Activity>(startActivity(0));

  // Miroirs pour les closures (timer, setTimeout) sans lire de ref au rendu.
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Charge l'historique, initialise les stats par fait et le pool (adaptatif).
  useEffect(() => {
    if (!adaptive || !ready || !profile) return;
    let cancelled = false;
    fetch(`/api/fact-stats?profileId=${profile.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((stats: FactStat[]) => {
        if (cancelled) return;
        statsRef.current = new Map(stats.map((s) => [factKey(s.a, s.b), s]));
        poolRef.current = buildFactPool(stats);
      })
      .catch(() => {
        /* repli : tirage uniforme */
      });
    return () => {
      cancelled = true;
    };
  }, [adaptive, ready, profile]);

  // Intègre une réponse À CHAUD : le calcul raté peut revenir dans la même
  // partie (le pool ne dépend plus seulement de l'historique figé au départ).
  const applyAdaptiveAttempt = useCallback(
    (a: number, b: number, responseMs: number, maxIdleMs: number) => {
      if (!adaptive || !isEngagedAttempt(maxIdleMs)) return;
      const key = factKey(a, b);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const prev = statsRef.current.get(key);
      const recentMs = [clampResponseMs(responseMs), ...(prev?.recentMs ?? [])].slice(
        0,
        ADAPTIVE_PARAMS.window,
      );
      statsRef.current.set(key, { a: lo, b: hi, recentMs, lastSeenDays: 0 });
      poolRef.current = buildFactPool([...statsRef.current.values()]);
    },
    [adaptive],
  );

  const nextQuestion = useCallback(() => {
    const pool = poolRef.current;
    let q: Question;
    if (adaptive && pool && pool.length > 0) {
      // Points faibles : tirage pondéré, en évitant les 2 derniers faits.
      const fact = pickFact(pool, Math.random, recentlyAskedRef.current);
      const key = factKey(fact.a, fact.b);
      recentlyAskedRef.current = [key, ...recentlyAskedRef.current].slice(0, 2);
      q = factToQuestion(fact);
    } else {
      q = generateQuestion(operation, { min: 1, max: 10 });
    }
    questionRef.current = q;
    setQuestion(q);
    inputRef.current = "";
    setInput("");
    const now = Date.now();
    questionStart.current = now;
    activityRef.current = startActivity(now);
  }, [operation, adaptive]);

  // Redirige vers l'accueil si aucun profil sélectionné.
  useEffect(() => {
    if (ready && !profile) router.replace("/");
  }, [ready, profile, router]);

  // Première question.
  useEffect(() => {
    nextQuestion();
  }, [nextQuestion]);

  // Décompte du timer.
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          setPhase("finished");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Appelé UNIQUEMENT quand la bonne réponse est trouvée : vibration, flash,
  // puis calcul suivant IMMÉDIAT. Aucune sanction en cas d'erreur.
  //
  // Le jeu se joue au nombre de réponses par minute : toute pause imposée ici
  // se retranche du round et plafonne le score. La validation ne doit donc
  // jamais geler la saisie — le flash est une animation qui ne bloque rien.
  const markCorrect = useCallback(
    (q: Question) => {
      const now = Date.now();
      const responseMs = now - questionStart.current;
      // L'appui qui vient de donner la bonne réponse a déjà été enregistré
      // comme activité : la plage en cours est nulle, la valeur est finale.
      const idleMs = maxIdle(activityRef.current, now);
      const nextSession = recordAnswer(sessionRef.current, {
        question: q,
        given: q.answer,
        responseMs,
        maxIdleMs: idleMs,
      });
      sessionRef.current = nextSession;
      setSession(nextSession);
      // Réactivité intra-partie : nourrit le pool avec ce temps de réponse.
      applyAdaptiveAttempt(q.a, q.b, responseMs, idleMs);
      haptic(); // vibration à chaque bonne réponse
      setFlash((n) => n + 1);
      nextQuestion();
    },
    [nextQuestion, applyAdaptiveAttempt],
  );

  const handleDigit = useCallback(
    (digit: number) => {
      if (phaseRef.current !== "playing") return;
      // Lecture SYNCHRONE : `question` (état) peut encore désigner la question
      // précédente si l'appui précède le re-rendu.
      const q = questionRef.current;
      if (!q) return;
      // Signe de vie, AVANT toute autre condition : même un appui refusé parce
      // que la saisie est pleine prouve que l'enfant est devant l'écran.
      activityRef.current = registerActivity(activityRef.current, Date.now());
      // Lecture/écriture SYNCHRONE via la ref : deux appuis rapprochés ne se
      // marchent plus dessus (plus de chiffre perdu).
      const next = inputRef.current + String(digit);
      if (next.length > MAX_ANSWER_DIGITS) return; // borne la saisie
      inputRef.current = next;
      setInput(next);
      // On ne valide QUE si le calcul est trouvé ; sinon on laisse écrire.
      if (Number(next) === q.answer) markCorrect(q);
    },
    [markCorrect],
  );

  const handleDelete = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    activityRef.current = registerActivity(activityRef.current, Date.now());
    const next = inputRef.current.slice(0, -1);
    inputRef.current = next;
    setInput(next);
  }, []);

  const handleReset = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    activityRef.current = registerActivity(activityRef.current, Date.now());
    inputRef.current = "";
    setInput("");
  }, []);

  // Sauvegarde de la session terminée (une seule fois).
  useEffect(() => {
    if (phase !== "finished" || savedRef.current) return;
    const finished = sessionRef.current;
    if (!profile || finished.totalCount === 0) {
      setSaveState("done");
      savedRef.current = true;
      return;
    }
    savedRef.current = true;
    setSaveState("saving");
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: profile.id,
        operation,
        level: 1,
        durationSeconds: DURATION_SECONDS - timeLeft,
        mode: adaptive ? "adaptive" : "classic",
        answers: finished.answers,
      }),
    })
      .then((r) => setSaveState(r.ok ? "done" : "error"))
      .catch(() => setSaveState("error"));
  }, [phase, profile, operation, timeLeft, adaptive]);

  const restart = () => {
    savedRef.current = false;
    inputRef.current = "";
    setSaveState("idle");
    setSession(initialSession);
    sessionRef.current = initialSession;
    setTimeLeft(DURATION_SECONDS);
    setPhase("playing");
    nextQuestion();
  };

  if (phase === "finished") {
    return (
      <ResultScreen
        session={session}
        saveState={saveState}
        onRestart={restart}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-8 pt-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Quitter"
            className="neu-pressable flex h-9 w-9 items-center justify-center rounded-full text-muted"
          >
            ✕
          </Link>
          <h1 className="text-xl font-bold">{config.label}</h1>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-10">
        <p data-testid="question" className="text-5xl font-extrabold tracking-tight">
          <span data-testid="operand-a">{question?.a}</span>
          <span className="mx-3 text-accent">
            {question ? OPERATION_CONFIG[question.operation].symbol : config.symbol}
          </span>
          <span data-testid="operand-b">{question?.b}</span>
        </p>

        <div
          key={flash}
          data-testid="answer"
          className={`neu-inset flex h-24 w-24 items-center justify-center rounded-2xl text-4xl font-bold text-text ${
            flash > 0 ? "answer-flash" : ""
          }`}
        >
          {input === "" ? <span className="text-muted">?</span> : input}
        </div>
      </div>

      <div className="mb-6 flex items-center justify-center gap-12 text-muted">
        <span
          data-testid="correct"
          className="flex items-center gap-2 text-lg font-semibold text-text"
          aria-label="Bonnes réponses"
        >
          ✓ {session.correctCount}
        </span>
        <span
          data-testid="timer"
          className="flex items-center gap-2 text-lg font-semibold text-text"
        >
          ◷ {formatTime(timeLeft)}
        </span>
      </div>

      <Keypad
        onDigit={handleDigit}
        onDelete={handleDelete}
        onReset={handleReset}
      />
    </main>
  );
}

function ResultScreen({
  session,
  saveState,
  onRestart,
}: {
  session: SessionState;
  saveState: "idle" | "saving" | "done" | "error";
  onRestart: () => void;
}) {
  // Verrou anti-clic accidentel : les actions restent inertes un court instant.
  const [locked, setLocked] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setLocked(false), RESULT_LOCK_MS);
    return () => clearTimeout(id);
  }, []);

  const preventWhileLocked = (e: React.MouseEvent) => {
    if (locked) e.preventDefault();
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 py-10 text-center">
      <h1 className="text-2xl font-bold">Terminé&nbsp;!</h1>

      <div className="neu-raised flex flex-col gap-1 rounded-3xl px-12 py-8">
        <span data-testid="final-score" className="text-7xl font-extrabold">
          {session.correctCount}
        </span>
        <span className="text-sm uppercase tracking-wide text-muted">
          réponses justes en 1 min
        </span>
      </div>

      <dl className="grid w-full grid-cols-2 gap-3">
        <Stat label="Temps moyen" value={formatSeconds(averageMs(session))} />
        <Stat label="Meilleur temps" value={formatSeconds(fastestMs(session))} />
      </dl>

      <p className="h-5 text-sm text-muted">
        {saveState === "saving" && "Enregistrement…"}
        {saveState === "error" && "⚠︎ Résultat non enregistré (hors ligne ?)"}
        {saveState === "done" && "Résultat enregistré ✓"}
      </p>

      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          disabled={locked}
          onClick={onRestart}
          className="neu-pressable rounded-2xl py-4 text-lg font-semibold text-accent-strong disabled:opacity-50"
        >
          Rejouer
        </button>
        <div className="flex gap-3">
          <Link
            href="/scores"
            aria-disabled={locked}
            onClick={preventWhileLocked}
            className={`neu-pressable flex-1 rounded-2xl py-4 text-center font-semibold ${locked ? "opacity-50" : ""}`}
          >
            Mes scores
          </Link>
          <Link
            href="/"
            aria-disabled={locked}
            onClick={preventWhileLocked}
            className={`neu-pressable flex-1 rounded-2xl py-4 text-center font-semibold ${locked ? "opacity-50" : ""}`}
          >
            Accueil
          </Link>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="neu-raised flex flex-col items-center gap-1 rounded-2xl py-4">
      <dd className="text-xl font-bold">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}
