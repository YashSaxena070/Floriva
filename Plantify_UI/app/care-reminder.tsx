import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Animated, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from './_layout';

const FREQ_TO_SECONDS: Record<string, number> = {
  daily: 60 * 60 * 24,
  weekly: 60 * 60 * 24 * 7,
  every_2_weeks: 60 * 60 * 24 * 14,
  monthly: 60 * 60 * 24 * 30,
  every_2_months: 60 * 60 * 24 * 60,
};

const TIME_HOUR: Record<string, number> = {
  morning: 9,
  noon: 12,
  evening: 18,
};

export default function CareReminderScreen() {
  const router = useRouter();
  const { plantName = 'Snake Plant' } = useLocalSearchParams<{ plantName?: string }>();
  const { saveReminder } = useUser();

  // Dynamic recommendation logic based on plant name
  const getRecommendations = (name: string) => {
    const low = ['snake', 'cactus', 'succulent', 'aloe', 'agave', 'echeveria', 'jade', 'zz plant'];
    const high = ['fern', 'mint', 'basil', 'peace lily', 'pothos', 'spathiphyllum', 'fittonia', 'calathea'];
    const lowerName = name.toLowerCase();

    if (low.some(keyword => lowerName.includes(keyword))) {
      return {
        wateringFreq: 'every_2_weeks',
        fertilizerFreq: 'every_2_months'
      };
    } else if (high.some(keyword => lowerName.includes(keyword))) {
      return {
        wateringFreq: 'weekly',
        fertilizerFreq: 'monthly'
      };
    }
    // Default recommendations
    return {
      wateringFreq: 'weekly',
      fertilizerFreq: 'every_2_months'
    };
  };

  const recs = getRecommendations(plantName);

  // State hooks prefilled with RECOMMENDED options based on plant
  const [wateringFreq, setWateringFreq] = useState(recs.wateringFreq);
  const [wateringTime, setWateringTime] = useState('morning');
  const [fertilizerFreq, setFertilizerFreq] = useState(recs.fertilizerFreq);
  const [enableNotifications, setEnableNotifications] = useState(true);

  const [savedSuccess, setSavedSuccess] = useState(false);
  const successAnim = useState(new Animated.Value(0))[0];

  const handleSave = () => {
    // Save to context + AsyncStorage
    saveReminder({
      plantName,
      wateringFreq,
      wateringTime,
      fertilizerFreq,
      enableNotifications,
    });

    // Show premium animation on success
    setSavedSuccess(true);
    Animated.spring(successAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => {
        router.back();
      }, 1500);
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Image
            source={require('@/assets/images/next.png')}
            style={{ width: 20, height: 20, transform: [{ rotate: '180deg' }] }}
            tintColor="#1C3A27"
            contentFit="contain"
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Set Care Reminder</Text>
        <View style={styles.headerBtnPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Plant Badge */}
        <View style={styles.plantBadge}>
          <Text style={styles.plantEmoji}>🌿</Text>
          <View>
            <Text style={styles.plantName}>{plantName}</Text>
            <Text style={styles.plantStatus}>Recommended Care pre-filled</Text>
          </View>
        </View>

        {/* SECTION 1: Watering Frequency */}
        <Text style={styles.sectionTitle}>Watering Frequency</Text>
        <View style={styles.optionContainer}>
          {[
            { id: 'daily', label: 'Every Day', desc: recs.wateringFreq === 'daily' ? 'Recommended for this plant' : 'For moisture-loving plants', isRecommended: recs.wateringFreq === 'daily' },
            { id: 'weekly', label: 'Every Week', desc: recs.wateringFreq === 'weekly' ? 'Recommended for this plant' : 'For moderate water needs', isRecommended: recs.wateringFreq === 'weekly' },
            { id: 'every_2_weeks', label: 'Every 2 Weeks', desc: recs.wateringFreq === 'every_2_weeks' ? 'Recommended for this plant' : 'For drought-tolerant plants', isRecommended: recs.wateringFreq === 'every_2_weeks' },
            { id: 'monthly', label: 'Every Month', desc: recs.wateringFreq === 'monthly' ? 'Recommended for this plant' : 'For desert plants / cacti', isRecommended: recs.wateringFreq === 'monthly' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.optionCard,
                wateringFreq === opt.id && styles.optionCardSelected,
                opt.isRecommended && styles.optionCardRecommended
              ]}
              onPress={() => setWateringFreq(opt.id)}
            >
              <View style={styles.optionInfo}>
                <Text style={styles.optionLabel}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </View>
              <View style={[styles.radioOuter, wateringFreq === opt.id && styles.radioOuterSelected]}>
                {wateringFreq === opt.id && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* SECTION 2: Watering Time */}
        <Text style={styles.sectionTitle}>Watering Time</Text>
        <View style={styles.optionContainer}>
          {[
            { id: 'morning', label: 'Morning (9:00 AM)', desc: 'Recommended', isRecommended: true },
            { id: 'noon', label: 'Noon (12:00 PM)', desc: 'Avoid for outdoor plants' },
            { id: 'evening', label: 'Evening (6:00 PM)', desc: 'Keeps soil moist overnight' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.optionCard,
                wateringTime === opt.id && styles.optionCardSelected,
                opt.isRecommended && styles.optionCardRecommended
              ]}
              onPress={() => setWateringTime(opt.id)}
            >
              <View style={styles.optionInfo}>
                <Text style={styles.optionLabel}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </View>
              <View style={[styles.radioOuter, wateringTime === opt.id && styles.radioOuterSelected]}>
                {wateringTime === opt.id && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* SECTION 3: Fertilizer Frequency */}
        <Text style={styles.sectionTitle}>Fertilizer Frequency</Text>
        <View style={styles.optionContainer}>
          {[
            { id: 'monthly', label: 'Every Month', desc: recs.fertilizerFreq === 'monthly' ? 'Recommended for this plant' : 'For active growth cycles', isRecommended: recs.fertilizerFreq === 'monthly' },
            { id: 'every_2_months', label: 'Every 2 Months', desc: recs.fertilizerFreq === 'every_2_months' ? 'Recommended for this plant' : 'Standard feeding frequency', isRecommended: recs.fertilizerFreq === 'every_2_months' },
            { id: 'none', label: 'No Fertilizer', desc: recs.fertilizerFreq === 'none' ? 'Recommended for this plant' : 'Natural organic growth', isRecommended: recs.fertilizerFreq === 'none' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.optionCard,
                fertilizerFreq === opt.id && styles.optionCardSelected,
                opt.isRecommended && styles.optionCardRecommended
              ]}
              onPress={() => setFertilizerFreq(opt.id)}
            >
              <View style={styles.optionInfo}>
                <Text style={styles.optionLabel}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </View>
              <View style={[styles.radioOuter, fertilizerFreq === opt.id && styles.radioOuterSelected]}>
                {fertilizerFreq === opt.id && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Notifications Toggle */}
        <View style={styles.switchRow}>
          <View style={styles.switchTextContainer}>
            <Text style={styles.switchTitle}>Enable Reminders</Text>
            <Text style={styles.switchDesc}>Get notifications when tasks are due</Text>
          </View>
          <Switch
            value={enableNotifications}
            onValueChange={setEnableNotifications}
            trackColor={{ false: '#D1E0D1', true: '#4E8C44' }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity style={styles.saveBtn} activeOpacity={0.9} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Reminder Settings</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Success Animation Dialog */}
      {savedSuccess && (
        <Animated.View style={[styles.successOverlay, { opacity: successAnim }]}>
          <Animated.View style={[
            styles.successCard,
            { transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }
          ]}>
            <Text style={styles.successEmoji}>⏰</Text>
            <Text style={styles.successTitle}>Reminder Saved!</Text>
            <Text style={styles.successSub}>
              We'll notify you {wateringFreq === 'every_2_weeks' ? 'every 2 weeks' : 'regularly'} in the morning.
            </Text>
          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  headerBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C3A27',
  },
  headerBtnPlaceholder: {
    width: 36,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  plantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF4EA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#D4E6FA',
    gap: 16,
  },
  plantEmoji: {
    fontSize: 32,
  },
  plantName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C3A27',
  },
  plantStatus: {
    fontSize: 12,
    color: '#4E8C44',
    fontWeight: '600',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#718E7B',
    marginBottom: 12,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0F5EF',
    marginBottom: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  optionCardSelected: {
    backgroundColor: '#F3FAF2',
  },
  optionCardRecommended: {
    borderLeftWidth: 4,
    borderLeftColor: '#4E8C44',
  },
  optionInfo: {
    flex: 1,
    paddingRight: 12,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C3A27',
  },
  optionDesc: {
    fontSize: 11,
    color: '#8CA696',
    marginTop: 3,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#C8D9CD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: '#4E8C44',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4E8C44',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0F5EF',
    marginBottom: 30,
  },
  switchTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C3A27',
  },
  switchDesc: {
    fontSize: 11,
    color: '#8CA696',
    marginTop: 3,
  },
  saveBtn: {
    backgroundColor: '#4E8C44',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 58, 39, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successCard: {
    width: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  successEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 8,
  },
  successSub: {
    fontSize: 13,
    color: '#718E7B',
    textAlign: 'center',
    lineHeight: 18,
  },
});
