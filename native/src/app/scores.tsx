/**
 * Écran des scores, porté de `app/scores/page.tsx` du banc d'essai web.
 *
 * Mêmes sections que le banc d'essai, à deux différences près :
 *
 * - **Pas d'export.** Le banc d'essai proposait un téléchargement JSON/CSV ;
 *   l'app n'en propose pas, et les modules correspondants ont été retirés
 *   plutôt que laissés en sommeil.
 * - **Les records sont par conditions de jeu**, et non par opération : une carte
 *   par niveau × opération × énoncé (× mode). C'est le regroupement de
 *   `personalBest`, et il doit le rester — cet écran affiche le record que la
 *   partie annonce, les deux ne peuvent pas se contredire.
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
import { LEVEL_CONFIG, isLevel } from "@/lib/game/levels";
import {
  OPERATION_CONFIG,
  OPERATION_MENU_ORDER,
  type Operation,
} from "@/lib/game/operations";
import { useProfile } from "@/lib/profile";
import { multiplicationFactStats } from "@/lib/services/factStats";
import { bestScores, recentSessions, type BestScore } from "@/lib/services/sessions";
import { colors, radius, shadow, spacing } from "@/theme";

/** Nombre de calculs faibles affichés — repris du banc d'essai. */
const WEAK_FACTS_SHOWN = 8;
/** Parties relues en base, avant filtrage par opération. */
const HISTORY_FETCHED = 80;
/** Parties affichées après filtrage. */
const HISTORY_SHOWN = 12;

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
  /** Opération affichée ; `null` = tout. */
  const [filter, setFilter] = useState<Operation | null>(null);

  useEffect(() => {
    if (!ready || !profile) return;
    let alive = true;
    const db = getDb();

    void bestScores(db, profile.id)
      .then((r) => alive && setScores(r))
      .catch(() => alive && setScores([]));
    // On récupère large puis on filtre à l'affichage : sans ça, filtrer sur
    // « Addition » après dix parties de multiplication ne montrerait rien.
    void recentSessions(db, profile.id, HISTORY_FETCHED)
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

  // Une carte par conditions de jeu (niveau × opération × énoncé × mode), dans
  // l'ordre du menu puis du niveau — sinon SQLite les rend dans l'ordre de son
  // regroupement, qui n'a aucune raison de suivre celui de l'accueil.
  const shownScores = scores
    ?.filter((s) => !filter || s.operation === filter)
    .slice()
    .sort(
      (a, b) =>
        OPERATION_MENU_ORDER.indexOf(a.operation) -
          OPERATION_MENU_ORDER.indexOf(b.operation) ||
        a.level - b.level ||
        Number(a.voice) - Number(b.voice) ||
        a.mode.localeCompare(b.mode),
    );
  const shownHistory = history
    ?.filter((h) => !filter || h.operation === filter)
    .slice(0, HISTORY_SHOWN);
  // Les faits travaillés n'existent que pour la multiplication : afficher la
  // section sous un filtre « Addition » promettrait des données inexistantes.
  const showWeakFacts = !filter || filter === "multiplication";

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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <FilterChip
                label="Tout"
                active={filter === null}
                onPress={() => setFilter(null)}
              />
              {OPERATION_MENU_ORDER.map((op) => (
                <FilterChip
                  key={op}
                  label={OPERATION_CONFIG[op].label}
                  symbol={OPERATION_CONFIG[op].symbol}
                  active={filter === op}
                  onPress={() => setFilter(op)}
                />
              ))}
            </ScrollView>

            <Section title="Records">
              {shownScores === undefined ? (
                <Text style={styles.muted}>Chargement…</Text>
              ) : shownScores.length === 0 ? (
                <Text style={styles.muted}>
                  Aucune partie enregistrée pour l’instant.
                </Text>
              ) : (
                <View style={styles.cards}>
                  {shownScores.map((s) => (
                    <View
                      // Quatre critères dans la clé : c'est exactement ce qui
                      // distingue deux cartes, donc deux parties de conditions
                      // différentes ne peuvent pas se recouvrir.
                      key={`${s.operation}-${s.level}-${s.mode}-${s.voice}`}
                      style={styles.recordCard}
                    >
                      <View style={styles.recordLeft}>
                        <Text style={styles.symbol}>
                          {OPERATION_CONFIG[s.operation]?.symbol ?? "?"}
                        </Text>
                        <View style={styles.recordTitles}>
                          <Text style={styles.recordLabel}>
                            {isLevel(s.level)
                              ? LEVEL_CONFIG[s.level].label
                              : `Niveau ${s.level}`}{" "}
                            ·{" "}
                            {OPERATION_CONFIG[s.operation]?.label ?? s.operation}
                          </Text>
                          <Text style={styles.recordConditions}>
                            {s.voice ? "vocal" : "écrit"}
                            {s.mode === "adaptive" ? " · ciblé" : ""}
                          </Text>
                        </View>
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
              {shownHistory === undefined ? (
                <Text style={styles.muted}>Chargement…</Text>
              ) : shownHistory.length === 0 ? (
                <Text style={styles.muted}>
                  Rien pour l’instant. Joue une partie !
                </Text>
              ) : (
                <View style={styles.panel}>
                  {shownHistory.map((h, i) => (
                    <View
                      key={h.id}
                      style={[styles.historyRow, i > 0 && styles.divided]}
                    >
                      <View style={styles.historyLeft}>
                        <Text style={styles.symbolSmall}>
                          {OPERATION_CONFIG[h.operation]?.symbol ?? "?"}
                        </Text>
                        <View>
                          <Text style={styles.muted}>
                            {formatDate(h.startedAt)}
                          </Text>
                          {/* Le niveau change la plage d'opérandes : sans lui,
                              deux scores très différents sont incomparables. */}
                          <Text style={styles.historyLevel}>
                            {isLevel(h.level)
                              ? LEVEL_CONFIG[h.level].label
                              : `niveau ${h.level}`}
                            {h.mode === "adaptive" ? " · ciblé" : ""}
                          </Text>
                        </View>
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

            {showWeakFacts ? (
            <Section title="Multiplications à retravailler">
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
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  symbol,
  active,
  onPress,
}: {
  label: string;
  symbol?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {symbol ? (
        <Text style={[styles.chipSymbol, active && styles.chipTextActive]}>
          {symbol}
        </Text>
      ) : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
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

  filterRow: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  chipSymbol: { fontSize: 14, fontWeight: "700", color: colors.green },
  chipTextActive: { color: colors.white },

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
  recordLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
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
  // `flexShrink` : « Légendaire · Multiplication » est long, il doit se serrer
  // plutôt que pousser le score hors de la carte.
  recordTitles: { flexShrink: 1, gap: 1 },
  recordLabel: { fontSize: 16, fontWeight: "500", color: colors.textPrimary },
  recordConditions: { fontSize: 11, color: colors.textMuted },
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
  historyLevel: { fontSize: 11, color: colors.textMuted },
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
