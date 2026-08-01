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

import { Countdown } from "@/components/Countdown";
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
  spokenQuestion,
  type Question,
} from "@/lib/game/generator";
import {
  ADAPTIVE_LEVEL,
  DEFAULT_LEVEL,
  isAdaptiveFact,
  levelRange,
  maxAnswerDigits,
  type Level,
} from "@/lib/game/levels";
import { OPERATION_CONFIG, type Operation } from "@/lib/game/operations";
import { celebrate, haptic } from "@/lib/haptics";
import { useProfile } from "@/lib/profile";
import { multiplicationFactStats } from "@/lib/services/factStats";
import {
  personalBest,
  saveSession,
  type Platform as PlatformTag,
} from "@/lib/services/sessions";
import { readVoiceEnabledSync } from "@/lib/settings";
import {
  isSpeechAvailable,
  prepareSpeech,
  speakQuestion,
  stopSpeaking,
} from "@/lib/speech";
import { clientUuid } from "@/lib/uuid";
import { colors, radius, shadow, spacing } from "@/theme";

/** Durée d'un round (s). */
const DURATION_SECONDS = 60;
/**
 * Décompte avant le départ. Il évite que la partie commence sous le doigt qui
 * vient d'appuyer sur « Commencer » — et surtout que la première question soit
 * chronométrée avant même d'être lisible.
 */
const COUNTDOWN_SECONDS = 3;
/** Verrou anti-tap accidentel sur l'écran de résultat (dernier appui du round). */
const RESULT_LOCK_MS = 500;
/**
 * Durée d'affichage, en écho, du résultat qu'on vient de trouver. PUREMENT
 * décoratif : l'écho s'efface dès la première frappe et ne retient jamais le
 * jeu — la question suivante est déjà active en dessous.
 */
const ANSWER_ECHO_MS = 800;
/**
 * Durée d'affichage de la bannière « record battu ». Plus longue que l'écho
 * (800 ms) parce qu'elle porte une phrase à lire, et non un nombre déjà attendu
 * — mais posée en surimpression, sans rien décaler et sans jamais retenir le
 * jeu : le round se joue toujours au nombre de réponses par minute.
 */
const RECORD_BANNER_MS = 2200;

const PLATFORM: PlatformTag =
  Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

