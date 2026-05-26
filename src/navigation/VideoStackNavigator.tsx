import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import VideoDashboardScreen from '../screens/VideoDashboardScreen';
import VideoEditorScreen from '../screens/VideoEditorScreen';

const Stack = createNativeStackNavigator();

const VideoStackNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="VideoDashboard" component={VideoDashboardScreen} />
      <Stack.Screen name="VideoEditor" component={VideoEditorScreen} />
    </Stack.Navigator>
  );
};

export default VideoStackNavigator;
