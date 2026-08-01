/**
 * Feuille de configuration d'un entraînement, ouverte au tap sur une opération.
 *
 * L'ordre des blocs suit leur dépendance : le **mode d'entraînement** vient en
 * premier parce qu'il commande le niveau. Choisir « Ciblé » impose `Facile` et
 * grise les autres — ses questions viennent de l'historique de multiplication,
 * qui ne travaille que la table jusqu'à 10 × 10 (cf. `lib/game/levels.ts`).
 *
 * Le bloc ③ porte l'**énoncé** (écrit ou lu), et non le mode de *réponse* :
 * la réponse dictée a été retirée de la maquette, elle ne sera pas proposée.
 * Les deux options s'excluent — cf. `Game.tsx` pour la conséquence à l'écran.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import {
  ADAPTIVE_LEVEL,
  DEFAULT_LEVEL,
  LEVELS,
  LEVEL_CONFIG,
  type Level,
} from "@/lib/game/levels";
import { OPERATION_CONFIG } from "@/lib/game/operations";
import type { Operation } from "@/lib/game/operations";
import type { SessionMode } from "@/lib/services/sessions";
import { useVoiceEnabled } from "@/lib/settings";
import { colors, radius, spacing } from "@/theme";

/** Une partie dure 60 s (repris du banc d'essai, `DURATION_SECONDS`). */
const ROUND_SECONDS = 60;

/** Icône et teinte de chaque niveau, dans l'ordre de la maquette. */
const LEVEL_STYLE: Record<
  Level,
  {
    icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
    tint: string;
    soft: string;
  }
> = {
  1: { icon: "emoticon-happy-outline", tint: colors.green, soft: colors.greenSoft },
  2: { icon: "emoticon-neutral-outline", tint: colors.orange, soft: colors.orangeSoft },
  3: { icon: "emoticon-sad-outline", tint: colors.red, soft: colors.redSoft },
  4: { icon: "crown-outline", tint: colors.purple, soft: colors.purpleSoft },
};

interface Props {
  operation: Operation | null;
  onClose: () => void;
  onStart: (operation: Operation, mode: SessionMode, level: Level) => void;
}

