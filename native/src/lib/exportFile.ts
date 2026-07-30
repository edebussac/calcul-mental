import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/**
 * Écrit un export dans un fichier temporaire et ouvre la feuille de partage.
 *
 * Le banc d'essai web proposait deux liens `<a download>` vers `/api/export`.
 * Sur mobile il n'y a ni téléchargement ni dossier « Téléchargements » : on
 * écrit dans le cache, puis on laisse l'utilisateur choisir la destination
 * (Fichiers, Mail, AirDrop…). Les données ne quittent l'appareil que s'il le
 * décide — l'app, elle, ne les envoie nulle part.
 *
 * Le cache est choisi plutôt que le stockage permanent : le fichier n'a plus
 * d'utilité une fois partagé, et le système peut le purger librement.
 */
export async function shareExport(
  filename: string,
  contents: string,
  mimeType: string,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Le partage n'est pas disponible sur cet appareil");
  }

  const file = new File(Paths.cache, filename);
  // Un export précédent porte le même nom : on repart d'un fichier vide plutôt
  // que d'écrire par-dessus des données plus longues.
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}
