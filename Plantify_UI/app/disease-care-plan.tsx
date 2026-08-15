import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BottomTabBar from '@/components/BottomTabBar';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

interface CarePlanData {
  immediateActions: string[];
  treatments: { name: string; instruction: string }[];
  recoveryTime: string;
}

export default function DiseaseCarePlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    plantName?: string;
    diseaseName?: string;
    severity?: string;
  }>();

  const plantName = params.plantName || 'French Rose';
  const diseaseName = params.diseaseName || 'Powdery Mildew';
  const isHealthy = diseaseName.toLowerCase().includes('healthy') || diseaseName.toLowerCase().includes('no disease');

  const [loading, setLoading] = useState(false);
  const [carePlan, setCarePlan] = useState<CarePlanData>({
    immediateActions: isHealthy
      ? ['Continue regular watering', 'Ensure 4-6 hrs sunlight', 'Inspect leaves weekly']
      : ['Remove infected leaves', 'Isolate the plant', 'Keep in a well-ventilated area'],
    treatments: isHealthy
      ? [{ name: 'No Treatment Required', instruction: 'Plant is healthy. Continue regular care.' }]
      : [
          { name: 'Neem oil spray', instruction: 'Apply every 7 days' },
          { name: 'Copper fungicide (optional)', instruction: 'Use as per instructions' },
        ],
    recoveryTime: isHealthy ? 'Fully Healthy' : '1 – 2 weeks',
  });

  useEffect(() => {
    const fetchAiCarePlan = async () => {
      if (!GROQ_API_KEY) return;
      try {
        setLoading(true);
        const prompt = `Generate a concise disease care plan for plant "${plantName}" with diagnosis status "${diseaseName}". 
Respond ONLY with a valid JSON object:
{
  "immediateActions": ["action 1", "action 2", "action 3"],
  "treatments": [
    {"name": "Treatment name", "instruction": "Brief instruction"}
  ],
  "recoveryTime": "${isHealthy ? 'Fully Healthy' : '1 – 2 weeks'}"
}`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content: 'You are Plantify AI plant expert. Output valid JSON only, no markdown tags.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.2,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          let rawText = data?.choices?.[0]?.message?.content?.trim() || '';
          rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(rawText);
          if (parsed?.immediateActions && parsed?.treatments && parsed?.recoveryTime) {
            setCarePlan({
              immediateActions: parsed.immediateActions.slice(0, 3),
              treatments: parsed.treatments.slice(0, 2),
              recoveryTime: parsed.recoveryTime,
            });
          }
        }
      } catch (err) {
        console.warn('Groq AI care plan fetch error (using fallback):', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAiCarePlan();
  }, [plantName, diseaseName, isHealthy]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Top Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#1C3A27" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Disease Care Plan</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#65A30D" />
            <Text style={styles.loadingText}>Generating AI Care Plan for {plantName}...</Text>
          </View>
        ) : null}

        {/* Card 1: Immediate Actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Immediate Actions</Text>
          <View style={styles.actionsList}>
            {carePlan.immediateActions.map((action, idx) => {
              const icons: ("shield-checkmark-outline" | "notifications-outline" | "leaf-outline")[] = [
                'shield-checkmark-outline',
                'notifications-outline',
                'leaf-outline',
              ];
              return (
                <View key={idx} style={styles.actionItemRow}>
                  <View style={styles.actionIconBg}>
                    <Ionicons name={icons[idx % 3]} size={16} color="#65A30D" />
                  </View>
                  <Text style={styles.actionItemText}>{action}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Card 2: Treatment */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Treatment</Text>
          <View style={styles.treatmentsList}>
            {carePlan.treatments.map((treatment, idx) => {
              const icons: ("fitness-outline" | "flask-outline")[] = ['fitness-outline', 'flask-outline'];
              return (
                <View key={idx} style={styles.treatmentRow}>
                  <View style={styles.treatmentIconBg}>
                    <Ionicons name={icons[idx % 2]} size={18} color="#65A30D" />
                  </View>
                  <View style={styles.treatmentTextCol}>
                    <Text style={styles.treatmentName} numberOfLines={1}>{treatment.name}</Text>
                    <Text style={styles.treatmentInstruction}>{treatment.instruction}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Card 3: Recovery Time */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recovery Time</Text>
          <View style={styles.recoveryRow}>
            <View style={styles.recoveryLeft}>
              <View style={styles.recoveryIconBg}>
                <Ionicons name="time-outline" size={18} color="#65A30D" />
              </View>
              <Text style={styles.recoveryTimeText}>{carePlan.recoveryTime}</Text>
            </View>

            <View style={styles.calendarBadge}>
              <Ionicons name="calendar-outline" size={22} color="#65A30D" />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Tab Bar */}
      <View style={styles.footerWrapper}>
        <BottomTabBar />
      </View>
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F5EF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 150,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EBF2EA',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 12,
  },
  actionsList: {
    gap: 12,
  },
  actionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  actionItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C3A27',
    flex: 1,
    flexShrink: 1,
  },
  treatmentsList: {
    gap: 12,
  },
  treatmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  treatmentIconBg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  treatmentTextCol: {
    flex: 1,
    flexShrink: 1,
  },
  treatmentName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 2,
  },
  treatmentInstruction: {
    fontSize: 12,
    color: '#718E7B',
    fontWeight: '500',
    flexShrink: 1,
  },
  recoveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recoveryLeft: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  recoveryIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  recoveryTimeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C3A27',
    flex: 1,
    flexShrink: 1,
  },
  calendarBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1.2,
    borderColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
  },
  footerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F5EF',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  monitorBtn: {
    backgroundColor: '#65A30D',
    borderRadius: 16,
    height: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#65A30D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  monitorBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
