/**
 * Écran de fumée de l'étape 1 — provisoire, remplacé à l'étape 3.
 *
 * Il n'a qu'un seul rôle : faire exécuter `lib/game/` par Hermes. Les tests
 * unitaires tournent sous Node ; les voir verts ne prouve donc pas que le code
 * s'exécute sur le moteur JS du téléphone. Cet écran le prouve.
 */

import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { formatQuestion, generateQuestion } from "@/lib/game/generator";
import { OPERATION_CONFIG, OPERATION_MENU_ORDER } from "@/lib/game/operations";

interface Line {
  label: string;
  question: string;
  answer: number;
}

function drawAll(): Line[] {
  return OPERATION_MENU_ORDER.map((operation) => {
    const question = generateQuestion(operation);
    // `all` se résout en une opération de base : on affiche le symbole de
    // l'opération réellement tirée, pas le « ? » du menu.
    const symbol = OPERATION_CONFIG[question.operation].symbol;
    return {
      label: OPERATION_CONFIG[operation].label,
      question: formatQuestion(question, symbol),
      answer: question.answer,
    };
  });
}

export default function SmokeScreen() {
  const [lines, setLines] = useState<Line[]>(drawAll);

  const redraw = useCallback(() => setLines(drawAll()), []);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>Cerveau de jeu</Text>
        <Text style={styles.subtitle}>lib/game/ exécuté par Hermes</Text>

        {lines.map((line) => (
          <View key={line.label} style={styles.row}>
            <Text style={styles.label}>{line.label}</Text>
            <Text style={styles.question}>
              {line.question} = {line.answer}
            </Text>
          </View>
        ))}

        <Pressable style={styles.button} onPress={redraw}>
          <Text style={styles.buttonText}>Retirer au sort</Text>
        </Pressable>
      </View>
    </SafeAreaView>
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
  question: { color: "#fff", fontSize: 20, fontVariant: ["tabular-nums"] },
  button: {
    marginTop: 24,
    backgroundColor: "#2b7fff",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
