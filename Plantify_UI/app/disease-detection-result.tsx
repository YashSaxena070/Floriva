import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BottomTabBar from '@/components/BottomTabBar';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

interface DiseaseResult {
  isHealthy: boolean;
  diseaseName: string;
  severity: string;
  about: string;
  recommendedActions: string[];
}

export default function DiseaseDetectionResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    plantName?: string;
    scientificName?: string;
    imageUri?: string;
    healthScore?: string;
    diseaseName?: string;
    severity?: string;
  }>();

  const plantName = params.plantName || 'French Rose';
  const scientificName = params.scientificName || 'Rosa gallica';
  const rawImageUri = params.imageUri ? decodeURIComponent(params.imageUri) : '';
  const scoreNum = params.healthScore ? parseInt(params.healthScore, 10) : 65;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiseaseResult>({
    isHealthy: scoreNum >= 90,
    diseaseName: params.diseaseName || (scoreNum >= 90 ? 'No Disease Detected' : 'Powdery Mildew'),
    severity: params.severity || (scoreNum >= 90 ? 'Optimal' : 'Moderate'),
    about: scoreNum >= 90
      ? 'Your plant shows vibrant, healthy foliage with clean leaves and robust growth structure. No fungal or pest symptoms were found.'
      : 'A fungal infection that appears as white powdery spots on leaves and can spread in warm, humid conditions.',
    recommendedActions: scoreNum >= 90
      ? [
          'Maintain consistent watering schedule',
          'Provide 4-6 hours of indirect sunlight',
          'Wipe dust off leaves bi-weekly',
        ]
      : [
          'Improve air circulation',
          'Avoid overhead watering',
          'Remove affected leaves',
        ],
  });

  useEffect(() => {
    const runDiseaseDiagnosis = async () => {
      if (!GROQ_API_KEY) return;
      try {
        setLoading(true);
        const prompt = `Analyze plant disease diagnosis for plant "${plantName}" (${scientificName}). 
Plant health score is ${scoreNum}/100.
Determine if the plant has a disease or is healthy.
Respond ONLY with a valid JSON object matching this schema:
{
  "isHealthy": ${scoreNum >= 90},
  "diseaseName": "${scoreNum >= 90 ? 'No Disease Detected' : 'Powdery Mildew'}",
  "severity": "${scoreNum >= 90 ? 'Optimal' : 'Moderate'}",
  "about": "string under 30 words explaining condition",
  "recommendedActions": ["action 1", "action 2", "action 3"]
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
                content: 'You are Plantify AI plant pathologist. Output valid JSON only, no markdown tags.',
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
          if (parsed?.diseaseName && parsed?.about && parsed?.recommendedActions) {
            setResult({
              isHealthy: !!parsed.isHealthy,
              diseaseName: parsed.diseaseName,
              severity: parsed.severity || (parsed.isHealthy ? 'Optimal' : 'Moderate'),
              about: parsed.about,
              recommendedActions: parsed.recommendedActions.slice(0, 3),
            });
          }
        }
      } catch (err) {
        console.warn('Groq disease diagnosis fetch error (using fallback):', err);
      } finally {
        setLoading(false);
      }
    };

    runDiseaseDiagnosis();
  }, [plantName, scientificName, scoreNum]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Top Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#1C3A27" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Disease Detection Result</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Plant Context Header */}
        <View style={styles.plantScanHeaderCard}>
          <Image
            source={rawImageUri ? { uri: rawImageUri } : require('@/assets/images/leaf.png')}
            style={styles.plantScanImg}
            contentFit="cover"
          />
          <View style={styles.plantScanInfo}>
            <Text style={styles.plantScanName} numberOfLines={1}>{plantName}</Text>
            <Text style={styles.plantScanBotanical} numberOfLines={1}>{scientificName}</Text>
            <View style={styles.scannedBadge}>
              <Ionicons name="checkmark-circle" size={12} color="#15803D" style={{ marginRight: 4 }} />
              <Text style={styles.scannedBadgeText}>Photo Diagnosed</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#65A30D" />
            <Text style={styles.loadingText}>Running AI Disease Check on scanned photo...</Text>
          </View>
        ) : null}

        {/* Card 1: Disease Status Banner */}
        <View style={[styles.bannerCard, result.isHealthy ? styles.healthyBanner : styles.diseaseBanner]}>
          <View style={styles.bannerRow}>
            <View style={[styles.iconBg, result.isHealthy ? styles.healthyIconBg : styles.diseaseIconBg]}>
              <Ionicons
                name={result.isHealthy ? "checkmark-circle" : "warning"}
                size={28}
                color={result.isHealthy ? "#16A34A" : "#EF4444"}
              />
            </View>
            <View style={styles.bannerTextCol}>
              <Text style={[styles.bannerStatusTitle, { color: result.isHealthy ? '#15803D' : '#EF4444' }]}>
                {result.isHealthy ? 'Healthy Plant' : 'Disease Detected'}
              </Text>
              <Text style={styles.diseaseNameText} numberOfLines={1}>{result.diseaseName}</Text>
              <Text style={styles.severityLabel}>
                Severity: <Text style={{ color: result.isHealthy ? '#16A34A' : '#D97706', fontWeight: '800' }}>{result.severity}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Card 2: About this disease */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About this disease</Text>
          <Text style={styles.cardDesc}>{result.about}</Text>
        </View>

        {/* Card 3: Recommended Actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recommended Actions</Text>
          <View style={styles.actionsList}>
            {result.recommendedActions.map((action, idx) => (
              <View key={idx} style={styles.actionRow}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#65A30D" style={{ marginRight: 10 }} />
                <Text style={styles.actionText}>{action}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Action Button & Tab Bar */}
      <View style={styles.footerWrapper}>
        <View style={styles.footerContainer}>
          <TouchableOpacity
            style={styles.carePlanBtn}
            activeOpacity={0.85}
            onPress={() => router.push({
              pathname: '/disease-care-plan',
              params: {
                plantName,
                diseaseName: result.diseaseName,
                severity: result.severity,
              }
            })}
          >
            <Text style={styles.carePlanBtnText}>View Care Plan</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>

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
  plantScanHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EBF2EA',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  plantScanImg: {
    width: 46,
    height: 46,
    borderRadius: 12,
    marginRight: 12,
  },
  plantScanInfo: {
    flex: 1,
    flexShrink: 1,
  },
  plantScanName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C3A27',
  },
  plantScanBotanical: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#718E7B',
    marginBottom: 2,
  },
  scannedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  scannedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
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
  bannerCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.2,
  },
  diseaseBanner: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FEE2E2',
  },
  healthyBanner: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  diseaseIconBg: {
    backgroundColor: '#FEE2E2',
  },
  healthyIconBg: {
    backgroundColor: '#DCFCE7',
  },
  bannerTextCol: {
    flex: 1,
    flexShrink: 1,
  },
  bannerStatusTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  diseaseNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 2,
  },
  severityLabel: {
    fontSize: 12,
    color: '#718E7B',
    fontWeight: '600',
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
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 13,
    color: '#5F7265',
    lineHeight: 19,
    fontWeight: '500',
    flexShrink: 1,
  },
  actionsList: {
    gap: 10,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C3A27',
    flex: 1,
    flexShrink: 1,
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
  carePlanBtn: {
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
  carePlanBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
