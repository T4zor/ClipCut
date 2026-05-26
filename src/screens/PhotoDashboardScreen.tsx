import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';

const PhotoDashboardScreen = () => {
  const navigation = useNavigation<any>();

  const handleImportPhoto = () => {
    // Naviguer vers l'éditeur photo (plus tard, on demandera de choisir une photo ici)
    navigation.navigate('PhotoEditor');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Retouche Photo</Text>

      <TouchableOpacity style={styles.importButton} onPress={handleImportPhoto}>
        <Text style={styles.importButtonText}>+ Importer une image</Text>
      </TouchableOpacity>

      <Text style={styles.recentTitle}>Récemment modifiées</Text>
      <View style={styles.emptyStateContainer}>
        <Text style={styles.emptyStateText}>Aucune photo pour le moment.</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
  },
  importButton: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  importButtonText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  recentTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: theme.spacing.md,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
});

export default PhotoDashboardScreen;
