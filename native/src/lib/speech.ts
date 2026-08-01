/**
 * Lecture à voix haute de l'énoncé (« 10 fois 9 »).
 *
 * Même contrat que `haptics.ts` : **tiré et oublié**. Une partie se joue au
 * nombre de réponses par minute, donc rien ici ne doit jamais faire attendre la
 * saisie — aucun `await`, et un moteur vocal absent ou muet ne remonte jamais
 * d'erreur à l'appelant.
 *
 * Le moteur est celui du système (AVSpeechSynthesizer / Android TTS) : hors
 * ligne, sans clé ni quota, cohérent avec une app qui fonctionne en avion.
 *
 * Ce module N'EST PAS du jeu : la façon de dire une question (« fois »,
 * « divisé par ») vit dans `lib/game/` — cf. `spokenQuestion`.
 */

// Seul import statique du fichier, et seul qui soit sans danger : un
// `import type` est effacé à la compilation, il ne charge rien à l'exécution.
import type { SpeechOptions } from "expo-speech";

/**
 * Chargement **paresseux et rattrapé** des deux modules natifs.
 *
 * `expo-speech` et `expo-audio` font tous deux `requireNativeModule(...)` au
 * chargement, qui **jette** si la partie native est absente — un build de dev
 * plus ancien que l'ajout de la dépendance, par exemple. Importés en tête de
 * fichier, ils feraient donc échouer le chargement de `speech.ts`, puis de
 * `Game.tsx`, puis de la route `/play` entière : l'app n'affiche plus « pas de
 * voix », elle affiche « Route is missing the required default export » et le
 * jeu devient injouable.
 *
 * Un accessoire ne doit pas pouvoir emporter le jeu. D'où ces `require`
 * différés au premier usage : sans partie native, on joue en silence.
 */
type SpeechModule = typeof import("expo-speech");
type AudioModule = typeof import("expo-audio");

/** `undefined` = pas encore tenté, `null` = absent (on n'y revient plus). */
let speechModule: SpeechModule | null | undefined;
let audioModule: AudioModule | null | undefined;

function speech(): SpeechModule | null {
  if (speechModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      speechModule = require("expo-speech") as SpeechModule;
    } catch {
      speechModule = null;
    }
  }
  return speechModule;
}

function audio(): AudioModule | null {
  if (audioModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      audioModule = require("expo-audio") as AudioModule;
    } catch {
      audioModule = null;
    }
  }
  return audioModule;
}

const LANGUAGE = "fr-FR";

/**
 * Débit, en multiple du débit système (iOS : `rate × AVSpeechUtteranceDefaultSpeechRate`).
 *
 * Réglé à l'oreille, en deux essais : **1,25 trop rapide**, puis **1 trop
 * lent**. 1,125 est le milieu retenu — ne pas y revenir sans réécouter sur
 * l'appareil, l'oreille tranche ici bien mieux que le raisonnement.
 *
 * Ce qui rend l'arbitrage serré : la voix ne double pas un énoncé écrit, elle le
 * remplace (cf. `Game.tsx`, la question n'est pas affichée en mode vocal). Un
 * chiffre mal entendu ne se rattrape donc pas d'un coup d'œil, il se réécoute —
 * ce qui coûte bien plus que la fraction de seconde gagnée au débit.
 *
 * Au-delà de ~1,5 les nombres se déforment franchement (« soixante-seize »
 * devient difficile à distinguer de « seize »).
 */
const RATE = 1.125;

/**
 * Voix retenue pour la session (identifiant système), ou `null` pour laisser le
 * système choisir d'après `LANGUAGE`.
 *
 * Toujours issue d'un `getAvailableVoicesAsync()` du lancement en cours : un
 * identifiant mémorisé d'un lancement à l'autre peut désigner une voix que
 * l'utilisateur a entre-temps désinstallée, et `speak` rejette alors — sans
 * `catch` possible, l'appel natif étant lancé sans promesse rattachée.
 */
let voiceId: string | null = null;

let prepared = false;

/**
 * Le moteur vocal est-il utilisable sur cet appareil ?
 *
 * À interroger **avant de masquer l'énoncé écrit** : sans partie native, un
 * écran vocal ne montrerait ni ne dirait la question, et la partie serait
 * injouable. L'appelant retombe alors sur l'écrit.
 */
export function isSpeechAvailable(): boolean {
  return speech() !== null;
}

/**
 * Prépare le moteur vocal. Idempotent, à appeler avant la première question —
 * le décompte de départ est la fenêtre faite pour ça.
 *
 * Trois choses, qu'on ne veut pas payer sur le premier énoncé :
 *
 * 1. **La session audio.** `expo-speech` ne configure rien et hérite de la
 *    session de l'app, muette quand l'interrupteur latéral de l'iPhone est sur
 *    silencieux — un mobile d'enfant l'est souvent, et la fonctionnalité passe
 *    alors pour cassée. `playsInSilentMode` bascule la session en `playback`,
 *    qui ignore cet interrupteur.
 * 2. **Le choix de la voix.** La voix `fr-FR` par défaut d'iOS est la
 *    « Compact », nettement plus robotique que les « Enhanced » — mais ces
 *    dernières ne sont présentes que si l'utilisateur les a téléchargées
 *    (Réglages › Accessibilité › Contenu énoncé). D'où le choix au lancement,
 *    et non une constante.
 * 3. **L'initialisation du synthétiseur**, qui coûte 100 à 300 ms sur le tout
 *    premier énoncé. Une phrase à volume nul la paie d'avance : sans elle, ce
 *    retard tombe sur la première question, dont le chronomètre tourne déjà.
 */
export function prepareSpeech(): void {
  if (prepared) return;
  prepared = true;

  // `duckOthers` plutôt que `mixWithOthers` : si de la musique joue, l'énoncé
  // doit rester intelligible — un chiffre couvert est un chiffre perdu.
  void audio()
    ?.setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
    })
    .catch(() => {
      /* session audio indisponible : la voix marchera, sauf en mode silencieux */
    });

  const Speech = speech();
  if (!Speech) return;

  void Speech.getAvailableVoicesAsync()
    .then((voices) => {
      const french = voices.filter((v) => v.language?.startsWith("fr"));
      const enhanced = french.find((v) => v.quality === "Enhanced");
      voiceId = (enhanced ?? french[0])?.identifier ?? null;
    })
    .catch(() => {
      /* liste indisponible : le système choisira d'après `LANGUAGE` */
    })
    .finally(() => {
      Speech.speak("1", { ...options(), volume: 0 });
    });
}

/** Options communes — la voix n'est posée que si on en a résolu une. */
function options(): SpeechOptions {
  return {
    language: LANGUAGE,
    rate: RATE,
    ...(voiceId ? { voice: voiceId } : {}),
  };
}

/**
 * Énonce une question.
 *
 * `stop()` d'abord, impérativement : `speak` **empile** les énoncés. Une bonne
 * réponse tombe souvent plus vite que la lecture, donc sans cette coupure la
 * file s'allonge à chaque question et la voix finit par réciter, en fin de
 * round, des calculs résolus dix coups plus tôt.
 */
export function speakQuestion(text: string): void {
  stopSpeaking();
  speech()?.speak(text, options());
}

/**
 * Coupe la voix. À appeler en quittant l'écran de jeu : sans ça, l'énoncé en
 * cours continue par-dessus l'écran de résultat ou l'accueil.
 */
export function stopSpeaking(): void {
  void speech()
    ?.stop()
    .catch(() => {
      /* rien en cours, ou moteur absent */
    });
}
