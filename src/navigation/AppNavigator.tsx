import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import VideoDashboardScreen from '../screens/VideoDashboardScreen';
import VideoEditorScreen from '../screens/VideoEditorScreen';
import PhotoDashboardScreen from '../screens/PhotoDashboardScreen';
import PhotoEditorScreen from '../screens/PhotoEditorScreen';
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Le TabNavigator ne contient QUE les Dashboards
const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopWidth: 0,
        },
        tabBarActiveTintColor: theme.colors.primary, // On utilise votre violet !
        tabBarInactiveTintColor: '#555555',
      }}
    >
      <Tab.Screen 
        name="Vidéo" 
        component={VideoDashboardScreen} 
        options={{ tabBarIconStyle: { display: 'none' }, tabBarLabelPosition: 'beside-icon' }}
      />
      <Tab.Screen 
        name="Photo" 
        component={PhotoDashboardScreen} 
        options={{ tabBarIconStyle: { display: 'none' }, tabBarLabelPosition: 'beside-icon' }}
      />
    </Tab.Navigator>
  );
};

// L'AuthStack pour les utilisateurs non connectés
const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

// Le RootStack contient les Tabs ET les Éditeurs en plein écran
const MainStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
    <Stack.Screen name="Splash" component={SplashScreen} />
    {/* L'écran principal est notre barre d'onglets */}
    <Stack.Screen name="MainTabs" component={TabNavigator} />
    <Stack.Screen name="VideoDashboard" component={VideoDashboardScreen} />
    
    {/* Ces écrans s'ouvriront PAR-DESSUS les onglets, les masquant automatiquement ! */}
    <Stack.Screen name="VideoEditor" component={VideoEditorScreen} />
    <Stack.Screen name="PhotoEditor" component={PhotoEditorScreen} />
  </Stack.Navigator>
);

const AppNavigator = () => {
  const { session, isLoading } = useAuth();

  // Si on est en train de vérifier la session AsyncStorage, on peut afficher un écran noir ou le SplashScreen
  if (isLoading) {
    return null; // Ou retourner un vrai composant de chargement
  }

  // Si pas de session, on retourne l'AuthStack, sinon le MainStack
  return session ? <MainStack /> : <AuthStack />;
};

export default AppNavigator;
