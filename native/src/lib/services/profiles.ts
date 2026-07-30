import { asc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { profiles, type Profile } from "@/lib/db/schema";

/** Liste tous les profils par ordre alphabétique. */
export async function listProfiles(db: Database): Promise<Profile[]> {
  return db.select().from(profiles).orderBy(asc(profiles.name));
}

/**
 * Récupère un profil par nom (insensible à la casse).
 *
 * La comparaison se fait **en JavaScript**, et non en SQL comme sur le banc
 * d'essai web. Raison : le `lower()` de SQLite est purement ASCII — il laisse
 * « É » intact, si bien que `lower('NOÉ') = lower('Noé')` est faux. Postgres,
 * lui, abaisse correctement l'UTF-8. Un enfant prénommé Noé, Chloé ou Théo se
 * serait donc vu créer un second profil à chaque saisie en majuscules.
 *
 * Le balayage complet est sans conséquence : les profils se comptent sur les
 * doigts d'une main (une famille), et la table est locale à l'appareil.
 */
export async function getProfileByName(
  db: Database,
  name: string,
): Promise<Profile | undefined> {
  const target = name.toLocaleLowerCase();
  const rows = await db.select().from(profiles);
  return rows.find((p) => p.name.toLocaleLowerCase() === target);
}

/**
 * Retourne le profil existant (même nom, casse ignorée) ou le crée.
 * Idempotent : deux appels avec "Léa"/"léa" renvoient le même profil.
 */
export async function getOrCreateProfile(
  db: Database,
  rawName: string,
): Promise<Profile> {
  const name = rawName.trim();
  if (!name) throw new Error("Le nom du profil est requis");

  const existing = await getProfileByName(db, name);
  if (existing) return existing;

  const inserted = await db.insert(profiles).values({ name }).returning();
  return inserted[0];
}

/** Récupère un profil par id. */
export async function getProfileById(
  db: Database,
  id: number,
): Promise<Profile | undefined> {
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  return rows[0];
}
