/**
 * Feuille de configuration d'un entraînement, ouverte au tap sur une opération.
 *
 * Les blocs non développés sont **affichés et grisés**, jamais masqués : la
 * maquette les anticipe volontairement. Ce qui est marqué « à venir » l'est
 * d'après l'état réel du code — voir les commentaires de chaque bloc.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { OPERATION_CONFIG } from "@/lib/game/operations";
import type { Operation } from "@/lib/game/operations";
import type { SessionMode } from "@/lib/services/sessions";
import { colors, radius, spacing } from "@/theme";

/** Une partie dure 60 s (repris du banc d'essai, `DURATION_SECONDS`). */
const ROUND_SECONDS = 60;

interface Props {
  operation: Operation | null;
  onClose: () => void;
  onStart: (operation: Operation, mode: SessionMode) => void;
}

export function OperationSheet({ operation, onClose, onStart }: Props) {
  // Le ciblage adaptatif n'existe que pour la multiplication : il s'appuie sur
  // `multiplicationFactStats`, qui n'a pas d'équivalent pour les autres.
  const targetedAvailable = operation === "multiplication";

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

        {/* ① Niveau — la colonne `level` existe en base mais rien ne la choisit
            ni ne la lit : le bloc est présenté, pas actif. */}
        <SectionLabel index="1" label="Niveau" comingSoon />
        <View style={styles.row}>
          <LevelCard
            icon="emoticon-happy-outline"
            label="Facile"
            tint={colors.green}
          />
          <LevelCard
            icon="emoticon-neutral-outline"
            label="Moyen"
            tint={colors.orange}
          />
          <LevelCard
            icon="emoticon-sad-outline"
            label="Difficile"
            tint={colors.red}
          />
          <LevelCard icon="crown-outline" label="Légendaire" tint={colors.purple} />
        </View>

        {/* ② Mode de réponse — la saisie au pavé existe ; le vocal, non. */}
        <SectionLabel index="2" label="Mode de réponse" />
        <View style={styles.row}>
          <OptionCard
            icon="keyboard-outline"
            label="Classique"
            tint={colors.green}
            selected
          />
          <OptionCard
            icon="microphone-outline"
            label="Vocal"
            tint={colors.purple}
            comingSoon
          />
        </View>

        {/* ③ Mode d'entraînement — le ciblage adaptatif est développé, mais
            seulement pour la multiplication. */}
        <SectionLabel index="3" label="Mode d'entraînement" />
        <View style={styles.row}>
          <OptionCard
            icon="target"
            label="Normal"
            tint={colors.green}
            selected
          />
          <OptionCard
            icon="target-variant"
            label="Ciblé (points faibles)"
            tint={colors.blue}
            disabled={!targetedAvailable}
            note={targetedAvailable ? undefined : "multiplication seulement"}
            onPress={
              targetedAvailable && operation
                ? () => onStart(operation, "adaptive")
                : undefined
            }
          />
        </View>

        <Pressable
          style={styles.cta}
          onPress={() => operation && onStart(operation, "classic")}
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
  comingSoon,
}: {
  index: string;
  label: string;
  comingSoon?: boolean;
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionBadge}>
        <Text style={styles.sectionBadgeText}>{index}</Text>
      </View>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      {comingSoon ? <Text style={styles.comingSoonTag}>à venir</Text> : null}
    </View>
  );
}

/** Carte de niveau : toujours inactive tant que le niveau n'existe pas. */
function LevelCard({
  icon,
  label,
  tint,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  tint: string;
}) {
  return (
    <View style={[styles.card, styles.levelCard, styles.cardDisabled]}>
      <MaterialCommunityIcons name={icon} size={26} color={tint} />
      <Text style={[styles.cardLabel, styles.cardLabelDisabled]}>{label}</Text>
    </View>
  );
}

function OptionCard({
  icon,
  label,
  tint,
  selected,
  disabled,
  comingSoon,
  note,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  tint: string;
  selected?: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
  note?: string;
  onPress?: () => void;
}) {
  const inactive = disabled || comingSoon;
  return (
    <Pressable
      style={[
        styles.card,
        styles.optionCard,
        selected && styles.cardSelected,
        inactive && styles.cardDisabled,
      ]}
      onPress={inactive ? undefined : onPress}
      disabled={inactive || !onPress}
      accessibilityRole="button"
    >
      <View style={styles.optionInner}>
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color={inactive ? colors.textDisabled : tint}
        />
        <Text
          style={[styles.cardLabel, inactive && styles.cardLabelDisabled]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {selected ? (
        <View style={styles.check}>
          <Ionicons name="checkmark" size={13} color={colors.white} />
        </View>
      ) : null}
      {comingSoon ? <Text style={styles.cardNote}>à venir</Text> : null}
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
  comingSoonTag: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textDisabled,
  },

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
  levelCard: { paddingVertical: spacing.md, gap: spacing.xs },
  optionCard: { paddingVertical: spacing.lg, paddingHorizontal: spacing.sm },
  optionInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardSelected: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  cardDisabled: { backgroundColor: colors.surface, borderColor: colors.border },
  cardLabel: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  cardLabelDisabled: { color: colors.textDisabled },
  cardNote: {
    fontSize: 10,
    color: colors.textDisabled,
    marginTop: 2,
  },
  check: {
    position: "absolute",
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
