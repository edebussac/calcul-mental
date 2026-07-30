/**
 * Écran de jeu, porté du banc d'essai web (`components/Game.tsx`).
 *
 * La logique est reprise **à l'identique** : mêmes refs synchrones, mêmes
 * décisions. Seules changent les entrées/sorties de plateforme :
 *
 * | Web                          | Ici                                     |
 * | ---------------------------- | --------------------------------------- |
 * | `fetch("/api/fact-stats")`   | `multiplicationFactStats(getDb(), …)`   |
 * | `fetch("/api/sessions")`     | `saveSession(getDb(), …)`               |
 * | `platform: "web"`            | `Platform.OS`                           |
 * | `crypto.randomUUID()`        | `clientUuid()`                          |
 *
 * La durée du round reste ici faute de mieux, comme sur le web — mais elle ne
 * freine pas la saisie, ce que le §4.3 du doc de migration interdit. Le nombre
 * de chiffres saisissables, lui, n'est plus une constante : il est dérivé du
 * niveau par `lib/game/levels.ts`, où il est testé.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Keypad } from "@/components/Keypad";
import { getDb } from "@/lib/db/client";
import {
  maxIdle,
  registerActivity,
  startActivity,
  type Activity,
} from "@/lib/game/activity";
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
  initialSession,
  recordAnswer,
  type SessionState,
} from "@/lib/game/engine";
import {
  drawDistinctQuestion,
  generateQuestion,
  type Question,
} from "@/lib/game/generator";
import {
  DEFAULT_LEVEL,
  levelRange,
  maxAnswerDigits,
  type Level,
} from "@/lib/game/levels";
import { OPERATION_CONFIG, type Operation } from "@/lib/game/operations";
import { haptic } from "@/lib/haptics";
import { useProfile } from "@/lib/profile";
import { multiplicationFactStats } from "@/lib/services/factStats";
import {
  saveSession,
  type Platform as PlatformTag,
} from "@/lib/services/sessions";
import { clientUuid } from "@/lib/uuid";
import { colors, radius, shadow, spacing } from "@/theme";

/** Durée d'un round (s). */
const DURATION_SECONDS = 60;
/** Verrou anti-tap accidentel sur l'écran de résultat (dernier appui du round). */
const RESULT_LOCK_MS = 500;
/**
 * Durée d'affichage, en écho, du résultat qu'on vient de trouver. PUREMENT
 * décoratif : l'écho s'efface dès la première frappe et ne retient jamais le
 * jeu — la question suivante est déjà active en dessous.
 */
const ANSWER_ECHO_MS = 800;

const PLATFORM: PlatformTag =
  Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

