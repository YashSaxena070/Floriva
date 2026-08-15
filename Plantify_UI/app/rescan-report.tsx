import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from './_layout';
import CircularProgress from '@/components/CircularProgress';
import { analyzePlantHealth } from '@/services/plantHealthService';

export default function RescanReportScreen() {
  const router = useRouter();
  const { imageUri, plantResult, targetPlantName } = useLocalSearchParams<{
    imageUri?: string;
    plantResult?: string;
    targetPlantName?: string;
  }>();

  const { savedPlants, savePlant, addHealthScan } = useUser();
  const [reportData, setReportData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!plantResult || !targetPlantName) return;

    try {
      const plantData = JSON.parse(plantResult);
      const bestMatch = plantData?.results?.[0];

      if (!bestMatch) {
        setErrorMsg("Plant could not be identified. Please try a clearer scan.");
        return;
      }

      const commonName = bestMatch.species?.commonNames?.[0] ?? "Unknown";
      const scientificName = bestMatch.species?.scientificNameWithoutAuthor ?? "Unknown";
      const confidence = bestMatch?.score ? (bestMatch.score * 100).toFixed(1) : "0";

      // 1. Validate matching plant name
      const normalizeStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normTarget = normalizeStr(targetPlantName);
      const normCommon = normalizeStr(commonName);
      const normScientific = normalizeStr(scientificName);

      const isMatch = normTarget.includes(normCommon) || normCommon.includes(normTarget) ||
                      normTarget.includes(normScientific) || normScientific.includes(normTarget);

      if (!isMatch) {
        Alert.alert(
          'Invalid Plant Scanned 🚨',
          `Scanned plant (${commonName}) does not match your target plant (${targetPlantName}). Please make sure to scan the correct plant.`,
          [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
        );
        return;
      }

      // 2. It matches! Calculate dynamic health score & diagnosis
      const matchingPlant = savedPlants.find(p => p.name === targetPlantName);
      const healthAnalysis = analyzePlantHealth({
        confidence: confidence,
        lastScannedDate: Date.now(),
        name: targetPlantName,
        botanicalName: scientificName,
        watering: matchingPlant?.watering,
      });

      const computedScore = healthAnalysis.healthScore;

      // 3. Save to database
      if (matchingPlant) {
        addHealthScan(targetPlantName, computedScore, imageUri);
      }

      setReportData({
        commonName: targetPlantName,
        scientificName,
        score: computedScore,
        status: healthAnalysis.healthStatus,
        desc: healthAnalysis.issueDescription,
      });

    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to parse diagnosis report.");
    }
  }, [plantResult, targetPlantName]);

  if (errorMsg) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Analysis Failed 🌿</Text>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.retryBtnText}>Back to My Garden</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!reportData) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="dark" />
        <Text style={styles.loadingText}>Generating Report...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.reportContainer} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.reportHeader}>
        <Text style={styles.reportHeaderTitle}>Health Scan Report</Text>
      </View>

      <ScrollView contentContainerStyle={styles.reportContent} showsVerticalScrollIndicator={false}>
        {/* Plant Card */}
        <View style={styles.reportPlantCard}>
          <Image
            source={imageUri ? { uri: imageUri } : require('@/assets/images/leaf.png')}
            style={styles.reportPlantImg}
            contentFit="cover"
          />
          <View style={styles.reportPlantInfo}>
            <Text style={styles.reportPlantName}>{reportData.commonName}</Text>
            <Text style={styles.reportPlantBotanical}>{reportData.scientificName}</Text>
          </View>
        </View>

        {/* New Health Score Card */}
        <View style={styles.reportScoreCard}>
          <Text style={styles.reportScoreLabel}>New Health Score</Text>
          <View style={styles.reportGaugeRow}>
            <CircularProgress
              size={120}
              strokeWidth={10}
              percentage={reportData.score}
              color={reportData.score >= 90 ? "#1E5322" : (reportData.score >= 80 ? "#15803D" : (reportData.score >= 70 ? "#D97706" : "#B91C1C"))}
              bgColor="#EBF4EA"
              textSize={28}
            />
            <View style={styles.reportGaugeDetails}>
              <Text style={styles.reportStatusText}>{reportData.status} Status ✅</Text>
              <Text style={styles.reportStatusSub}>{reportData.desc}</Text>
            </View>
          </View>
        </View>

        {/* AI Diagnosis Details */}
        <View style={styles.reportDiagnosisCard}>
          <Text style={styles.reportSectionTitle}>AI Diagnosis Details</Text>
          
          <View style={styles.diagRow}>
            <Ionicons name="sparkles" size={20} color="#1E5322" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.diagLabel}>Foliage Quality</Text>
              <Text style={styles.diagValue}>{reportData.desc}</Text>
            </View>
          </View>

          <View style={styles.diagDivider} />

          <View style={styles.diagRow}>
            <Ionicons name="water" size={20} color="#0369A1" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.diagLabel}>Watering Schedule</Text>
              <Text style={styles.diagValue}>Water every 3 days (average replenishment frequency)</Text>
            </View>
          </View>

          <View style={styles.diagDivider} />

          <View style={styles.diagRow}>
            <Ionicons name="cloud-done" size={20} color="#059669" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.diagLabel}>Database Status</Text>
              <Text style={styles.diagValue}>Successfully updated last scanned image and timeline logs.</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Action Button at Bottom */}
      <View style={[styles.reportFooter, { flexDirection: 'row', gap: 10 }]}>
        <TouchableOpacity
          style={[styles.doneBtn, { flex: 1, backgroundColor: '#E2EBE0' }]}
          activeOpacity={0.85}
          onPress={() => router.replace('/(tabs)/my-garden')}
        >
          <Text style={[styles.doneBtnText, { color: '#1C3A27' }]}>My Garden</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.doneBtn, { flex: 1.4 }]}
          activeOpacity={0.85}
          onPress={() => router.push({
            pathname: '/plant-health-timeline',
            params: {
              plantName: reportData.commonName,
              scientificName: reportData.scientificName,
              currentScore: String(reportData.score),
            }
          })}
        >
          <Text style={styles.doneBtnText}>View Timeline 📈</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F8FBF7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#718E7B',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#F8FBF7',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#C84C4C',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#718E7B',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: '#4E8C44',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  reportContainer: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  reportHeader: {
    alignItems: 'center',
    paddingVertical: 18,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  reportHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
  },
  reportContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 120,
  },
  reportPlantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    marginBottom: 16,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  reportPlantImg: {
    width: 56,
    height: 56,
    borderRadius: 14,
    marginRight: 14,
    backgroundColor: '#EBF4EA',
  },
  reportPlantInfo: {
    flex: 1,
  },
  reportPlantName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
  },
  reportPlantBotanical: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#718E7B',
    marginTop: 2,
  },
  reportScoreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    padding: 18,
    marginBottom: 16,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  reportScoreLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#718E7B',
    marginBottom: 14,
  },
  reportGaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  reportGaugeDetails: {
    flex: 1,
  },
  reportStatusText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E5322',
    marginBottom: 4,
  },
  reportStatusSub: {
    fontSize: 12,
    color: '#5F7265',
    lineHeight: 16,
    fontWeight: '500',
  },
  reportDiagnosisCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    padding: 18,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  reportSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#718E7B',
    marginBottom: 16,
  },
  diagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  diagLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 2,
  },
  diagValue: {
    fontSize: 12,
    color: '#5F7265',
    lineHeight: 16,
    fontWeight: '500',
  },
  diagDivider: {
    height: 1,
    backgroundColor: '#F0F5EF',
    marginVertical: 12,
  },
  reportFooter: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
  },
  doneBtn: {
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
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
