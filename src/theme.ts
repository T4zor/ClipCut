export const theme = {
  colors: {
    // Fond principal (très sombre, presque noir, inspiré du fond de votre logo)
    background: '#0a0a0a', 
    
    // Fonds secondaires (pour les barres d'outils, la timeline)
    surface: '#181818',
    surfaceLight: '#2a2a2a',

    // La couleur d'accentuation tirée de votre logo (Violet fluo)
    primary: '#8b5cf6', // Un violet vibrant similaire à votre "C" de gauche
    
    // Texte
    text: '#ffffff',
    textSecondary: '#a1a1aa',

    // États
    danger: '#ef4444', // Pour le bouton "Supprimer" ou "Couper"
    success: '#22c55e',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    round: 9999, // Pour des boutons ronds
  }
};
