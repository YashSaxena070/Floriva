import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { HapticTab } from '@/components/haptic-tab';
import { Image } from 'expo-image';
import { Camera } from 'expo-camera';

export default function TabLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4E8C44',
        tabBarInactiveTintColor: '#8CA696',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#FFFFFF',
          height: 70,
          borderTopWidth: 1,
          borderTopColor: '#F0F5EF',
          paddingBottom: 10,
          paddingTop: 10,
          shadowColor: '#1C3A27',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/home.png')}
              style={{ width: 22, height: 22 }}
              tintColor={color}
              contentFit="contain"
            />
          ),
          tabBarLabel: ({ color, focused }) => (
            <Text style={{ color, fontWeight: focused ? '800' : '500', fontSize: 10 }}>
              Home
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="my-garden"
        options={{
          title: 'My Garden',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/my-plant.png')}
              style={{ width: 22, height: 22 }}
              tintColor={color}
              contentFit="contain"
            />
          ),
          tabBarLabel: ({ color, focused }) => (
            <Text style={{ color, fontWeight: focused ? '800' : '500', fontSize: 10 }}>
              My Garden
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="camera-tab"
        options={{
          title: '',
          tabBarIcon: () => (
            <View style={styles.floatingCameraWrapper}>
              <View style={styles.floatingCameraBtn}>
                <Image
                  source={require('@/assets/images/camera.png')}
                  style={{ width: 24, height: 24 }}
                  tintColor="#FFFFFF"
                  contentFit="contain"
                />
              </View>
            </View>
          ),
        }}
        listeners={{
          tabPress: async (e) => {
            e.preventDefault();
            try {
              const { status } = await Camera.getCameraPermissionsAsync();
              if (status === 'granted') {
                router.push('/camera');
              } else {
                const { status: newStatus } = await Camera.requestCameraPermissionsAsync();
                if (newStatus === 'granted') {
                  router.push('/camera');
                } else {
                  alert('Camera permission is required to scan plants! 📸');
                }
              }
            } catch (err) {
              console.warn('Error checking camera permission on tab press:', err);
              router.push('/camera');
            }
          },
        }}
      />
      <Tabs.Screen
        name="care"
        options={{
          title: 'Care',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/care.png')}
              style={{ width: 22, height: 22 }}
              tintColor={color}
              contentFit="contain"
            />
          ),
          tabBarLabel: ({ color, focused }) => (
            <Text style={{ color, fontWeight: focused ? '800' : '500', fontSize: 10 }}>
              Care
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/profile.png')}
              style={{ width: 22, height: 22 }}
              tintColor={color}
              contentFit="contain"
            />
          ),
          tabBarLabel: ({ color, focused }) => (
            <Text style={{ color, fontWeight: focused ? '800' : '500', fontSize: 10 }}>
              Profile
            </Text>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  floatingCameraWrapper: {
    top: -24,
    justifyContent: 'center',
    alignItems: 'center',
    width: 68,
    height: 68,
  },
  floatingCameraBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7DA676',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
});