type Phase = "playing" | "finished";
type SaveState = "idle" | "saving" | "done" | "error";

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
  level = DEFAULT_LEVEL,
}: {
  operation: Operation;
  adaptive?: boolean;
  /**
   * Plage d'opérandes. **Sans effet en mode adaptatif** : les questions y sont
   * tirées de l'historique du joueur, pas d'une plage (cf. `nextQuestion`).
   */
  level?: Level;
}) {
  const router = useRouter();
  const { profile, ready } = useProfile();
  const config = OPERATION_CONFIG[operation];
  // Dérivé du niveau : à Légendaire une multiplication atteint 10 000, que la
  // borne figée à 3 chiffres du banc d'essai rendrait impossible à saisir.
  const maxDigits = maxAnswerDigits(operation, level);

  const [session, setSession] = useState<SessionState>(initialSession);
  const [question, setQuestion] = useState<Question | null>(null);
  const [input, setInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(DURATION_SECONDS);
  const [phase, setPhase] = useState<Phase>("playing");
  const [echo, setEcho] = useState<number | null>(null);
  const echoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const questionStart = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  const sessionRef = useRef<SessionState>(session);
  const savedRef = useRef(false);
  // Source de vérité SYNCHRONE de la saisie : évite qu'un 2e appui rapide,
  // survenu avant le re-rendu, reparte de l'ancienne valeur et perde un chiffre.
  const inputRef = useRef("");
  // Même raison : la question suivante est posée SYNCHRONEMENT, sinon un appui
  // survenu avant le re-rendu validerait encore la précédente.
  const questionRef = useRef<Question | null>(null);
  const statsRef = useRef<Map<string, FactStat>>(new Map());
  const poolRef = useRef<WeightedFact[] | null>(null);
  const recentlyAskedRef = useRef<string[]>([]);
  // Inactivité pendant la question courante : tout appui la remet à zéro, ce
  // qui distingue « bloqué mais il cherche » de « parti jouer ».
  const activityRef = useRef<Activity>(startActivity(0));

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Historique → stats par fait et pool pondéré. Lecture LOCALE : contrairement
  // au web, aucun appel réseau — la partie démarre donc aussi en avion.
  useEffect(() => {
    if (!adaptive || !ready || !profile) return;
    let cancelled = false;
    void multiplicationFactStats(getDb(), profile.id)
      .then((stats) => {
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
      const recentMs = [
        clampResponseMs(responseMs),
        ...(prev?.recentMs ?? []),
      ].slice(0, ADAPTIVE_PARAMS.window);
      statsRef.current.set(key, { a: lo, b: hi, recentMs, lastSeenDays: 0 });
      poolRef.current = buildFactPool([...statsRef.current.values()]);
    },
    [adaptive],
  );

  const nextQuestion = useCallback(() => {
    const pool = poolRef.current;
    const weighted = adaptive && pool && pool.length > 0 ? pool : null;

    // En mode ciblé, la plage du niveau ne s'applique pas : le pool vient de
    // l'historique de multiplication du joueur, qui a ses propres faits.
    const draw = weighted
      ? () =>
          factToQuestion(
            pickFact(weighted, Math.random, recentlyAskedRef.current),
          )
      : () => generateQuestion(operation, levelRange(level));

    // `questionRef` porte encore la question sortante : c'est sa réponse qu'on
    // s'interdit de reproposer (elle reste affichée en écho).
    const q = drawDistinctQuestion(draw, questionRef.current?.answer ?? null);

    if (weighted) {
      const key = factKey(q.a, q.b);
      recentlyAskedRef.current = [key, ...recentlyAskedRef.current].slice(0, 2);
    }
    questionRef.current = q;
    setQuestion(q);
    inputRef.current = "";
    setInput("");
    const now = Date.now();
    questionStart.current = now;
    activityRef.current = startActivity(now);
  }, [operation, adaptive, level]);

  // Retour à l'accueil si aucun profil sélectionné.
  useEffect(() => {
    if (ready && !profile) router.replace("/");
  }, [ready, profile, router]);

  useEffect(() => {
    nextQuestion();
  }, [nextQuestion]);

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

  /**
   * Appelé UNIQUEMENT quand la bonne réponse est trouvée. Aucune sanction en
   * cas d'erreur.
   *
   * Le jeu se joue au nombre de réponses par minute : toute pause imposée ici
   * se retrancherait du round et plafonnerait le score. La validation ne gèle
   * donc jamais la saisie — l'écho s'affiche par-dessus une question déjà
   * jouable, et la première frappe le recouvre.
   */
  const markCorrect = useCallback(
    (q: Question) => {
      const now = Date.now();
      const responseMs = now - questionStart.current;
      const idleMs = maxIdle(activityRef.current, now);
      const nextSession = recordAnswer(sessionRef.current, {
        question: q,
        given: q.answer,
        responseMs,
        maxIdleMs: idleMs,
      });
      sessionRef.current = nextSession;
      setSession(nextSession);
      applyAdaptiveAttempt(q.a, q.b, responseMs, idleMs);
      haptic();
      setEcho(q.answer);
      if (echoTimer.current) clearTimeout(echoTimer.current);
      echoTimer.current = setTimeout(() => setEcho(null), ANSWER_ECHO_MS);
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
      const next = inputRef.current + String(digit);
      if (next.length > maxDigits) return;
      inputRef.current = next;
      setInput(next);
      // On ne valide QUE si le calcul est trouvé ; sinon on laisse écrire.
      if (Number(next) === q.answer) markCorrect(q);
    },
    [markCorrect, maxDigits],
  );

  const handleDelete = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    activityRef.current = registerActivity(activityRef.current, Date.now());
    const next = inputRef.current.slice(0, -1);
    inputRef.current = next;
    setInput(next);
    // Sinon l'écho du résultat précédent réapparaîtrait dans une case revenue
    // vide, à côté d'une question qui n'est plus la sienne.
    setEcho(null);
  }, []);

  const handleReset = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    activityRef.current = registerActivity(activityRef.current, Date.now());
    inputRef.current = "";
    setInput("");
    setEcho(null);
  }, []);

  useEffect(() => {
    return () => {
      if (echoTimer.current) clearTimeout(echoTimer.current);
    };
  }, []);

  // Sauvegarde de la partie terminée (une seule fois).
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
    void saveSession(getDb(), {
      profileId: profile.id,
      operation,
      level,
      durationSeconds: DURATION_SECONDS - timeLeft,
      mode: adaptive ? "adaptive" : "classic",
      platform: PLATFORM,
      // Tiré ici et pas au montage : `savedRef` garantit un seul passage par
      // partie, donc chaque partie a bien son propre identifiant.
      clientUuid: clientUuid(),
      answers: finished.answers,
    })
      .then(() => setSaveState("done"))
      .catch(() => setSaveState("error"));
  }, [phase, profile, operation, timeLeft, adaptive, level]);

  const restart = useCallback(() => {
    savedRef.current = false;
    inputRef.current = "";
    setEcho(null);
    setSaveState("idle");
    setSession(initialSession);
    sessionRef.current = initialSession;
    setTimeLeft(DURATION_SECONDS);
    setPhase("playing");
    nextQuestion();
  }, [nextQuestion]);

  if (phase === "finished") {
    return (
      <ResultScreen
        session={session}
        saveState={saveState}
        onRestart={restart}
      />
    );
  }

  // Le vert et le résultat apparaissent et disparaissent ENSEMBLE : une seule
  // condition les pilote tous les deux.
  const showingEcho = input === "" && echo !== null;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace("/")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Quitter"
        >
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{config.label}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.stage}>
        <Text style={styles.question}>
          {question?.a}
          <Text style={styles.questionSymbol}>
            {" "}
            {question
              ? OPERATION_CONFIG[question.operation].symbol
              : config.symbol}{" "}
          </Text>
          {question?.b}
        </Text>

        <View style={[styles.answerBox, showingEcho && styles.answerBoxCorrect]}>
          <Text
            style={[styles.answerText, input === "" && !showingEcho && styles.answerPlaceholder]}
          >
            {input !== "" ? input : showingEcho ? echo : "?"}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Ionicons name="checkmark-circle" size={20} color={colors.green} />
          <Text style={styles.statValue}>{session.correctCount}</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.statValue}>{formatTime(timeLeft)}</Text>
        </View>
      </View>

      <Keypad
        onDigit={handleDigit}
        onDelete={handleDelete}
        onReset={handleReset}
      />
    </SafeAreaView>
  );
}

