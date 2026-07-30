/**
 * Pavé numérique.
 *
 * Porte l'exigence durable du §7 de `../MIGRATION-MOBILE.md` :
 *
 * > Un chiffre s'enregistre **au contact**, pas au relâchement, et deux touches
 * > doivent être pressables **indépendamment** (chevauchement ordonné).
 *
 * ## Pourquoi ni `Pressable`, ni `react-native-gesture-handler`
 *
 * `Pressable` déclenche `onPress` au **relâchement** (même défaut que le
 * `onClick` du banc d'essai web, corrigé là-bas en `onPointerDown`), et le
 * système de responder n'attribue le toucher qu'à **une seule vue** : poser le
 * 6 pendant que le 5 est enfoncé perdrait le second appui.
 *
 * `react-native-gesture-handler` réglerait le multi-touch, mais construire un
 * objet `Gesture` fait **planter Hermes en natif** dans Expo Go (SIGSEGV dans
 * `worklets::JSIWorkletsModuleProxy::toOptimizedObject`, via
 * `HermesRuntimeImpl::cloneString`). Un crash natif, non rattrapable côté JS.
 *
 * ## La solution : un seul responder, et du calcul de position
 *
 * Le pavé entier devient le responder unique et reçoit **tous** les touchers.
 * Chaque toucher est rattaché à une touche par ses coordonnées, et suivi par
 * son `identifier`. On obtient exactement ce que demande le §7 :
 *
 * - le chiffre part sur le toucher (`onResponderGrant` / `onResponderStart`) ;
 * - plusieurs doigts coexistent, chacun avec son identifiant ;
 * - l'ordre est celui des contacts, puisque chaque nouveau toucher est traité
 *   à son arrivée.
 *
 * Les touches portent `pointerEvents="none"` : sans ça elles seraient la cible
 * des touchers et `locationX/Y` serait relatif à la touche, pas au pavé.
 *
 * ⚠️ Ce que le simulateur ne prouve pas : le chevauchement réel de deux doigts
 * sur une dalle capacitive. Cf. §9 — ça se valide avec un téléphone en main.
 */

import { useCallback, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeTouchEvent,
} from "react-native";

import { colors, radius, shadow, spacing } from "@/theme";

type Key = number | "back" | "reset";

const LAYOUT: Key[][] = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
  ["reset", 0, "back"],
];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * `onLayout` d'une touche donne des coordonnées relatives à **sa ligne**, alors
 * que les touchers sont relatifs au pavé. On mémorise donc la ligne d'origine
 * pour y ajouter son décalage au moment du test de position — et non à la
 * mesure, car l'ordre des `onLayout` entre ligne et touche n'est pas garanti.
 */
interface KeyRect extends Rect {
  row: number;
}

export interface KeypadProps {
  onDigit: (digit: number) => void;
  onDelete: () => void;
  onReset: () => void;
  disabled?: boolean;
}

