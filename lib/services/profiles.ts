import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { profiles, type Profile } from "@/lib/db/schema";

/** Liste tous les profils par ordre alphabétique. */
export async function listProfiles(db: Database): Promise<Profile[]> {
  return db.select().from(profiles).orderBy(asc(profiles.name));
}

/** Récupère un profil par nom (insensible à la casse). */
export async function getProfileByName(
  db: Database,
  name: string,
): Promise<Profile | undefined> {
  const rows = await db
    .select()
    .from(profiles)
    .where(sql`lower(${profiles.name}) = lower(${name})`)
    .limit(1);
  return rows[0];
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
