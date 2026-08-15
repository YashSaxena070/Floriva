import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BottomTabBar from '@/components/BottomTabBar';
import { api, HealthAnalysisApiResult } from '@/services/api';

interface DisplayResult {
  healthStatus: 'healthy' | 'warning' | 'diseased';
  issue: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high';
  symptoms: string[];
  possibleCauses: string[];
  lowConfidence: boolean;
}

export default function DiseaseDetectionResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    plantName?: string;
    scientificName?: string;
    imageUri?: string;
    healthScore?: string;
    scanId?: string;
    healthAnalysisData?: string;
  }>();

  const plantName = params.plantName || 'Unknown Plant';
  const scientificName = params.scientificName || '';
  const rawImageUri = params.imageUri ? decodeURIComponent(params.imageUri) : '';
  const scanId = params.scanId || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DisplayResult | null>(null);

  // Try to use pre-existing health analysis data from identification pipeline
  useEffect(() => {
    // Check if health analysis data was passed from the identification flow
    if (params.healthAnalysisData) {
      try {
        const parsed = JSON.parse(params.healthAnalysisData) as HealthAnalysisApiResult;
        setResult({
          healthStatus: parsed.healthStatus || 'warning',
          issue: parsed.issue || 'Unable to determine',
          confidence: parsed.confidence ?? 0,
          severity: parsed.severity || 'low',
          symptoms: parsed.symptoms || [],
          possibleCauses: parsed.possibleCauses || [],
          lowConfidence: parsed.lowConfidence ?? (parsed.confidence < 0.4),
        });
        return;
      } catch (e) {
        console.warn('Failed to parse passed health data, will call API:', e);
      }
    }

    // If no pre-existing data, call the backend health analysis API
    if (scanId) {
      runBackendHealthAnalysis();
    }
  }, []);

  const runBackendHealthAnalysis = async () => {
    if (!scanId) {
      setError('No scan data available. Please scan a plant first.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const healthResult = await api.analyzeHealth(scanId, {
        plantName,
        scientificName,
      });

      setResult({
        healthStatus: healthResult.healthStatus || 'warning',
        issue: healthResult.issue || 'Unable to determine',
        confidence: healthResult.confidence ?? 0,
        severity: healthResult.severity || 'low',
        symptoms: healthResult.symptoms || [],
        possibleCauses: healthResult.possibleCauses || [],
        lowConfidence: healthResult.lowConfidence ?? (healthResult.confidence < 0.4),
      });
    } catch (err: any) {
      console.warn('Health analysis API error:', err);
      const message = err?.message || err?.detail || 'Health analysis failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Status banner configuration
  const getStatusConfig = () => {
    if (!result) return { icon: 'help-circle' as const, color: '#718E7B', bg: '#F0F5EF', border: '#EBF2EA', title: 'Analyzing...' };
    switch (result.healthStatus) {
      case 'healthy':
        return { icon: 'checkmark-circle' as const, color: '#16A34A', bg: '#F0FDF4', border: '#DCFCE7', title: 'Healthy Plant' };
      case 'diseased':
        return { icon: 'warning' as const, color: '#EF4444', bg: '#FFF5F5', border: '#FEE2E2', title: 'Disease Detected' };
      case 'warning':
      default:
        return { icon: 'alert-circle' as const, color: '#D97706', bg: '#FFFBEB', border: '#FEF3C7', title: 'Needs Attention' };
    }
  };

  const getSeverityConfig = () => {
    if (!result) return { color: '#718E7B', label: '...' };
    switch (result.severity) {
      case 'high':
        return { color: '#EF4444', label: 'High' };
      case 'medium':
        return { color: '#D97706', label: 'Medium' };
      case 'low':
      default:
        return { color: '#16A34A', label: 'Low' };
    }
  };

  const statusConfig = getStatusConfig();
  const severityConfig = getSeverityConfig();
  const confidencePct = result ? Math.round(result.confidence * 100) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Top Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#1C3A27" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Health Analysis</Text>
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
            {scientificName ? (
              <Text style={styles.plantScanBotanical} numberOfLines={1}>{scientificName}</Text>
            ) : null}
            <View style={styles.scannedBadge}>
              <Ionicons name="scan-outline" size={12} color="#15803D" style={{ marginRight: 4 }} />
              <Text style={styles.scannedBadgeText}>AI Health Analysis</Text>
            </View>
          </View>
        </View>

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#65A30D" />
            <Text style={styles.loadingText}>Running AI Health Analysis on scanned photo...</Text>
          </View>
        )}

        {/* Error State */}
        {error && !loading && (
          <View style={styles.errorCard}>
            <View style={styles.errorRow}>
              <View style={styles.errorIconBg}>
                <Ionicons name="alert-circle" size={28} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.errorTitle}>Analysis Failed</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </View>
            {scanId ? (
              <TouchableOpacity
                style={styles.retryBtn}
                activeOpacity={0.85}
                onPress={runBackendHealthAnalysis}
              >
                <Ionicons name="refresh-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Results */}
        {result && !loading && (
          <>
            {/* Low Confidence Warning */}
            {result.lowConfidence && (
              <View style={styles.lowConfidenceWarning}>
                <Ionicons name="information-circle-outline" size={18} color="#92400E" style={{ marginRight: 8 }} />
                <Text style={styles.lowConfidenceText}>
                  Low confidence result. Please upload a clearer image for a more accurate diagnosis.
                </Text>
              </View>
            )}

            {/* Card 1: Health Status Banner */}
            <View style={[styles.bannerCard, { backgroundColor: statusConfig.bg, borderColor: statusConfig.border }]}>
              <View style={styles.bannerRow}>
                <View style={[styles.iconBg, { backgroundColor: statusConfig.border }]}>
                  <Ionicons name={statusConfig.icon} size={28} color={statusConfig.color} />
                </View>
                <View style={styles.bannerTextCol}>
                  <Text style={[styles.bannerStatusTitle, { color: statusConfig.color }]}>
                    {statusConfig.title}
                  </Text>
                  <Text style={styles.diseaseNameText} numberOfLines={2}>{result.issue}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.severityLabel}>
                      Severity: <Text style={{ color: severityConfig.color, fontWeight: '800' }}>{severityConfig.label}</Text>
                    </Text>
                    <Text style={styles.confidenceLabel}>
                      Confidence: <Text style={{ color: confidencePct >= 70 ? '#16A34A' : '#D97706', fontWeight: '800' }}>{confidencePct}%</Text>
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Card 2: Confidence Indicator */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Analysis Confidence</Text>
              <View style={styles.confidenceBarBg}>
                <View style={[styles.confidenceBarFill, {
                  width: `${confidencePct}%`,
                  backgroundColor: confidencePct >= 70 ? '#65A30D' : confidencePct >= 40 ? '#D97706' : '#EF4444',
                }]} />
              </View>
              <Text style={styles.confidenceNote}>
                {confidencePct >= 70
                  ? 'High confidence — this diagnosis is likely accurate.'
                  : confidencePct >= 40
                    ? 'Moderate confidence — consider uploading additional photos for verification.'
                    : 'Low confidence — unable to determine the issue confidently. Please upload a clearer image.'}
              </Text>
            </View>

            {/* Card 3: Symptoms */}
            {result.symptoms.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Observed Symptoms</Text>
                <View style={styles.tagList}>
                  {result.symptoms.map((symptom, idx) => (
                    <View key={idx} style={styles.symptomTag}>
                      <Ionicons name="ellipse" size={6} color="#D97706" style={{ marginRight: 6 }} />
                      <Text style={styles.symptomText}>{symptom}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Card 4: Possible Causes */}
            {result.possibleCauses.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Possible Causes</Text>
                <View style={styles.actionsList}>
                  {result.possibleCauses.map((cause, idx) => (
                    <View key={idx} style={styles.actionRow}>
                      <Ionicons name="help-circle-outline" size={20} color="#718E7B" style={{ marginRight: 10 }} />
                      <Text style={styles.actionText}>{cause}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Card 5: Note about AI analysis */}
            <View style={styles.noteCard}>
              <Ionicons name="information-circle-outline" size={16} color="#718E7B" style={{ marginRight: 8 }} />
              <Text style={styles.noteText}>
                This analysis is generated by AI and should not be treated as a confirmed diagnosis.
                Consult a plant expert for critical cases.
              </Text>
            </View>
          </>
        )}
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
                diseaseName: result?.issue || 'Unknown',
                severity: result?.severity || 'low',
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
  // ── Plant Context ────────────────────────────────────
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
  // ── Loading ──────────────────────────────────────────
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  loadingText: {
    fontSize: 13,
    color: '#15803D',
    fontWeight: '700',
    flex: 1,
  },
  // ── Error ────────────────────────────────────────────
  errorCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  errorIconBg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#EF4444',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: '#5F7265',
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // ── Low Confidence Warning ───────────────────────────
  lowConfidenceWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  lowConfidenceText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
    lineHeight: 17,
  },
  // ── Status Banner ────────────────────────────────────
  bannerCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.2,
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
    fontWeight: '700',
    color: '#1C3A27',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
  },
  severityLabel: {
    fontSize: 12,
    color: '#718E7B',
    fontWeight: '600',
  },
  confidenceLabel: {
    fontSize: 12,
    color: '#718E7B',
    fontWeight: '600',
  },
  // ── Cards ────────────────────────────────────────────
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
    marginBottom: 10,
  },
  // ── Confidence Bar ───────────────────────────────────
  confidenceBarBg: {
    height: 8,
    backgroundColor: '#F0F5EF',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  confidenceBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  confidenceNote: {
    fontSize: 12,
    color: '#5F7265',
    lineHeight: 17,
    fontWeight: '500',
  },
  // ── Symptoms Tags ────────────────────────────────────
  tagList: {
    gap: 8,
  },
  symptomTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  symptomText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
  },
  // ── Causes List ──────────────────────────────────────
  actionsList: {
    gap: 10,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C3A27',
    flex: 1,
    flexShrink: 1,
    lineHeight: 18,
  },
  // ── Note Card ────────────────────────────────────────
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F5EF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  noteText: {
    fontSize: 11,
    color: '#718E7B',
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
  // ── Footer ───────────────────────────────────────────
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
