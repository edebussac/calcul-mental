/**
 * Accueil — choix du profil et de l'entraînement.
 *
 * Les 5 opérations sont actives : le moteur sait toutes les jouer depuis le
 * commit c53d053. La feuille de configuration ne porte plus aucun « à venir » :
 * le niveau et l'énoncé vocal existent, et la réponse dictée — seule option qui
 * restait à l'état de maquette — a été retirée, elle ne sera pas proposée.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OperationSheet } from "@/components/OperationSheet";
import { ProfileSheet } from "@/components/ProfileSheet";
import type { Level } from "@/lib/game/levels";
import {
  OPERATION_CONFIG,
  OPERATION_MENU_ORDER,
  type Operation,
} from "@/lib/game/operations";
import { useProfile } from "@/lib/profile";
import type { SessionMode } from "@/lib/services/sessions";
import { colors, radius, shadow, spacing } from "@/theme";

export default function HomeScreen() {
  const router = useRouter();
  const { profile, setProfile, ready } = useProfile();
  const [sheetOperation, setSheetOperation] = useState<Operation | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const start = useCallback(
    (operation: Operation, mode: SessionMode, level: Level) => {
      setSheetOperation(null);
      router.push(`/play/${operation}?mode=${mode}&level=${level}`);
    },
    [router],
  );

  // Tant que le profil n'est pas lu, on n'affiche pas la feuille : elle
  // s'ouvrirait puis se refermerait aussitôt sur un profil déjà enregistré.
  const needsProfile = ready && !profile;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Blitzmatic</Text>
          <Pressable
            style={styles.profileChip}
            onPress={() => setProfileOpen(true)}
            accessibilityRole="button"
          >
            <Ionicons name="person-outline" size={17} color={colors.textPrimary} />
            <Text style={styles.profileChipText}>
              {profile?.name ?? "Profil"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.scoresCard}
          onPress={() => router.push("/scores")}
          accessibilityRole="button"
        >
          <View style={[styles.iconChip, styles.iconChipGreen]}>
            <Ionicons name="trending-up" size={22} color={colors.green} />
          </View>
          <View style={styles.scoresText}>
            <Text style={styles.scoresTitle}>Mes meilleurs scores</Text>
            <Text style={styles.scoresSubtitle}>Historique enregistré</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>

        <Text style={styles.sectionLabel}>CHOISIS UN ENTRAÎNEMENT</Text>

        <View style={styles.list}>
          {OPERATION_MENU_ORDER.map((operation, i) => {
            const config = OPERATION_CONFIG[operation];
            return (
              <Pressable
                key={operation}
                style={[styles.row, i > 0 && styles.rowDivided]}
                onPress={() => setSheetOperation(operation)}
                accessibilityRole="button"
              >
                <View style={[styles.iconChip, styles.iconChipGreen]}>
                  <Text style={styles.symbol}>{config.symbol}</Text>
                </View>
                <Text style={styles.rowLabel}>{config.label}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <OperationSheet
        operation={sheetOperation}
        onClose={() => setSheetOperation(null)}
        onStart={start}
      />

      <ProfileSheet
        visible={profileOpen || needsProfile}
        dismissible={!needsProfile}
        onClose={() => setProfileOpen(false)}
        onSelect={(p) => {
          void setProfile(p);
          setProfileOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  // 32 et non 40 : « Blitzmatic » est bien plus long que l'ancien titre et
  // viendrait toucher la pastille de profil sur les petits écrans.
  screenTitle: { fontSize: 32, fontWeight: "800", color: colors.textPrimary },
  profileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    ...shadow.card,
  },
  profileChipText: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },

  scoresCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  scoresText: { flex: 1, gap: 2 },
  scoresTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  scoresSubtitle: { fontSize: 14, color: colors.textSecondary },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { flex: 1, fontSize: 17, fontWeight: "600", color: colors.textPrimary },

  iconChip: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconChipGreen: { backgroundColor: colors.greenSoft },
  symbol: { fontSize: 22, fontWeight: "700", color: colors.green },
});