export function OperationSheet({ operation, onClose, onStart }: Props) {
  const [mode, setMode] = useState<SessionMode>("classic");
  const [level, setLevel] = useState<Level>(DEFAULT_LEVEL);
  // Seul réglage de cette feuille qui SURVIT à sa fermeture : il est global à
  // l'appareil (cf. `lib/settings.ts`), là où le mode et le niveau ne valent
  // que pour la partie qu'on lance.
  const { voiceEnabled, setVoiceEnabled } = useVoiceEnabled();

  // Le ciblage adaptatif s'appuie sur `multiplicationFactStats`, qui n'a pas
  // d'équivalent pour les autres opérations.
  const targetedAvailable = operation === "multiplication";
  // La feuille garde son état d'une ouverture à l'autre : si « Ciblé » était
  // choisi puis qu'on ouvre une opération qui ne le propose pas, on retombe
  // sur « Normal » plutôt que de démarrer dans un mode invisible à l'écran.
  const effectiveMode: SessionMode = targetedAvailable ? mode : "classic";
  const targeted = effectiveMode === "adaptive";
  const effectiveLevel: Level = targeted ? ADAPTIVE_LEVEL : level;

  const chooseTargeted = () => {
    setMode("adaptive");
    // Le niveau suit immédiatement : l'utilisateur doit voir la conséquence de
    // son choix, pas la découvrir en lançant la partie.
    setLevel(ADAPTIVE_LEVEL);
  };

  return (
    <Modal
      visible={operation !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Fermer"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.title}>
            {operation ? OPERATION_CONFIG[operation].label : ""}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* ① Mode d'entraînement — en premier : il commande le niveau. */}
        <SectionLabel index="1" label="Mode d'entraînement" />
        <View style={styles.row}>
          <OptionCard
            icon="target"
            label="Normal"
            tint={colors.green}
            selected={!targeted}
            onPress={() => setMode("classic")}
          />
          <OptionCard
            icon="target-variant"
            label="Ciblé (points faibles)"
            tint={colors.blue}
            selected={targeted}
            disabled={!targetedAvailable}
            note={
              targetedAvailable
                ? "table jusqu’à 10 × 10"
                : "multiplication seulement"
            }
            onPress={targetedAvailable ? chooseTargeted : undefined}
          />
        </View>

        {/* ② Niveau — une plage d'opérandes, affichée pour que le choix soit
            lisible. Verrouillé sur Facile en mode ciblé. */}
        <SectionLabel
          index="2"
          label="Niveau"
          hint={targeted ? "imposé par le mode ciblé" : undefined}
        />
        <View style={styles.row}>
          {LEVELS.map((id) => {
            const config = LEVEL_CONFIG[id];
            const style = LEVEL_STYLE[id];
            const selected = id === effectiveLevel;
            const locked = targeted && id !== ADAPTIVE_LEVEL;
            return (
              <Pressable
                key={id}
                style={[
                  styles.card,
                  styles.levelCard,
                  selected && {
                    borderColor: style.tint,
                    backgroundColor: style.soft,
                  },
                  locked && styles.cardDisabled,
                ]}
                onPress={locked ? undefined : () => setLevel(id)}
                disabled={locked}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: locked }}
              >
                <MaterialCommunityIcons
                  name={style.icon}
                  size={26}
                  color={locked ? colors.textDisabled : style.tint}
                />
                <Text
                  style={[styles.cardLabel, locked && styles.cardLabelDisabled]}
                  numberOfLines={1}
                >
                  {config.label}
                </Text>
                <Text
                  style={[styles.cardRange, locked && styles.cardLabelDisabled]}
                >
                  {config.min}–{config.max}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ③ Énoncé — les deux options s'EXCLUENT : en vocal, la question n'est
            pas affichée, sinon la voix ne serait qu'un doublon de l'écrit. */}
        <SectionLabel index="3" label="Énoncé" hint="réglage gardé" />
        <View style={styles.row}>
          <OptionCard
            icon="format-text"
            label="Écrit"
            tint={colors.green}
            selected={!voiceEnabled}
            onPress={() => setVoiceEnabled(false)}
          />
          <OptionCard
            icon="volume-high"
            label="Vocal"
            tint={colors.purple}
            selected={voiceEnabled}
            note="question non affichée"
            onPress={() => setVoiceEnabled(true)}
          />
        </View>

        <Pressable
          style={styles.cta}
          onPress={() =>
            operation && onStart(operation, effectiveMode, effectiveLevel)
          }
          accessibilityRole="button"
        >
          <Ionicons name="play" size={18} color={colors.white} />
          <Text style={styles.ctaText}>Commencer l’entraînement</Text>
        </Pressable>

        <View style={styles.duration}>
          <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.durationText}>
            Durée : {ROUND_SECONDS} secondes
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function SectionLabel({
  index,
  label,
  hint,
}: {
  index: string;
  label: string;
  hint?: string;
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionBadge}>
        <Text style={styles.sectionBadgeText}>{index}</Text>
      </View>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

function OptionCard({
  icon,
  label,
  tint,
  selected,
  disabled,
  note,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  tint: string;
  selected?: boolean;
  disabled?: boolean;
  note?: string;
  onPress?: () => void;
}) {
  const inactive = disabled;
  return (
    <Pressable
      style={[
        styles.card,
        styles.optionCard,
        selected && !inactive && styles.cardSelected,
        inactive && styles.cardDisabled,
      ]}
      onPress={inactive ? undefined : onPress}
      disabled={inactive || !onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: inactive }}
    >
      <View style={styles.optionInner}>
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color={inactive ? colors.textDisabled : tint}
        />
        <Text
          style={[
            styles.cardLabel,
            styles.optionLabel,
            inactive && styles.cardLabelDisabled,
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
      {selected && !inactive ? (
        <View style={styles.check}>
          <Ionicons name="checkmark" size={13} color={colors.white} />
        </View>
      ) : null}
      {note ? <Text style={styles.cardNote}>{note}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(17,19,26,0.18)" },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  title: { fontSize: 19, fontWeight: "700", color: colors.textPrimary },
  headerSpacer: { width: 26 },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sectionBadge: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionBadgeText: { fontSize: 11, fontWeight: "700", color: colors.green },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.7,
    color: colors.textMuted,
  },
  sectionHint: { fontSize: 11, fontWeight: "600", color: colors.textDisabled },

  row: { flexDirection: "row", gap: spacing.sm },
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  levelCard: { paddingVertical: spacing.md, gap: 2 },
  // `paddingRight` réserve la place de la coche : sans elle, un libellé long
  // (« Ciblé (points faibles) ») passe dessous.
  optionCard: {
    paddingVertical: spacing.lg,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xxl,
  },
  optionInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  optionLabel: { flexShrink: 1 },
  cardSelected: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  cardDisabled: { backgroundColor: colors.surface, borderColor: colors.border },
  cardLabel: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  cardLabelDisabled: { color: colors.textDisabled },
  cardRange: { fontSize: 11, color: colors.textSecondary },
  cardNote: {
    fontSize: 10,
    color: colors.textDisabled,
    marginTop: 2,
  },
  check: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },

  cta: {
    marginTop: spacing.xl,
    backgroundColor: colors.green,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  ctaText: { color: colors.white, fontSize: 17, fontWeight: "700" },
  duration: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  durationText: { fontSize: 13, color: colors.textSecondary },
});
