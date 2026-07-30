/**
 * Identifiant de partie, tiré côté client.
 *
 * C'est la clé qui rendra une future synchro idempotente : deux téléphones en
 * SQLite local produisent chacun une session `id = 1`, donc c'est ce UUID — et
 * non l'`id` — qui identifie une partie (cf. `sessions.clientUuid`).
 *
 * `crypto.randomUUID` existe selon les moteurs ; le repli couvre le cas où
 * Hermes ne l'expose pas. Pour cet usage la qualité de l'aléa n'est pas
 * critique : il s'agit d'éviter une collision entre les parties d'une famille,
 * pas de résister à un adversaire.
 */
export function clientUuid(): string {
  const native = globalThis.crypto?.randomUUID;
  if (typeof native === "function") return native.call(globalThis.crypto);

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
