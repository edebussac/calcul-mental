/**
 * Jetons de style de Blitzmatic.
 *
 * Contrairement au banc d'essai web — où le style était explicitement jetable —
 * l'apparence fait ici partie du produit (cf. AGENTS.md). Centraliser les
 * valeurs évite qu'une teinte de vert se mette à diverger d'un écran à l'autre.
 *
 * Le thème est **clair uniquement** (`userInterfaceStyle: "light"` dans
 * app.json) : la maquette l'est, et un thème sombre non dessiné donnerait un
 * résultat pire que pas de thème sombre du tout.
 */

export const colors = {
  /** Fond d'écran, lavande très pâle. */
  background: "#EDEEF6",
  /** Cartes posées sur le fond. */
  surface: "#F7F8FC",
  /** Feuilles et options, franchement blanches. */
  surfaceRaised: "#FFFFFF",

  textPrimary: "#11131A",
  textSecondary: "#8B90A3",
  /** Libellés de section, en capitales. */
  textMuted: "#9AA0B4",
  /** Élément présenté mais pas encore développé. */
  textDisabled: "#B4B9C9",

  border: "#E4E6EF",

  /** Vert d'action : validation, sélection, appel à l'action. */
  green: "#2FB863",
  greenBright: "#4ECD7B",
  greenSoft: "#DFF5E7",

  orange: "#F0A020",
  orangeSoft: "#FDF2DF",

  red: "#EE6C3E",
  redSoft: "#FCE9E1",

  purple: "#7A45F0",
  purpleSoft: "#EFE8FE",

  blue: "#2F7BF5",
  blueSoft: "#E4EEFE",

  white: "#FFFFFF",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/**
 * Ombre douce et large, façon iOS. Les deux plateformes n'ont pas la même API :
 * `elevation` côté Android, les `shadow*` côté iOS.
 */
export const shadow = {
  card: {
    shadowColor: "#1B1F3B",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;
