import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';

const PhotoEditorScreen = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>{"< Retour"}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Éditeur Photo</Text>
        <TouchableOpacity style={styles.exportButton}>
          <Text style={styles.exportButtonText}>Enregistrer</Text>
        </TouchableOpacity>
      </View>

      {/* Zone Image */}
      <View style={styles.imageArea}>
        <Text style={styles.imageText}>Votre photo apparaîtra ici</Text>
      </View>

      {/* Zone d'outils / Sliders */}
      <View style={styles.toolsArea}>
        <Text style={styles.toolsText}>Outils (Luminosité, Contraste, Filtres...)</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  backButtonText: {
    color: theme.colors.text,
    fontSize: 16,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  exportButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.round,
  },
  exportButtonText: {
    color: theme.colors.text,
    fontWeight: 'bold',
  },
  imageArea: {
    flex: 4, 
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageText: {
    color: theme.colors.textSecondary,
  },
  toolsArea: {
    flex: 1.5, 
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: theme.colors.surfaceLight,
  },
  toolsText: {
    color: theme.colors.textSecondary,
  },
});

export default PhotoEditorScreen;
