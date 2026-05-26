import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const PhotoScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>📸 Retouche Photo</Text>
      <Text style={styles.subtitle}>Vos outils de retouche apparaîtront ici.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#181818', // Légèrement différent pour distinguer
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    color: '#888888',
    fontSize: 16,
  },
});

export default PhotoScreen;