function ResultScreen({
  session,
  saveState,
  onRestart,
}: {
  session: SessionState;
  saveState: SaveState;
  onRestart: () => void;
}) {
  const router = useRouter();
  // Verrou anti-tap accidentel : le dernier appui du round ne doit pas
  // déclencher « Rejouer » par inadvertance.
  const [locked, setLocked] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setLocked(false), RESULT_LOCK_MS);
    return () => clearTimeout(id);
  }, []);

  return (
    <SafeAreaView style={[styles.screen, styles.resultScreen]}>
      <Text style={styles.resultTitle}>Terminé !</Text>

      <View style={styles.scoreCard}>
        <Text style={styles.scoreValue}>{session.correctCount}</Text>
        <Text style={styles.scoreCaption}>réponses justes en 1 min</Text>
      </View>

      <View style={styles.statGrid}>
        <Stat label="Temps moyen" value={formatSeconds(averageMs(session))} />
        <Stat label="Meilleur temps" value={formatSeconds(fastestMs(session))} />
      </View>

      <Text style={styles.saveState}>
        {saveState === "saving" && "Enregistrement…"}
        {saveState === "error" && "⚠︎ Résultat non enregistré"}
        {saveState === "done" && "Résultat enregistré ✓"}
      </Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.primaryButton, locked && styles.buttonLocked]}
          disabled={locked}
          onPress={onRestart}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Rejouer</Text>
        </Pressable>
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.secondaryButton, locked && styles.buttonLocked]}
            disabled={locked}
            onPress={() => router.replace("/scores")}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Mes scores</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, locked && styles.buttonLocked]}
            disabled={locked}
            onPress={() => router.replace("/")}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Accueil</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statCardValue}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: 19, fontWeight: "700", color: colors.textPrimary },
  headerSpacer: { width: 26 },

  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxl,
  },
  question: { fontSize: 46, fontWeight: "800", color: colors.textPrimary },
  questionSymbol: { color: colors.green },

  answerBox: {
    width: 104,
    height: 104,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  answerBoxCorrect: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.green,
  },
  answerText: { fontSize: 38, fontWeight: "700", color: colors.textPrimary },
  answerPlaceholder: { color: colors.textDisabled },

  stats: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xxl * 2,
    paddingVertical: spacing.xl,
  },
  stat: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statValue: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },

  // Écran de résultat
  resultScreen: { alignItems: "center", justifyContent: "center", gap: spacing.xl },
  resultTitle: { fontSize: 26, fontWeight: "800", color: colors.textPrimary },
  scoreCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xxl * 2,
    paddingVertical: spacing.xxl,
    gap: spacing.xs,
    ...shadow.card,
  },
  scoreValue: { fontSize: 68, fontWeight: "800", color: colors.textPrimary },
  scoreCaption: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.textSecondary,
  },
  statGrid: { flexDirection: "row", gap: spacing.md, alignSelf: "stretch" },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    ...shadow.card,
  },
  statCardValue: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  statCardLabel: { fontSize: 12, color: colors.textSecondary },

  saveState: { height: 20, fontSize: 13, color: colors.textSecondary },

  actions: { alignSelf: "stretch", gap: spacing.md },
  primaryButton: {
    backgroundColor: colors.green,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.white, fontSize: 17, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: spacing.md },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    ...shadow.card,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  buttonLocked: { opacity: 0.5 },
});
