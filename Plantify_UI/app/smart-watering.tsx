import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from './_layout';
import { fetchCurrentWeather } from '@/services/weatherService';

export default function SmartWateringScreen() {
  const router = useRouter();
  const { plantName = 'Bedroom Snake Plant', scientificName = 'Dracaena trifasciata', imageUri: rawImageUri } = useLocalSearchParams<{
    plantName?: string;
    scientificName?: string;
    imageUri?: string;
  }>();

  const imageUri = rawImageUri ? decodeURIComponent(rawImageUri) : undefined;
  const { savedPlants, savePlant, saveReminder, reminders } = useUser();

  const [temp, setTemp] = useState(32);
  const [condition, setCondition] = useState('Partly Cloudy');
  const [humidity, setHumidity] = useState(70);
  const [loading, setLoading] = useState(true);

  // Animation states
  const [isWateringAnimating, setIsWateringAnimating] = useState(false);
  const tiltAnim = useRef(new Animated.Value(0)).current;
  const dropAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    async function loadWeather() {
      try {
        const weather = await fetchCurrentWeather();
        setTemp(weather.temp);
        setCondition(weather.condition);
        setHumidity(weather.humidity);
      } catch (err) {
        console.warn('Failed to load weather in Smart Watering screen:', err);
      } finally {
        setLoading(false);
      }
    }
    loadWeather();
  }, []);

  // Compute recommended water amount based on plant size/name
  const getRecommendedAmount = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('cactus') || lower.includes('succulent') || lower.includes('aloe')) {
      return '100 ml';
    }
    if (lower.includes('fern') || lower.includes('calathea') || lower.includes('monstera') || lower.includes('blossom')) {
      return '350 ml';
    }
    return '250 ml'; // Default amount
  };

  const handleMarkAsWatered = () => {
    // 1. Update the next watering date & last watered date in garden plants database
    const matchingPlant = savedPlants.find(p => p.name === plantName);
    if (matchingPlant) {
      const updated = {
        ...matchingPlant,
        nextWatering: 'In 3 days',
        lastWateredDate: Date.now(),
      };
      savePlant(updated);
    }

    // 2. Update reminder in user care scheduler
    const matchingReminder = reminders.find(r => r.plantName === plantName);
    if (matchingReminder) {
      const updatedReminder = {
        ...matchingReminder,
        lastWatered: Date.now(),
        snoozedUntil: undefined,
      };
      saveReminder(updatedReminder);
    }

    // 3. Trigger full-screen animated watering tool sequence
    setIsWateringAnimating(true);
    tiltAnim.setValue(0);
    dropAnim.setValue(0);
    scaleAnim.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(tiltAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(dropAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // 4. Automatically navigate back to notifications panel after ~1.8 seconds
    setTimeout(() => {
      router.back();
    }, 1800);
  };

  const handleSnooze = () => {
    // Snooze for 6 hours
    const snoozeTime = Date.now() + 6 * 60 * 60 * 1000;

    const matchingReminder = reminders.find(r => r.plantName === plantName);
    if (matchingReminder) {
      const updatedReminder = {
        ...matchingReminder,
        snoozedUntil: snoozeTime,
      };
      saveReminder(updatedReminder);
    }

    Alert.alert(
      'Reminder Snoozed ⏳',
      'You will be reminded again in 6 hours to water your plant.',
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1C3A27" />
        </TouchableOpacity>
        <View style={styles.titleWrapper}>
          <Text style={styles.headerTitle}>Smart Watering</Text>
          <Text style={styles.headerTitleSub}>Reminder</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#1C3A27" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Plant Header Card */}
        <View style={styles.plantHeaderCard}>
          <Image
            source={imageUri ? { uri: imageUri } : require('@/assets/images/leaf.png')}
            style={styles.plantImg}
            contentFit="cover"
          />
          <View style={styles.plantDetails}>
            <Text style={styles.plantName}>{plantName}</Text>
            <Text style={styles.plantBotanical}>{scientificName}</Text>
          </View>
        </View>

        {/* Current Condition Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Condition</Text>

          {/* Weather Row */}
          <View style={styles.conditionRow}>
            <View style={styles.conditionLeft}>
              <Ionicons name="cloudy-night" size={20} color="#4A90E2" style={{ marginRight: 10 }} />
              <Text style={styles.conditionLabel}>Weather Today</Text>
            </View>
            <Text style={styles.conditionValue}>
              {loading ? 'Loading...' : `${temp}°C, ${condition}`}
            </Text>
          </View>

          <View style={styles.divider} />

          {/* Humidity Row */}
          <View style={styles.conditionRow}>
            <View style={styles.conditionLeft}>
              <Ionicons name="water" size={20} color="#498EC5" style={{ marginRight: 10 }} />
              <Text style={styles.conditionLabel}>Humidity</Text>
            </View>
            <Text style={styles.conditionValue}>{loading ? 'Loading...' : `${humidity}%`}</Text>
          </View>

          <View style={styles.divider} />

          {/* Soil Moisture Row */}
          <View style={styles.conditionRow}>
            <View style={styles.conditionLeft}>
              <Ionicons name="checkmark-circle" size={20} color="#4E8C44" style={{ marginRight: 10 }} />
              <Text style={styles.conditionLabel}>Soil Moisture</Text>
            </View>
            <Text style={[styles.conditionValue, { color: '#B91C1C', fontWeight: '700' }]}>Dry</Text>
          </View>
        </View>

        {/* AI Recommendation Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>AI Recommendation</Text>
          
          <View style={styles.recBadgeRow}>
            <Ionicons name="water" size={24} color="#1E5322" />
            <Text style={styles.recStatusText}>Water Today</Text>
          </View>

          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Recommended Amount</Text>
            <Text style={styles.amountValue}>{getRecommendedAmount(plantName)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.waterButton}
          activeOpacity={0.85}
          onPress={handleMarkAsWatered}
        >
          <Text style={styles.waterButtonText}>Mark as Watered</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.snoozeButton}
          activeOpacity={0.8}
          onPress={handleSnooze}
        >
          <Text style={styles.snoozeButtonText}>Snooze Reminder</Text>
        </TouchableOpacity>
      </View>

      {/* FULL-PAGE ANIMATED WATERING TOOL CELEBRATION VIEW */}
      {isWateringAnimating && (
        <View style={styles.fullScreenAnimOverlay}>
          <StatusBar style="light" />
          
          <View style={styles.animCenterCard}>
            {/* Tilted Watering Can Tool */}
            <Animated.View
              style={[
                styles.wateringToolContainer,
                {
                  transform: [
                    {
                      rotate: tiltAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '-35deg'],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={{ fontSize: 72 }}>🚿</Text>
            </Animated.View>

            {/* Falling Water Droplets */}
            <Animated.View
              style={[
                styles.dropletsContainer,
                {
                  opacity: dropAnim,
                  transform: [
                    {
                      translateY: dropAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-15, 25],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={{ fontSize: 26 }}>💧 💧 💧</Text>
            </Animated.View>

            {/* Target Plant Photo */}
            <View style={styles.animPlantWrapper}>
              <Image
                source={imageUri ? { uri: imageUri } : require('@/assets/images/leaf.png')}
                style={styles.animPlantImg}
                contentFit="cover"
              />
              <View style={styles.waterSplashRing} />
            </View>

            {/* Success Confirmation Badge */}
            <Animated.View
              style={[
                styles.animSuccessBadge,
                {
                  transform: [{ scale: scaleAnim }],
                  opacity: scaleAnim,
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={44} color="#1E5322" />
              <Text style={styles.animSuccessTitle}>{plantName} Watered! 🌱</Text>
              <Text style={styles.animSuccessSub}>Soil moisture replenished — schedule updated</Text>
            </Animated.View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleWrapper: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
    textAlign: 'center',
  },
  headerTitleSub: {
    fontSize: 14,
    fontWeight: '700',
    color: '#718E7B',
    textAlign: 'center',
    marginTop: -2,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 160,
  },
  plantHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FBF7',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.2,
    borderColor: '#EBF2EA',
    marginBottom: 20,
  },
  plantImg: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginRight: 16,
    backgroundColor: '#E2EBE0',
  },
  plantDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  plantName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 4,
  },
  plantBotanical: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#718E7B',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#EBF2EA',
    padding: 20,
    marginBottom: 16,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 16,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  conditionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  conditionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4A5D50',
  },
  conditionValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C3A27',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F5EF',
  },
  recBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  recStatusText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E5322',
  },
  amountContainer: {
    backgroundColor: '#F3F8F2',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D0E0CE',
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#718E7B',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    gap: 12,
  },
  waterButton: {
    backgroundColor: '#1E5322',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E5322',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  waterButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  snoozeButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D0D7D1',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  snoozeButtonText: {
    color: '#4A5D50',
    fontSize: 16,
    fontWeight: '700',
  },
  // Full-Screen Animated Overlay Styles
  fullScreenAnimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 35, 22, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    paddingHorizontal: 24,
  },
  animCenterCard: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  wateringToolContainer: {
    marginBottom: 4,
  },
  dropletsContainer: {
    marginBottom: 8,
  },
  animPlantWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  animPlantImg: {
    width: 120,
    height: 120,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#4E8C44',
  },
  waterSplashRing: {
    position: 'absolute',
    bottom: -10,
    width: 140,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(78, 140, 68, 0.3)',
  },
  animSuccessBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '90%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  animSuccessTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
  },
  animSuccessSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#718E7B',
    textAlign: 'center',
  },
});
