/**
 * Choix ou création du profil. Un profil, c'est un prénom — pas de compte, pas
 * de mot de passe (cf. MIGRATION-MOBILE.md §11, « cercle privé »).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getDb } from "@/lib/db/client";
import type { StoredProfile } from "@/lib/profile";
import { getOrCreateProfile, listProfiles } from "@/lib/services/profiles";
import { colors, radius, spacing } from "@/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (profile: StoredProfile) => void;
  /** Empêche la fermeture tant qu'aucun profil n'est choisi (premier lancement). */
  dismissible?: boolean;
}

export function ProfileSheet({
  visible,
  onClose,
  onSelect,
  dismissible = true,
}: Props) {
  const [existing, setExisting] = useState<StoredProfile[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    void listProfiles(getDb()).then((rows) =>
      setExisting(rows.map((r) => ({ id: r.id, name: r.name }))),
    );
  }, [visible]);

  const create = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Entre un prénom");
      return;
    }
    try {
      const profile = await getOrCreateProfile(getDb(), trimmed);
      setName("");
      setError(null);
      onSelect({ id: profile.id, name: profile.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible");
    }
  }, [name, onSelect]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={dismissible ? onClose : undefined}
    >
      {/* Sans ce conteneur, le clavier recouvre entièrement la feuille : le
          champ de saisie et le bouton de création deviennent invisibles au
          moment précis où on s'en sert. */}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          style={styles.backdrop}
          onPress={dismissible ? onClose : undefined}
        />
        <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          {dismissible ? (
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fermer">
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <Text style={styles.title}>Qui joue ?</Text>
          <View style={styles.headerSpacer} />
        </View>

        {existing.map((p) => (
          <Pressable
            key={p.id}
            style={styles.profileRow}
            onPress={() => onSelect(p)}
            accessibilityRole="button"
          >
            <Ionicons name="person" size={18} color={colors.green} />
            <Text style={styles.profileName}>{p.name}</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
        ))}

        <Text style={styles.addLabel}>NOUVEAU PROFIL</Text>
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            placeholder="Prénom"
            placeholderTextColor={colors.textDisabled}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={create}
          />
          <Pressable style={styles.addButton} onPress={create}>
            <Ionicons name="add" size={24} color={colors.white} />
          </Pressable>
        </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
    marginBottom: spacing.md,
  },
  title: { fontSize: 19, fontWeight: "700", color: colors.textPrimary },
  headerSpacer: { width: 26 },

  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  profileName: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.textPrimary },

  addLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.7,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: 16,
    color: colors.textPrimary,
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { color: colors.red, fontSize: 13, marginTop: spacing.xs },
});
