import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Camera } from 'expo-camera';

interface BottomTabBarProps {
  activeTab?: 'home' | 'garden' | 'camera' | 'care' | 'profile';
}

export default function BottomTabBar({ activeTab }: BottomTabBarProps) {
  const router = useRouter();

  const handleCameraPress = async () => {
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
      router.push('/camera');
    }
  };

  return (
    <View style={styles.tabContainer}>
      <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)')} activeOpacity={0.7}>
        <Image
          source={require('@/assets/images/home.png')}
          style={{ width: 22, height: 22 }}
          tintColor={activeTab === 'home' ? '#4E8C44' : '#8CA696'}
          contentFit="contain"
        />
        <Text style={[styles.tabLabel, activeTab === 'home' && styles.activeTabLabel]}>Home</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)/my-garden')} activeOpacity={0.7}>
        <Image
          source={require('@/assets/images/my-plant.png')}
          style={{ width: 22, height: 22 }}
          tintColor={activeTab === 'garden' ? '#4E8C44' : '#8CA696'}
          contentFit="contain"
        />
        <Text style={[styles.tabLabel, activeTab === 'garden' && styles.activeTabLabel]}>My Garden</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cameraTabItem} onPress={handleCameraPress} activeOpacity={0.85}>
        <View style={styles.floatingCameraBtn}>
          <Image
            source={require('@/assets/images/camera.png')}
            style={{ width: 24, height: 24 }}
            tintColor="#FFFFFF"
            contentFit="contain"
          />
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)/care')} activeOpacity={0.7}>
        <Image
          source={require('@/assets/images/care.png')}
          style={{ width: 22, height: 22 }}
          tintColor={activeTab === 'care' ? '#4E8C44' : '#8CA696'}
          contentFit="contain"
        />
        <Text style={[styles.tabLabel, activeTab === 'care' && styles.activeTabLabel]}>Care</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)/profile')} activeOpacity={0.7}>
        <Image
          source={require('@/assets/images/profile.png')}
          style={{ width: 22, height: 22 }}
          tintColor={activeTab === 'profile' ? '#4E8C44' : '#8CA696'}
          contentFit="contain"
        />
        <Text style={[styles.tabLabel, activeTab === 'profile' && styles.activeTabLabel]}>Profile</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    height: 60,
    borderTopWidth: 1,
    borderTopColor: '#F0F5EF',
    paddingBottom: 6,
    paddingTop: 6,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#8CA696',
    marginTop: 2,
  },
  activeTabLabel: {
    fontWeight: '800',
    color: '#4E8C44',
  },
  cameraTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCameraBtn: {
    top: -14,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#7DA676',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
});
