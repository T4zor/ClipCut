export const theme = {
  colors: {
    // Fond principal (noir cassé ascendant gris, pour correspondre au fond du logo)
    background: '#0c0c0e', 
    
    // Fonds secondaires (pour les barres d'outils, la timeline)
    surface: '#18181c',
    surfaceLight: '#25252b',

    // La couleur d'accentuation tirée de votre logo (Violet fluo)
    primary: '#8b5cf6', // Violet vibrant neon
    primaryDark: '#4c1d95', // Variante sombre du violet pour l'ombre
    secondary: '#ff2a7a', // Rose neon
    
    // Texte
    text: '#ffffff',
    textSecondary: '#a1a1aa',

    // États
    danger: '#ff1e56', 
    success: '#00ff88',
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
