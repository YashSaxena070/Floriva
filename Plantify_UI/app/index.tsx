import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Setup databases & redirect
  useEffect(() => {
    setLoading(false);
  }, []);

  const handleStart = async (action: 'scan' | 'upload') => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        if (action === 'scan') {
          router.replace('/(tabs)');
        } else {
          router.replace('/upload-photo');
        }
      } else {
        router.push({
          pathname: '/location-permission',
          params: { action }
        });
      }
    } catch (err) {
      router.push({
        pathname: '/location-permission',
        params: { action }
      });
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FBF7', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4E8C44" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      {/* Top Decorative Leaves outside ScrollView */}
      <View style={styles.topDecorationLeft} pointerEvents="none">
        <Image
          source={{ uri: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?q=80&w=200&auto=format&fit=crop" }}
          style={styles.decorativeLeaf}
          contentFit="cover"
        />
      </View>
      <View style={styles.topDecorationRight} pointerEvents="none">
        <Image
          source={{ uri: "https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=300&auto=format&fit=crop" }}
          style={styles.decorativeMonstera}
          contentFit="cover"
        />
      </View>

      {/* Pinned Security Footer */}
      <View style={styles.footer} pointerEvents="none">
        <Image source={require('@/assets/images/secure.png')} style={styles.footerIcon} contentFit="contain" />
        <Text style={styles.footerText}>100% Secure – No data shared</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Section */}
        <View style={styles.brandContainer}>
          <Image
            source={require('@/assets/images/leaf1.png')}
            style={styles.brandLogo}
            contentFit="contain"
          />
          <Text style={styles.brandName}>Plantify</Text>
          <Text style={styles.taglineHeadline}>Identify. Learn. Care.</Text>
          <Text style={styles.taglineSubline}>Your plants, your green space.</Text>
        </View>

        {/* Welcome Banner Card */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerTextContainer}>
            <View style={styles.welcomePill}>
              <Image source={require('@/assets/images/small-leave.png')} style={styles.pillIcon} contentFit="contain" />
              <Text style={styles.welcomePillText}>Welcome to Plantify!</Text>
            </View>
            <Text style={styles.bannerDescription}>
              From identification to thriving care —      all in one place.
            </Text>
          </View>
          <Image
            source={require('@/assets/images/welcome_no_bg.png')}
            style={styles.bannerImage}
            contentFit="contain"
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {/* Scan Button */}
          <TouchableOpacity
            style={styles.scanButton}
            activeOpacity={0.9}
            onPress={() => handleStart('scan')}
          >
            <View style={styles.buttonIconBackground}>
              <Image source={require('@/assets/images/camera.png')} style={styles.buttonIconImage} contentFit="contain" />
            </View>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.scanButtonText}>Start Scanning the Plant</Text>
              <Text style={styles.scanButtonSubtext}>Use your camera to identify any plant instantly</Text>
            </View>
            <View style={styles.arrowIconContainer}>
              <Image source={require('@/assets/images/next.png')} style={styles.nextIcon} contentFit="contain" />
            </View>
          </TouchableOpacity>

          {/* Upload Button */}
          <TouchableOpacity
            style={styles.uploadButton}
            activeOpacity={0.9}
            onPress={() => handleStart('upload')}
          >
            <View style={[styles.buttonIconBackground, styles.uploadIconBg]}>
              <Image source={require('@/assets/images/upload.png')} style={styles.buttonIconImage} contentFit="contain" />
            </View>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.uploadButtonText}>Upload Photo</Text>
              <Text style={styles.uploadButtonSubtext}>Choose from your gallery</Text>
            </View>
            <Image source={require('@/assets/images/next.png')} style={styles.nextIcon} contentFit="contain" />
          </TouchableOpacity>
        </View>

        {/* Bottom Decorative Plant */}
        <View style={styles.bottomDecorationLeft}>
          <Image
            source={{ uri: "https://images.unsplash.com/photo-1545241047-6083a3684587?q=80&w=200&auto=format&fit=crop" }}
            style={styles.decorativePlant}
            contentFit="cover"
          />
        </View>
        <View style={styles.bottomDecorationRight}>
          <Image
            source={{ uri: "https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=200&auto=format&fit=crop" }}
            style={styles.decorativePlantRight}
            contentFit="cover"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  topDecorationLeft: {
    position: 'absolute',
    left: -20,
    top: -10,
    width: 120,
    height: 150,
    opacity: 0.35,
    transform: [{ rotate: '-15deg' }],
  },
  topDecorationRight: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 140,
    height: 180,
    opacity: 0.35,
  },
  decorativeLeaf: {
    width: '100%',
    height: '100%',
    borderBottomRightRadius: 60,
  },
  decorativeMonstera: {
    width: '100%',
    height: '100%',
    borderBottomLeftRadius: 60,
  },
  brandContainer: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 30,
  },
  brandLogo: {
    width: 96,
    height: 96,
    marginBottom: 12,
  },
  brandName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1C3A27',
    letterSpacing: 0.5,
  },
  taglineHeadline: {
    fontSize: 16,
    fontWeight: '600',
    color: '#718E7B',
    marginTop: 10,
    textAlign: 'center',
  },
  taglineSubline: {
    fontSize: 14,
    color: '#8CA696',
    marginTop: 4,
    textAlign: 'center',
  },
  bannerCard: {
    flexDirection: 'row',
    backgroundColor: '#EBF4EA',
    borderRadius: 24,
    padding: 20,
    width: '100%',
    height: 130,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'visible',
  },
  bannerTextContainer: {
    flex: 1,
    marginRight: 85,
  },
  welcomePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  pillIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  welcomePillText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#325c2cff',
  },
  bannerDescription: {
    fontSize: 13,
    color: '#5f7265ff',
    lineHeight: 18,
    fontWeight: '500',
  },
  bannerImage: {
    position: 'absolute',
    right: -6,
    bottom: -15,
    width: 140,
    height: 175,
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
    marginBottom: 40,
    zIndex: 2,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7DA676',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#7DA676',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  buttonIconBackground: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  uploadIconBg: {
    backgroundColor: '#EBF4EA',
  },
  buttonTextContainer: {
    flex: 1,
  },
  scanButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scanButtonSubtext: {
    fontSize: 11,
    color: '#E8F3E6',
    marginTop: 2,
  },
  arrowIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextIcon: {
    width: 14,
    height: 14,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2EBE0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C3A27',
  },
  uploadButtonSubtext: {
    fontSize: 11,
    color: '#718E7B',
    marginTop: 2,
  },
  buttonIconImage: {
    width: 24,
    height: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  footerIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  footerText: {
    fontSize: 11,
    color: '#718E7B',
    fontWeight: '600',
  },
  bottomDecorationLeft: {
    position: 'absolute',
    left: -20,
    bottom: -10,
    width: 90,
    height: 90,
    opacity: 0.25,
  },
  bottomDecorationRight: {
    position: 'absolute',
    right: -20,
    bottom: -15,
    width: 100,
    height: 100,
    opacity: 0.25,
  },
  decorativePlant: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
  },
  decorativePlantRight: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  syncContainer: {
    flex: 1,
    backgroundColor: '#F8FBF7',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  syncCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EBF2EA',
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  syncEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  syncTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 8,
    textAlign: 'center',
  },
  syncSubtitle: {
    fontSize: 12,
    color: '#718E7B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#EBF4EA',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4E8C44',
    borderRadius: 4,
  },
  syncPercent: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 6,
  },
  syncStatusText: {
    fontSize: 11,
    color: '#8CA696',
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  syncNotice: {
    fontSize: 10,
    color: '#C84C4C',
    fontWeight: '700',
    textAlign: 'center',
  },
});
