import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const VideoScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎬 Montage Vidéo</Text>
      <Text style={styles.subtitle}>Votre timeline apparaîtra ici.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212', // Thème sombre façon CapCut
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

export default VideoScreen;
