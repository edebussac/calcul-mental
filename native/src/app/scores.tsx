/**
 * Écran des scores — **provisoire**, comme l'écran de jeu. Le banc d'essai web
 * y affiche les meilleurs scores par opération et les calculs les moins
 * maîtrisés ; les services qui les calculent (`bestScores`,
 * `multiplicationFactStats`) sont déjà portés et testés.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing } from "@/theme";

export default function ScoresScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Mes meilleurs scores</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.body}>
        <Text style={styles.pending}>Écran des scores à construire</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  title: { fontSize: 19, fontWeight: "700", color: colors.textPrimary },
  spacer: { width: 26 },
  body: { flex: 1, alignItems: "center", justifyContent: "center" },
  pending: { fontSize: 18, fontWeight: "600", color: colors.textSecondary },
});