export function Keypad({ onDigit, onDelete, onReset, disabled }: KeypadProps) {
  /** Rectangle de chaque touche, relatif à sa ligne (cf. `KeyRect`). */
  const rects = useRef(new Map<Key, KeyRect>());
  /** Ordonnée de chaque ligne dans le pavé. */
  const rowTops = useRef(new Map<number, number>());
  /**
   * Toucher (par `identifier`) → touche enfoncée. Un doigt, une entrée : c'est
   * ce qui permet à plusieurs touches d'être enfoncées en même temps.
   */
  const touched = useRef(new Map<NativeTouchEvent["identifier"], Key>());
  /** Miroir pour l'affichage : plusieurs touches peuvent être enfoncées. */
  const [pressed, setPressed] = useState<ReadonlySet<Key>>(new Set());

  const syncPressed = useCallback(() => {
    setPressed(new Set(touched.current.values()));
  }, []);

  const keyAt = useCallback((x: number, y: number): Key | undefined => {
    for (const [key, r] of rects.current) {
      const top = (rowTops.current.get(r.row) ?? 0) + r.y;
      if (x >= r.x && x <= r.x + r.width && y >= top && y <= top + r.height) {
        return key;
      }
    }
    return undefined;
  }, []);

  const press = useCallback(
    (touches: readonly NativeTouchEvent[]) => {
      if (disabled) return;
      let changed = false;
      for (const t of touches) {
        // `onResponderGrant` et `onResponderStart` peuvent rapporter le même
        // toucher : sans ce garde, le chiffre partirait deux fois.
        if (touched.current.has(t.identifier)) continue;
        const key = keyAt(t.locationX, t.locationY);
        if (key === undefined) continue;
        touched.current.set(t.identifier, key);
        changed = true;
        if (key === "reset") onReset();
        else if (key === "back") onDelete();
        else onDigit(key);
      }
      if (changed) syncPressed();
    },
    [disabled, keyAt, onDigit, onDelete, onReset, syncPressed],
  );

  const release = useCallback(
    (touches: readonly NativeTouchEvent[]) => {
      let changed = false;
      for (const t of touches) {
        if (touched.current.delete(t.identifier)) changed = true;
      }
      if (changed) syncPressed();
    },
    [syncPressed],
  );

  const releaseAll = useCallback(() => {
    if (touched.current.size === 0) return;
    touched.current.clear();
    syncPressed();
  }, [syncPressed]);

  /**
   * `changedTouches` liste les touchers qui viennent de changer. Il peut être
   * vide sur certains événements synthétiques : on retombe alors sur
   * l'événement lui-même, qui décrit un toucher unique.
   */
  const changed = (event: GestureResponderEvent): readonly NativeTouchEvent[] => {
    const list = event.nativeEvent.changedTouches;
    return list && list.length > 0 ? list : [event.nativeEvent];
  };

  return (
    <View
      style={styles.grid}
      onStartShouldSetResponder={() => true}
      // Le pavé garde la main même si un doigt glisse : sans ça, un scroll
      // parent pourrait lui voler le responder en pleine saisie.
      onMoveShouldSetResponder={() => false}
      onResponderGrant={(e) => press(changed(e))}
      onResponderStart={(e) => press(changed(e))}
      onResponderRelease={(e) => release(changed(e))}
      onResponderEnd={(e) => release(changed(e))}
      onResponderTerminationRequest={() => false}
      onResponderTerminate={releaseAll}
    >
      {LAYOUT.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={styles.row}
          onLayout={(e) =>
            rowTops.current.set(rowIndex, e.nativeEvent.layout.y)
          }
        >
          {row.map((key) => (
            <KeyCap
              key={String(key)}
              value={key}
              pressed={pressed.has(key)}
              disabled={disabled}
              onMeasure={(rect) =>
                rects.current.set(key, { ...rect, row: rowIndex })
              }
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function KeyCap({
  value,
  pressed,
  disabled,
  onMeasure,
}: {
  value: Key;
  pressed: boolean;
  disabled?: boolean;
  onMeasure: (rect: Rect) => void;
}) {
  const handleLayout = (event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    // Coordonnées relatives à la ligne ; le décalage vertical de celle-ci est
    // ajouté par `keyAt`.
    onMeasure({ x, y, width, height });
  };

  const label = value === "reset" ? "C" : value === "back" ? "⌫" : String(value);

  const accessibilityLabel =
    value === "reset"
      ? "Tout effacer"
      : value === "back"
        ? "Effacer"
        : `Chiffre ${value}`;

  return (
    <View
      // Indispensable : sinon la touche devient la cible du toucher et
      // `locationX/Y` cesse d'être relatif au pavé.
      pointerEvents="none"
      onLayout={handleLayout}
      style={[styles.key, pressed && styles.keyPressed, disabled && styles.keyDisabled]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text
        style={[
          styles.keyLabel,
          typeof value !== "number" && styles.keyLabelSecondary,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md },
  key: {
    flex: 1,
    paddingVertical: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  keyPressed: { backgroundColor: colors.greenSoft },
  keyDisabled: { opacity: 0.5 },
  keyLabel: { fontSize: 28, fontWeight: "600", color: colors.textPrimary },
  keyLabelSecondary: { fontSize: 22, color: colors.textSecondary },
});