type Phase = "countdown" | "playing" | "finished";
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
  /** Plage d'opérandes. Ignoré en mode ciblé, qui impose `ADAPTIVE_LEVEL`. */
  level?: Level;
}) {
  const router = useRouter();
  const { profile, ready } = useProfile();
  const config = OPERATION_CONFIG[operation];

  // Le mode ciblé impose son niveau, ici et pas seulement dans la feuille de
  // configuration : le niveau arrive par l'URL, qui n'est pas sous le contrôle
  // de l'app. Sans ce garde, `?mode=adaptive&level=4` bornerait la saisie à
  // 5 chiffres pour des faits qui n'en demandent que 3.
  const effectiveLevel = adaptive ? ADAPTIVE_LEVEL : level;

  // Dérivé du niveau : à Légendaire une multiplication atteint 10 000, que la
  // borne figée à 3 chiffres du banc d'essai rendrait impossible à saisir.
  const maxDigits = maxAnswerDigits(operation, effectiveLevel);

  const [session, setSession] = useState<SessionState>(initialSession);
  const [question, setQuestion] = useState<Question | null>(null);
  const [input, setInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(DURATION_SECONDS);
  const [phase, setPhase] = useState<Phase>("countdown");
  const [echo, setEcho] = useState<number | null>(null);
  const echoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  /**
   * Record personnel **avant** cette partie, à conditions identiques.
   * `undefined` = pas encore lu, `null` = jamais joué dans ces conditions.
   * La distinction sert à l'écran de résultat, qui n'affiche rien de faux tant
   * que la lecture n'est pas revenue.
   */
  const [record, setRecord] = useState<number | null | undefined>(undefined);
  const [recordBeaten, setRecordBeaten] = useState(false);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  /**
   * Énoncé vocal — décidé UNE fois, au montage. En vocal, la question n'est
   * **pas affichée** : la voix la remplace au lieu de la doubler.
   *
   * Lecture **synchrone** (cf. `readVoiceEnabledSync`) : arrivée de façon
   * asynchrone, la valeur pourrait manquer la première question, qui serait
   * alors la seule du round à rester muette.
   *
   * Un `useState` avec initialisation **paresseuse**, et non un `useRef` :
   * l'argument d'un `useRef` est évalué à chaque rendu, ce qui rejouerait cette
   * requête SQLite à chaque frappe et à chaque seconde du chronomètre. Le
   * réglage se change à l'accueil, jamais ici : la valeur est donc constante
   * pour toute la partie — ce qui laisse `nextQuestion` stable malgré la
   * dépendance, et décrit fidèlement la partie enregistrée en base.
   *
   * `isSpeechAvailable()` est décisif depuis que l'énoncé écrit disparaît :
   * sans moteur vocal, masquer la question ne laisserait **rien** à l'écran.
   * On retombe donc sur l'écrit, et la partie est enregistrée comme telle.
   */
  const [voice] = useState(
    () => readVoiceEnabledSync() && isSpeechAvailable(),
  );
  /**
   * Miroir synchrone de `record`, lu au milieu d'une bonne réponse — donc
   * possiblement avant le re-rendu, comme `inputRef` et `questionRef`.
   * Mis à jour à chaque partie, y compris après « Rejouer » : sans ça, la
   * seconde partie se comparerait encore au record d'avant la première.
   */
  const recordRef = useRef<number | null>(null);
  /** Une seule annonce par partie : on franchit le record une fois. */
  const recordBeatenRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Moteur vocal préparé dès le montage, donc pendant le décompte : c'est là
  // qu'on peut payer ses 100 à 300 ms d'initialisation sans les faire porter à
  // la première question, dont le chronomètre tourne déjà. Coupé au démontage,
  // sinon l'énoncé en cours poursuivrait sa lecture sur l'écran d'accueil.
  useEffect(() => {
    if (!voice) return;
    prepareSpeech();
    return stopSpeaking;
  }, [voice]);

  // Fin du round : `Game` reste monté (il rend l'écran de résultat), donc rien
  // ne couperait la question qui vient d'être énoncée à la seconde 60.
  useEffect(() => {
    if (phase === "finished") stopSpeaking();
  }, [phase]);

  // Historique → stats par fait et pool pondéré. Lecture LOCALE : contrairement
  // au web, aucun appel réseau — la partie démarre donc aussi en avion.
  useEffect(() => {
    if (!adaptive || !ready || !profile) return;
    let cancelled = false;
    void multiplicationFactStats(getDb(), profile.id)
      .then((all) => {
        if (cancelled) return;
        // L'historique contient les faits de TOUS les niveaux déjà joués. Le
        // mode ciblé ne travaille que la table de Facile : sans ce filtre, un
        // 47 × 83 hérité d'une partie Légendaire donnerait une réponse à
        // 4 chiffres, impossible à saisir ici (cf. `isAdaptiveFact`).
        const stats = all.filter((s) => isAdaptiveFact(s.a, s.b));
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

  // Record personnel à battre. Lecture LOCALE, comme les stats ci-dessus : la
  // partie démarre en avion, et le décompte de 3 s suffit largement à une
  // requête SQLite sur un index de profil.
  useEffect(() => {
    if (!ready || !profile) return;
    let cancelled = false;
    void personalBest(getDb(), {
      profileId: profile.id,
      operation,
      level: effectiveLevel,
      mode: adaptive ? "adaptive" : "classic",
      voice,
    })
      .then((best) => {
        if (cancelled) return;
        recordRef.current = best;
        setRecord(best);
      })
      .catch(() => {
        // Pas de record lisible : on joue sans annonce plutôt que d'en
        // promettre une fausse.
        if (!cancelled) setRecord(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, profile, operation, effectiveLevel, adaptive, voice]);

  // Intègre une réponse À CHAUD : le calcul raté peut revenir dans la même
  // partie (le pool ne dépend plus seulement de l'historique figé au départ).
  const applyAdaptiveAttempt = useCallback(
    (a: number, b: number, responseMs: number, maxIdleMs: number) => {
      // Même filtre que le chargement initial : une réponse hors table ne doit
      // pas se faufiler dans le vivier par la mise à jour à chaud.
      if (!adaptive || !isAdaptiveFact(a, b) || !isEngagedAttempt(maxIdleMs)) {
        return;
      }
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
      : () => generateQuestion(operation, levelRange(effectiveLevel));

    // `questionRef` porte encore la question sortante : c'est sa réponse qu'on
    // s'interdit de reproposer (elle reste affichée en écho).
    const q = drawDistinctQuestion(draw, questionRef.current?.answer ?? null);

    if (weighted) {
      const key = factKey(q.a, q.b);
      recentlyAskedRef.current = [key, ...recentlyAskedRef.current].slice(0, 2);
    }
    questionRef.current = q;
    setQuestion(q);
    // Énoncé tiré-et-oublié, juste après l'affichage : la voix accompagne la
    // question, elle ne la précède pas et ne la retient jamais.
    if (voice) speakQuestion(spokenQuestion(q));
    inputRef.current = "";
    setInput("");
    const now = Date.now();
    questionStart.current = now;
    activityRef.current = startActivity(now);
  }, [operation, adaptive, effectiveLevel, voice]);

  // Retour à l'accueil si aucun profil sélectionné.
  useEffect(() => {
    if (ready && !profile) router.replace("/");
  }, [ready, profile, router]);

  /**
   * Fin du décompte. La première question est tirée **ici**, et pas au montage :
   * `nextQuestion` pose `questionStart`, donc la tirer plus tôt ferait compter
   * les secondes du décompte dans le temps de réponse — et fausserait le modèle
   * adaptatif, qui se calibre justement sur ces temps.
   */
  const startPlaying = useCallback(() => {
    setPhase("playing");
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
   * Annonce le franchissement du record, **au moment exact où il tombe**.
   *
   * `=== best + 1` et non `> best` : c'est le franchissement qu'on fête, pas
   * l'état. Doublé du garde `recordBeatenRef`, qui tient même si la partie
   * repassait par cette valeur.
   *
   * `best >= 1` : battre un record de 0 n'est pas un exploit, c'est répondre.
   * Le joueur qui n'a encore rien à battre (`null`) n'est pas interpellé non
   * plus — on lui promettrait un adversaire qui n'existe pas.
   *
   * Comme tout le reste ici, l'annonce ne retient pas le jeu : elle est posée en
   * surimpression, la question suivante est déjà tirée en dessous.
   */
  const announceRecord = useCallback((correctCount: number) => {
    const best = recordRef.current;
    if (best === null || best < 1) return;
    if (recordBeatenRef.current || correctCount !== best + 1) return;
    recordBeatenRef.current = true;
    setRecordBeaten(true);
    celebrate();
    if (recordTimer.current) clearTimeout(recordTimer.current);
    recordTimer.current = setTimeout(
      () => setRecordBeaten(false),
      RECORD_BANNER_MS,
    );
  }, []);

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
      announceRecord(nextSession.correctCount);
      nextQuestion();
    },
    [nextQuestion, applyAdaptiveAttempt, announceRecord],
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

  /**
   * Redire l'énoncé. Indispensable en vocal : la question n'étant plus
   * affichée, un chiffre mal entendu ne se rattrape d'aucune autre façon.
   *
   * Ne touche NI au chronomètre de la question, NI à la saisie en cours :
   * réécouter n'est pas recommencer. Compte en revanche comme signe de vie,
   * au même titre qu'un appui sur le pavé — redemander l'énoncé prouve que
   * l'enfant est devant l'écran, et le distingue de celui qui est parti jouer.
   */
  const handleReplay = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    const q = questionRef.current;
    if (!q) return;
    activityRef.current = registerActivity(activityRef.current, Date.now());
    speakQuestion(spokenQuestion(q));
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
      if (recordTimer.current) clearTimeout(recordTimer.current);
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
      level: effectiveLevel,
      durationSeconds: DURATION_SECONDS - timeLeft,
      mode: adaptive ? "adaptive" : "classic",
      platform: PLATFORM,
      voice,
      // Tiré ici et pas au montage : `savedRef` garantit un seul passage par
      // partie, donc chaque partie a bien son propre identifiant.
      clientUuid: clientUuid(),
      answers: finished.answers,
    })
      .then(() => setSaveState("done"))
      .catch(() => setSaveState("error"));
  }, [phase, profile, operation, timeLeft, adaptive, effectiveLevel, voice]);

  const restart = useCallback(() => {
    savedRef.current = false;
    inputRef.current = "";
    setEcho(null);
    setSaveState("idle");
    // La partie qui vient d'être jouée compte désormais dans le record : sans
    // ça, « Rejouer » referait l'annonce sur le même palier, tour après tour.
    // Calculé plutôt que relu en base — la valeur est connue, exacte, et cette
    // relecture courrait après une écriture peut-être encore en vol.
    const played = sessionRef.current.correctCount;
    const nextRecord = Math.max(recordRef.current ?? 0, played);
    recordRef.current = nextRecord;
    setRecord(nextRecord);
    recordBeatenRef.current = false;
    setRecordBeaten(false);
    if (recordTimer.current) clearTimeout(recordTimer.current);
    setSession(initialSession);
    sessionRef.current = initialSession;
    setTimeLeft(DURATION_SECONDS);
    // Repasse par le décompte : « Rejouer » ne doit pas relancer une partie
    // sous le doigt, pas plus que le premier lancement.
    setPhase("countdown");
  }, []);

  if (phase === "finished") {
    return (
      <ResultScreen
        session={session}
        // Le record d'AVANT la partie : c'est lui qui donne son sens au score
        // qu'on vient de faire. `restart` ne l'avancera qu'au moment de rejouer.
        previousBest={record}
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

      {/* En SURIMPRESSION, et `pointerEvents="none"` : la bannière ne décale
          rien (déplacer la case de réponse en pleine partie serait pire que de
          ne rien annoncer) et n'intercepte aucun appui destiné au pavé. */}
      {recordBeaten ? (
        <View style={styles.recordBanner} pointerEvents="none">
          <Ionicons name="trophy" size={18} color={colors.white} />
          <Text style={styles.recordBannerText}>Record battu !</Text>
        </View>
      ) : null}

      {phase === "countdown" ? (
        <View style={styles.stage}>
          <Countdown seconds={COUNTDOWN_SECONDS} onDone={startPlaying} />
        </View>
      ) : (
        <>
      <View style={styles.stage}>
        {/* Écrit OU vocal, jamais les deux : afficher la question à côté de la
            voix ferait de celle-ci un doublon, et l'écrit gagnerait toujours.
            En vocal, le bouton occupe la place de l'énoncé — c'est le seul
            moyen de réentendre, donc il doit être là où l'œil cherche déjà. */}
        {voice ? (
          <Pressable
            style={styles.replay}
            onPress={handleReplay}
            accessibilityRole="button"
            accessibilityLabel="Redire la question"
          >
            <Ionicons name="volume-high" size={54} color={colors.green} />
          </Pressable>
        ) : (
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
        )}

        {/* La case suit le niveau : à Légendaire une réponse fait 5 chiffres,
            qui débordaient sur deux lignes dans une case taillée pour 3. */}
        <View
          style={[
            styles.answerBox,
            { minWidth: 68 + maxDigits * 22 },
            showingEcho && styles.answerBoxCorrect,
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.answerText,
              { fontSize: maxDigits >= 5 ? 32 : maxDigits === 4 ? 35 : 38 },
              input === "" && !showingEcho && styles.answerPlaceholder,
            ]}
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
        </>
      )}
    </SafeAreaView>
  );
}

function ResultScreen({
  session,
  previousBest,
  saveState,
  onRestart,
}: {
  session: SessionState;
  /** Record d'avant la partie. `undefined` = non lu, `null` = aucun. */
  previousBest: number | null | undefined;
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
        <RecordLine score={session.correctCount} previousBest={previousBest} />
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

/**
 * Le score du round rapporté au record personnel, sous le nombre.
 *
 * Quatre cas, et aucun ne ment : tant que le record n'est pas lu (`undefined`)
 * la ligne reste vide plutôt que d'afficher un « 0 » qui serait faux, et le
 * premier score dans ces conditions (`null`) est annoncé comme tel — pas comme
 * un record battu, il n'y avait pas d'adversaire.
 *
 * Le record est celui des **mêmes conditions** (opération, niveau, mode,
 * énoncé) : cf. `personalBest`, qui explique pourquoi cette comparaison n'a de
 * sens qu'à difficulté égale.
 */
function RecordLine({
  score,
  previousBest,
}: {
  score: number;
  previousBest: number | null | undefined;
}) {
  if (previousBest === undefined) return null;

  if (previousBest === null) {
    return <Text style={styles.recordLine}>Premier score dans ce mode</Text>;
  }
  if (score > previousBest) {
    return (
      <Text style={[styles.recordLine, styles.recordLineBeaten]}>
        🏆 Record battu ! (avant : {previousBest})
      </Text>
    );
  }
  if (score === previousBest) {
    return <Text style={styles.recordLine}>Record égalé : {previousBest}</Text>;
  }
  return (
    <Text style={styles.recordLine}>
      Record personnel : {previousBest} — encore {previousBest - score + 1} !
    </Text>
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

  // Prend la place de l'énoncé écrit, à hauteur comparable pour que la case de
  // réponse ne saute pas d'un mode à l'autre. Large : on le vise sans regarder,
  // parfois plusieurs fois de suite, sans quitter la position de saisie.
  replay: {
    width: 108,
    height: 108,
    borderRadius: radius.pill,
    backgroundColor: colors.greenSoft,
    borderWidth: 2,
    borderColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },

  // `minWidth` est posé au rendu, d'après le niveau. La hauteur, elle, ne
  // bouge pas : la case doit rester au même endroit d'un niveau à l'autre.
  answerBox: {
    height: 104,
    paddingHorizontal: spacing.lg,
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
  // `fontSize` est posé au rendu, d'après le niveau.
  answerText: { fontWeight: "700", color: colors.textPrimary },
  answerPlaceholder: { color: colors.textDisabled },

  // `position: absolute` : la bannière flotte sous l'en-tête sans pousser la
  // scène. `zIndex` la garde au-dessus de la case de réponse.
  recordBanner: {
    position: "absolute",
    top: spacing.xxl * 2,
    alignSelf: "center",
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.green,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    ...shadow.card,
  },
  recordBannerText: { color: colors.white, fontSize: 16, fontWeight: "700" },

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
  recordLine: {
    marginTop: spacing.md,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    color: colors.textSecondary,
  },
  recordLineBeaten: { color: colors.green, fontSize: 15 },
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
