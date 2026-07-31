/**
 * Décompte avant le début d'une partie.
 *
 * Sans lui, le jeu démarrait à l'instant du tap sur « Commencer » : la première
 * question était déjà chronométrée pendant que le doigt quittait l'écran, ce qui
 * gonflait son `responseMs` et polluait le modèle adaptatif.
 *
 * ## Pourquoi l'anneau est dessiné à la main
 *
 * Pas de `react-native-svg` dans le projet, et l'ajouter — comme tout module
 * natif — obligerait à reconstruire puis réinstaller le build de dev sur
 * l'appareil. `react-native-reanimated` est écarté pour une autre raison : ses
 * worklets ont déjà fait planter Hermes (cf. `Keypad.tsx`).
 *
 * L'anneau est donc composé de vues : un disque de fond, deux demi-disques qui
 * pivotent derrière des masques, et un trou au centre qui transforme le tout en
 * anneau. Chaque demi-disque est posé **hors** de son masque au repos et y entre
 * en pivotant — c'est ce qui fait avancer l'arc.
 */

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/theme";

const SIZE = 168;
const STROKE = 12;
const HALF = SIZE / 2;

interface Props {
  /** Durée du décompte. */
  seconds: number;
  onDone: () => void;
}

export function Countdown({ seconds, onDone }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [remaining, setRemaining] = useState(seconds);
  // `onDone` dans une ref : le rappel ne doit pas relancer l'animation s'il
  // change d'identité au re-rendu du parent.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const total = seconds * 1000;
    const startedAt = Date.now();

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: total,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => finished && onDoneRef.current());

    // Le chiffre ne peut pas venir d'un listener sur `progress` : avec le
    // pilote natif, les listeners JS ne sont pas notifiés.
    const tick = setInterval(() => {
      const left = Math.max(0, total - (Date.now() - startedAt));
      setRemaining(Math.ceil(left / 1000));
    }, 80);

    return () => {
      animation.stop();
      clearInterval(tick);
    };
  }, [seconds, progress]);

  // Premier demi-tour : le disque entre dans le masque droit.
  const rightRotate = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["0deg", "180deg", "180deg"],
  });
  // Second demi-tour : idem à gauche, immobile tant qu'on n'a pas dépassé 50 %.
  const leftRotate = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["0deg", "0deg", "180deg"],
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.ring}>
        <View style={styles.track} />

        <View style={[styles.clip, styles.clipRight]}>
          <Animated.View
            style={[styles.bladeRight, { transform: [{ rotate: rightRotate }] }]}
          />
        </View>

        <View style={[styles.clip, styles.clipLeft]}>
          <Animated.View
            style={[styles.bladeLeft, { transform: [{ rotate: leftRotate }] }]}
          />
        </View>

        <View style={styles.hole}>
          <Text style={styles.count}>{remaining}</Text>
        </View>
      </View>

      <Text style={styles.hint}>Prêt ?</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", gap: 20 },
  ring: { width: SIZE, height: SIZE },

  track: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: HALF,
    backgroundColor: colors.border,
  },

  clip: { position: "absolute", top: 0, width: HALF, height: SIZE, overflow: "hidden" },
  clipRight: { left: HALF },
  clipLeft: { left: 0 },

  /**
   * Demi-disque GAUCHE posé dans le masque DROIT : au repos il est entièrement
   * hors du masque, donc invisible. Il pivote autour du centre du cercle
   * (`right center`, qui tombe pile sur l'axe) et entre dans le champ.
   */
  bladeRight: {
    position: "absolute",
    left: -HALF,
    top: 0,
    width: HALF,
    height: SIZE,
    borderTopLeftRadius: HALF,
    borderBottomLeftRadius: HALF,
    backgroundColor: colors.green,
    transformOrigin: "right center",
  },
  /** Symétrique : demi-disque DROIT posé dans le masque GAUCHE. */
  bladeLeft: {
    position: "absolute",
    left: HALF,
    top: 0,
    width: HALF,
    height: SIZE,
    borderTopRightRadius: HALF,
    borderBottomRightRadius: HALF,
    backgroundColor: colors.green,
    transformOrigin: "left center",
  },

  /** Le trou central : c'est lui qui fait de ces disques un anneau. */
  hole: {
    position: "absolute",
    left: STROKE,
    top: STROKE,
    width: SIZE - STROKE * 2,
    height: SIZE - STROKE * 2,
    borderRadius: HALF - STROKE,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  count: { fontSize: 64, fontWeight: "800", color: colors.textPrimary },

  hint: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: colors.textSecondary,
    borderRadius: radius.pill,
  },
});
