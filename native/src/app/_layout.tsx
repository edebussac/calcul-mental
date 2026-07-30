import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { getDb } from "@/lib/db/client";
import migrations from "@/lib/db/migrations";

/**
 * Les migrations sont appliquées **avant** le premier écran : tant qu'elles ne
 * sont pas passées, aucune table n'existe et la moindre requête échouerait.
 * Elles sont embarquées dans le bundle (cf. metro.config.js), donc aucune
 * lecture de fichier ni accès réseau n'est en jeu — l'app démarre en avion.
 */
export default function RootLayout() {
  const { success, error } = useMigrations(getDb(), migrations);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Migration impossible</Text>
        <Text style={styles.detail}>{error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={styles.center}>
        <Text style={styles.detail}>Préparation de la base…</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    padding: 24,
    gap: 8,
  },
  error: { color: "#ff6b6b", fontSize: 18, fontWeight: "700" },
  detail: { color: "#888", fontSize: 14, textAlign: "center" },
});
