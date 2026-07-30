import * as Haptics from "expo-haptics";

/**
 * Petite vibration à chaque bonne réponse.
 *
 * Remplace le hack `<input switch>` du banc d'essai web : ici c'est le vrai
 * Taptic Engine. **Non vérifiable en simulateur** (il n'en a pas) — cf.
 * MIGRATION-MOBILE.md §9, ça se valide avec un téléphone en main.
 *
 * L'appel est volontairement « tiré et oublié » : une vibration qui échoue ne
 * doit jamais interrompre la partie.
 */
export function haptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
    /* appareil sans moteur haptique, ou retour désactivé par l'utilisateur */
  });
}
