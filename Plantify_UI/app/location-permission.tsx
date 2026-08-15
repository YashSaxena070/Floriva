import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

export default function LocationPermissionScreen() {
  const router = useRouter();
  const { action } = useLocalSearchParams<{ action: string }>();

  const handleNext = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        console.log('Location permission granted');
      } else {
        console.log('Location permission denied');
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
    } finally {
      if (action === 'scan') {
        router.replace('/(tabs)');
      } else if (action === 'upload') {
        router.replace('/upload-photo');
      } else if (action === 'nearby') {
        router.replace('/nearby-plants');
      } else {
        router.replace('/(tabs)');
      }
    }
  };

  const handleSkip = () => {
    if (action === 'scan') {
      router.replace('/(tabs)');
    } else if (action === 'upload') {
      router.replace('/upload-photo');
    } else if (action === 'nearby') {
      router.replace('/nearby-plants');
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >


        {/* Central Graphic */}
        <View style={styles.illustrationContainer}>
          <Image
            source={require('@/assets/images/location-page.png')}
            style={styles.illustrationImageLarge}
            contentFit="cover"
            contentPosition="top"
          />
        </View>

        {/* Content */}
        <Text style={styles.title}>Help us identify plants{'\n'}near you</Text>
        <Text style={styles.description}>
          Allow location access so we can show you plants that grow in your region and give more accurate care tips.
        </Text>

        {/* Feature List */}
        <View style={styles.listContainer}>
          {/* Item 1 */}
          <View style={styles.listItem}>
            <View style={styles.listItemIconBg}>
              <Image source={require('@/assets/images/leaf.png')} style={styles.listItemIconImage} contentFit="contain" />
            </View>
            <View style={styles.listItemTextContainer}>
              <Text style={styles.listItemTitle}>Better Identification</Text>
              <Text style={styles.listItemSub}>We'll use your location to improve accuracy.</Text>
            </View>
          </View>

          {/* Item 2 */}
          <View style={styles.listItem}>
            <View style={styles.listItemIconBg}>
              <Image source={require('@/assets/images/map.png')} style={styles.listItemIconImage} contentFit="contain" />
            </View>
            <View style={styles.listItemTextContainer}>
              <Text style={styles.listItemTitle}>Local plant discovery</Text>
              <Text style={styles.listItemSub}>Explore plants that are native to your area.</Text>
            </View>
          </View>

          {/* Item 3 */}
          <View style={styles.listItem}>
            <View style={styles.listItemIconBg}>
              <Image source={require('@/assets/images/bell.png')} style={styles.listItemIconImage} contentFit="contain" />
            </View>
            <View style={styles.listItemTextContainer}>
              <Text style={styles.listItemTitle}>Smart care reminders</Text>
              <Text style={styles.listItemSub}>Get timely care tips based on your climate.</Text>
            </View>
          </View>
        </View>

        {/* Security Warning */}
        <View style={styles.lockContainer}>
          <Image source={require('@/assets/images/lock.png')} style={styles.lockIconImage} contentFit="contain" />
          <Text style={styles.lockText}>We never share your location with anyone.</Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.allowButton}
            activeOpacity={0.9}
            onPress={handleNext}
          >
            <Image source={require('@/assets/images/location.png')} style={styles.allowButtonIconImage} contentFit="contain" tintColor="#FFFFFF" />
            <Text style={styles.allowButtonText}>Allow Location Access</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.notNowButton}
            activeOpacity={0.7}
            onPress={handleSkip}
          >
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
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
    paddingTop: 0,
    paddingBottom: 40,
    alignItems: 'center',
  },

  topDecorationLeft: {
    position: 'absolute',
    left: -20,
    top: -20,
    width: 120,
    height: 150,
    opacity: 0.25,
    transform: [{ rotate: '-15deg' }],
  },
  topDecorationRight: {
    position: 'absolute',
    right: -20,
    top: -30,
    width: 140,
    height: 180,
    opacity: 0.25,
  },
  decorativeLeaf: {
    width: '100%',
    height: '100%',
  },
  decorativeMonstera: {
    width: '100%',
    height: '100%',
  },
  illustrationContainer: {
    marginTop: -60,
    marginBottom: 5,
    marginHorizontal: -24,
    width: width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationImageLarge: {
    width: '100%',
    height: 340,
  },
  illustrationImage: {
    width: 170,
    height: 170,
    borderRadius: 85,
    opacity: 0.85,
  },
  locationPinOverlay: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#7DA676',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  locationPinInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#4E8C44',
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingIcon: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  floatIcon1: {
    top: 20,
    left: -10,
  },
  floatIcon2: {
    bottom: 20,
    right: -10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C3A27',
    textAlign: 'center',
    lineHeight: 30,
    marginTop: 10,
  },
  description: {
    fontSize: 13,
    color: '#718E7B',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  listContainer: {
    width: '100%',
    marginVertical: 24,
    gap: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F0F5EF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  listItemIconBg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EBF4EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  listItemIconImage: {
    width: 22,
    height: 22,
  },
  listItemTextContainer: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C3A27',
  },
  listItemSub: {
    fontSize: 11,
    color: '#718E7B',
    marginTop: 2,
  },
  lockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  lockIconImage: {
    width: 14,
    height: 14,
    marginRight: 4,
  },
  lockText: {
    fontSize: 11,
    color: '#718E7B',
    fontWeight: '500',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  allowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7DA676',
    borderRadius: 18,
    paddingVertical: 16,
    width: '100%',
    shadowColor: '#7DA676',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  allowButtonIconImage: {
    width: 18,
    height: 18,
    marginRight: 8,
  },
  allowButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  notNowButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  notNowText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#718E7B',
  },
});
