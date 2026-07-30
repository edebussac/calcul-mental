/**
 * Écran des scores, porté de `app/scores/page.tsx` du banc d'essai web.
 *
 * Mêmes sections, mêmes données — à une exception près : **pas d'export**. Le
 * banc d'essai proposait un téléchargement JSON/CSV ; l'app n'en propose pas,
 * et les modules correspondants ont été retirés plutôt que laissés en sommeil.
 *
 * Les trois `fetch` deviennent des lectures SQLite locales : l'écran s'affiche
 * donc en avion.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getDb } from "@/lib/db/client";
import type { Session } from "@/lib/db/schema";
import { analyzeFacts, type FactAnalysis } from "@/lib/game/adaptive";
import { OPERATION_CONFIG } from "@/lib/game/operations";
import { useProfile } from "@/lib/profile";
import { multiplicationFactStats } from "@/lib/services/factStats";
import { bestScores, recentSessions, type BestScore } from "@/lib/services/sessions";
import { colors, radius, shadow, spacing } from "@/theme";

/** Nombre de calculs faibles affichés — repris du banc d'essai. */
const WEAK_FACTS_SHOWN = 8;

function formatDate(date: Date): string {
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

const plural = (n: number, word: string) => `${word}${n > 1 ? "s" : ""}`;

export default function ScoresScreen() {
  const router = useRouter();
  const { profile, ready } = useProfile();

  const [scores, setScores] = useState<BestScore[] | null>(null);
  const [history, setHistory] = useState<Session[] | null>(null);
  const [weakFacts, setWeakFacts] = useState<FactAnalysis[] | null>(null);

  useEffect(() => {
    if (!ready || !profile) return;
    let alive = true;
    const db = getDb();

    void bestScores(db, profile.id)
      .then((r) => alive && setScores(r))
      .catch(() => alive && setScores([]));
    void recentSessions(db, profile.id)
      .then((r) => alive && setHistory(r))
      .catch(() => alive && setHistory([]));
    void multiplicationFactStats(db, profile.id)
      .then((stats) =>
        alive && setWeakFacts(analyzeFacts(stats).slice(0, WEAK_FACTS_SHOWN)),
      )
      .catch(() => alive && setWeakFacts([]));

    return () => {
      alive = false;
    };
  }, [ready, profile]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace("/")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Mes scores</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {ready && !profile ? (
          <Text style={styles.muted}>Aucun profil sélectionné.</Text>
        ) : null}

        {profile ? (
          <>
            <Section title="Records">
              {scores === null ? (
                <Text style={styles.muted}>Chargement…</Text>
              ) : scores.length === 0 ? (
                <Text style={styles.muted}>
                  Aucune partie enregistrée pour l’instant.
                </Text>
              ) : (
                <View style={styles.cards}>
                  {scores.map((s) => (
                    <View key={s.operation} style={styles.recordCard}>
                      <View style={styles.recordLeft}>
                        <Text style={styles.symbol}>
                          {OPERATION_CONFIG[s.operation]?.symbol ?? "?"}
                        </Text>
                        <Text style={styles.recordLabel}>
                          {OPERATION_CONFIG[s.operation]?.label ?? s.operation}
                        </Text>
                      </View>
                      <View style={styles.recordRight}>
                        <Text style={styles.recordScore}>{s.bestScore}</Text>
                        <Text style={styles.recordMeta}>
                          meilleur · {s.plays} {plural(s.plays, "partie")}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            <Section title="Historique">
              {history === null ? (
                <Text style={styles.muted}>Chargement…</Text>
              ) : history.length === 0 ? (
                <Text style={styles.muted}>
                  Rien pour l’instant. Joue une partie !
                </Text>
              ) : (
                <View style={styles.panel}>
                  {history.map((h, i) => (
                    <View
                      key={h.id}
                      style={[styles.historyRow, i > 0 && styles.divided]}
                    >
                      <View style={styles.historyLeft}>
                        <Text style={styles.symbolSmall}>
                          {OPERATION_CONFIG[h.operation]?.symbol ?? "?"}
                        </Text>
                        <Text style={styles.muted}>
                          {formatDate(h.startedAt)}
                        </Text>
                      </View>
                      <Text style={styles.historyScore}>
                        {h.correctCount}{" "}
                        {plural(h.correctCount, "bonne")}{" "}
                        {plural(h.correctCount, "réponse")}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            <Section title="Calculs à travailler">
              {weakFacts === null ? (
                <Text style={styles.muted}>Chargement…</Text>
              ) : weakFacts.length === 0 ? (
                <Text style={styles.muted}>
                  Pas encore assez de données. Joue quelques parties de
                  multiplication !
                </Text>
              ) : (
                <View style={styles.panel}>
                  {weakFacts.map((f) => {
                    // Barre = temps de ce calcul relatif au plus lent affiché
                    // (simple repère visuel, aucune pondération).
                    const maxMs = Math.max(...weakFacts.map((w) => w.avgMs));
                    const width =
                      maxMs > 0 ? Math.max(6, (f.avgMs / maxMs) * 100) : 6;
                    return (
                      <View key={`${f.a}x${f.b}`} style={styles.weakRow}>
                        <View style={styles.weakHead}>
                          <Text style={styles.weakFact}>
                            {f.a} × {f.b}
                          </Text>
                          <Text style={styles.muted}>
                            {formatMs(f.avgMs)} · {f.attempts}{" "}
                            {plural(f.attempts, "essai")}
                          </Text>
                        </View>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${width}%` }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Section>

          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: 19, fontWeight: "700", color: colors.textPrimary },
  headerSpacer: { width: 26 },

  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xxl,
  },
  section: { gap: spacing.md },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  muted: { fontSize: 14, color: colors.textSecondary },

  cards: { gap: spacing.md },
  recordCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    ...shadow.card,
  },
  recordLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  symbol: {
    width: 24,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    color: colors.green,
  },
  symbolSmall: {
    width: 20,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: colors.green,
  },
  recordLabel: { fontSize: 16, fontWeight: "500", color: colors.textPrimary },
  recordRight: { alignItems: "flex-end" },
  recordScore: { fontSize: 24, fontWeight: "800", color: colors.textPrimary },
  recordMeta: { fontSize: 11, color: colors.textSecondary },

  panel: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    padding: spacing.sm,
    ...shadow.card,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  historyLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  historyScore: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },

  weakRow: { gap: spacing.xs, padding: spacing.md },
  weakHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  weakFact: { fontSize: 17, fontWeight: "600", color: colors.textPrimary },
  barTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.green },
});
