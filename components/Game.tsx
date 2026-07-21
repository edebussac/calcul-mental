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
  factKey,
  factToQuestion,
  pickFact,
  type FactStat,
  type WeightedFact,
} from "@/lib/game/adaptive";
import { OPERATION_CONFIG, type Operation } from "@/lib/game/operations";

// Durée d'un round (s). Abaissée en e2e via NEXT_PUBLIC_ROUND_SECONDS.
const DURATION_SECONDS = Number(process.env.NEXT_PUBLIC_ROUND_SECONDS) || 60;
const FEEDBACK_MS = 350;
// Délai avant que les boutons de l'écran de résultat deviennent cliquables :
// évite un tap accidentel (dernier appui du round) sur "Rejouer"/"Accueil"/…
const RESULT_LOCK_MS = 500;
// Réponses ≤ 100 (10×10) → 3 chiffres max.
const MAX_ANSWER_DIGITS = 3;

type Phase = "playing" | "finished";
type Feedback = "correct" | null;

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
  const [feedback, setFeedback] = useState<Feedback>(null);
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
  // Mode adaptatif : stats par fait (mises à jour EN COURS de partie), pool
  // pondéré recalculé après chaque réponse, et faits récemment posés.
  const statsRef = useRef<Map<string, FactStat>>(new Map());
  const poolRef = useRef<WeightedFact[] | null>(null);
  const recentlyAskedRef = useRef<string[]>([]);
  // Verrou SYNCHRONE : empêche une 2e validation avant que le feedback (état
  // async) ne désactive le pavé — sinon un tap rapide compte une réponse en trop.
  const lockRef = useRef(false);

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
    (a: number, b: number, responseMs: number) => {
      if (!adaptive || responseMs > ADAPTIVE_PARAMS.capMs) return;
      const key = factKey(a, b);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const prev = statsRef.current.get(key);
      const recentMs = [responseMs, ...(prev?.recentMs ?? [])].slice(
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
    setQuestion(q);
    inputRef.current = "";
    setInput("");
    questionStart.current = Date.now();
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

  // Appelé UNIQUEMENT quand la bonne réponse est trouvée : vert + vibration,
  // puis on passe au calcul suivant. Aucune sanction en cas d'erreur.
  const markCorrect = useCallback(
    (q: Question, value: string) => {
      lockRef.current = true;
      const responseMs = Date.now() - questionStart.current;
      const nextSession = recordAnswer(sessionRef.current, {
        question: q,
        given: q.answer,
        responseMs,
      });
      sessionRef.current = nextSession;
      setSession(nextSession);
      // Réactivité intra-partie : nourrit le pool avec ce temps de réponse.
      applyAdaptiveAttempt(q.a, q.b, responseMs);
      inputRef.current = value;
      setInput(value);
      haptic(); // vibration à chaque bonne réponse
      setFeedback("correct");
      setTimeout(() => {
        setFeedback(null);
        if (phaseRef.current === "playing") {
          nextQuestion();
          lockRef.current = false;
        }
      }, FEEDBACK_MS);
    },
    [nextQuestion, applyAdaptiveAttempt],
  );

  const handleDigit = useCallback(
    (digit: number) => {
      if (lockRef.current || phaseRef.current !== "playing" || !question) return;
      // Lecture/écriture SYNCHRONE via la ref : deux appuis rapprochés ne se
      // marchent plus dessus (plus de chiffre perdu).
      const next = inputRef.current + String(digit);
      if (next.length > MAX_ANSWER_DIGITS) return; // borne la saisie
      inputRef.current = next;
      setInput(next);
      // On ne valide QUE si le calcul est trouvé ; sinon on laisse écrire.
      if (Number(next) === question.answer) markCorrect(question, next);
    },
    [question, markCorrect],
  );

  const handleDelete = useCallback(() => {
    if (lockRef.current || phaseRef.current !== "playing") return;
    const next = inputRef.current.slice(0, -1);
    inputRef.current = next;
    setInput(next);
  }, []);

  const handleReset = useCallback(() => {
    if (lockRef.current || phaseRef.current !== "playing") return;
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
    lockRef.current = false;
    inputRef.current = "";
    setSaveState("idle");
    setSession(initialSession);
    sessionRef.current = initialSession;
    setTimeLeft(DURATION_SECONDS);
    setFeedback(null);
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

  // Vert quand trouvé, sinon couleur d'écriture normale (jamais de rouge).
  const inputColor = feedback === "correct" ? "text-accent-strong" : "text-text";

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
          data-testid="answer"
          className={`neu-inset flex h-24 w-24 items-center justify-center rounded-2xl text-4xl font-bold ${inputColor}`}
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
        disabled={!!feedback}
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
