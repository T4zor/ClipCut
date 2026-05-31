import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated, Easing } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';

const SplashScreen = () => {
  const navigation = useNavigation<any>();
  const glowAnim = useRef(new Animated.Value(0.2)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    // Animation de pulsation du néon
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.2,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Apparition avec léger zoom
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 1500,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();

    // Navigation vers le dashboard après 3 secondes
    const timer = setTimeout(() => {
      navigation.replace('VideoDashboard');
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoContainer, { transform: [{ scale: scaleAnim }] }]}>
        <Image 
          source={require('../assets/logo.jpeg')} 
          style={styles.logoImage} 
          resizeMode="contain" 
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background, // Noir cassé
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 180,
    height: 180,
  }
});

export default SplashScreen;
