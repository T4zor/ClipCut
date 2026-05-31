import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Animated, Easing, View, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { theme } from '../theme';

const AnimatedNeonButton = ({ onPress, style, children, disabled }: any) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.5,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true, // Accélération matérielle (GPU)
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Déterminer la borderRadius du conteneur (si définie, sinon par défaut)
  const bRadius = style && style.borderRadius ? style.borderRadius : theme.borderRadius.md;

  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}>
      <View style={[style, { position: 'relative' }]}>
        {/* Contenu Réel du bouton par dessus en dégradé */}
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: bRadius, justifyContent: 'center', alignItems: 'center' }}
        />
        {children}
      </View>
    </TouchableOpacity>
  );
};

export default AnimatedNeonButton;
