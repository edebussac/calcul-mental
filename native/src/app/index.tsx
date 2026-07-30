/**
 * Écran de fumée de l'étape 2 — provisoire, remplacé à l'étape 3.
 *
 * Il fait exercer par Hermes ce que les tests ne peuvent pas atteindre : le
 * chemin réel `expo-sqlite` (les tests, eux, adossent les mêmes services à
 * better-sqlite3 sous Node). Une partie est écrite puis relue, migrations
 * comprises. Si cet écran affiche des compteurs qui montent, la persistance
 * locale tient sur l'appareil.
 */

import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getDb } from "@/lib/db/client";
import { generateQuestion } from "@/lib/game/generator";
import { getOrCreateProfile } from "@/lib/services/profiles";
import {
  bestScoreFor,
  recentSessions,
  saveSession,
  type Platform as SessionPlatform,
} from "@/lib/services/sessions";
import type { AnswerRecord } from "@/lib/game/engine";

/** `platform` est requis par saveSession — pas de défaut silencieux. */
const CURRENT_PLATFORM: SessionPlatform =
  Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web";

interface Snapshot {
  profile: string;
  plays: number;
  bestScore: number;
  lastAnswers: number;
  error?: string;
}

/** Joue une fausse partie de 3 questions, dont 2 justes. */
function fakeRound(): AnswerRecord[] {
  return [0, 1, 2].map((i) => {
    const q = generateQuestion("multiplication");
    const given = i === 2 ? q.answer + 1 : q.answer; // la 3e est fausse
    return {
      a: q.a,
      b: q.b,
      operation: "multiplication" as const,
      expected: q.answer,
      given,
      isCorrect: given === q.answer,
      responseMs: 1200 + i * 100,
      maxIdleMs: 0,
    };
  });
}

export default function SmokeScreen() {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  const read = useCallback(async () => {
    try {
      const db = getDb();
      const profile = await getOrCreateProfile(db, "Testeur");
      const sessions = await recentSessions(db, profile.id, 50);
      const best = await bestScoreFor(db, profile.id, "multiplication");
      setSnap({
        profile: profile.name,
        plays: sessions.length,
        bestScore: best,
        lastAnswers: sessions[0]?.totalQuestions ?? 0,
      });
    } catch (e) {
      setSnap({
        profile: "—",
        plays: 0,
        bestScore: 0,
        lastAnswers: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const play = useCallback(async () => {
    const db = getDb();
    const profile = await getOrCreateProfile(db, "Testeur");
    await saveSession(db, {
      profileId: profile.id,
      operation: "multiplication",
      durationSeconds: 60,
      platform: CURRENT_PLATFORM,
      answers: fakeRound(),
    });
    await read();
  }, [read]);

  useEffect(() => {
    void read();
  }, [read]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>Persistance locale</Text>
        <Text style={styles.subtitle}>
          expo-sqlite · plateforme « {CURRENT_PLATFORM} »
        </Text>

        {snap?.error ? (
          <Text style={styles.error}>{snap.error}</Text>
        ) : (
          <>
            <Row label="Profil" value={snap?.profile ?? "…"} />
            <Row label="Parties enregistrées" value={String(snap?.plays ?? 0)} />
            <Row label="Meilleur score" value={String(snap?.bestScore ?? 0)} />
            <Row
              label="Questions (dernière)"
              value={String(snap?.lastAnswers ?? 0)}
            />
          </>
        )}

        <Pressable style={styles.button} onPress={play}>
          <Text style={styles.buttonText}>Enregistrer une partie</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#111" },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: 24, gap: 4 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#888", fontSize: 14, marginBottom: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#333",
  },
  label: { color: "#888", fontSize: 16 },
  value: { color: "#fff", fontSize: 20, fontVariant: ["tabular-nums"] },
  error: { color: "#ff6b6b", fontSize: 14 },
  button: {
    marginTop: 24,
    backgroundColor: "#2b7fff",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
