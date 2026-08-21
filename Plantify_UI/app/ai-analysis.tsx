import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from './_layout';

const { width } = Dimensions.get('window');

function isPlantMatching(plantInfo: any, targetName: string): boolean {
  if (!targetName || !targetName.trim()) return true;

  const targetLower = targetName.toLowerCase().trim();
  const commonNames: string[] = plantInfo?.commonNames || [];
  const scientificName = (plantInfo?.scientificName || '').toLowerCase();
  const familyName = (plantInfo?.family || '').toLowerCase();
  const genusName = (plantInfo?.genus || '').toLowerCase();
  const plantName = (plantInfo?.name || '').toLowerCase();

  const allIdentifiedText = [
    plantName,
    scientificName,
    familyName,
    genusName,
    ...commonNames.map((c: string) => c.toLowerCase()),
  ].join(' ');

  if (allIdentifiedText.includes(targetLower) || targetLower.includes(scientificName)) {
    return true;
  }

  const stopWords = new Set(['plant', 'tree', 'flower', 'bedroom', 'office', 'my', 'indoor', 'house', 'green']);
  const targetWords = targetLower
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (targetWords.length === 0) return true;

  const wordMatch = targetWords.some((word) => allIdentifiedText.includes(word));
  if (wordMatch) return true;

  const identifiedWords = [...commonNames, plantInfo?.name || '']
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w: string) => w.length > 2 && !stopWords.has(w));

  return identifiedWords.some((word: string) => targetLower.includes(word));
}

export default function AIAnalysisScreen() {
  const router = useRouter();
  const { addHealthScan } = useUser();
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const { imageUri, plantResult, isRescan, targetPlantName } = useLocalSearchParams<{
    imageUri?: string;
    plantResult?: string;
    isRescan?: string;
    targetPlantName?: string;
  }>();

  let plantData = null;

  try {
    plantData = plantResult
      ? JSON.parse(plantResult)
      : null;
  } catch (error) {
    console.error("Invalid plant identification response:", error);

    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            marginBottom: 12,
          }}
        >
          Oops! 🌿
        </Text>

        <Text
          style={{
            textAlign: "center",
            color: "#666",
            marginBottom: 25,
          }}
        >
          Something went wrong while reading the plant analysis.
        </Text>

        <TouchableOpacity
          style={{
            backgroundColor: "#4E8C44",
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 10,
          }}
          onPress={() => router.back()}
        >
          <Text
            style={{
              color: "#fff",
              fontWeight: "700",
            }}
          >
            Try Again
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }
  if (plantData?.message || plantData?.error) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center"
        }}
      >
        <Text>{plantData.message || plantData.error}</Text>
      </SafeAreaView>
    );
  }

  // Backend response format: { plant: { name, scientificName, confidence, ... }, alternatives: [...] }
  const plantInfo = plantData?.plant;

  if (!plantInfo) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            marginBottom: 12,
          }}
        >
          Plant Not Identified 🌱
        </Text>

        <Text
          style={{
            textAlign: "center",
            color: "#666",
            marginBottom: 25,
          }}
        >
          We couldn't identify this plant.
          Try taking a clearer photo in good lighting.
        </Text>

        <TouchableOpacity
          style={{
            backgroundColor: "#4E8C44",
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 10,
          }}
          onPress={() => router.back()}
        >
          <Text
            style={{
              color: "#fff",
              fontWeight: "700",
            }}
          >
            Scan Again
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const commonName = plantInfo.name ?? "Unknown";

  const scientificName = plantInfo.scientificName ?? "Unknown";

  const confidence =
    plantInfo.confidence != null
      ? (plantInfo.confidence * 100).toFixed(1)
      : "0";



  // State for step checklist
  const [step1, setStep1] = useState('active'); // active, done, pending
  const [step2, setStep2] = useState('pending');
  const [step3, setStep3] = useState('pending');
  const [step4, setStep4] = useState('pending');
  const [pct, setPct] = useState(12);

  // Animated values
  const scanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Scanline animation (Yoyo loop)
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        })
      ])
    ).start();

    // 2. Pulse animation for active dot
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  const hasStarted = useRef(false);

  // Simulate AI pipeline progression
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    // Phase 1: Detecting plant
    const t1 = setTimeout(() => {
      setStep1('done');
      setStep2('active');
      setPct(45);
    }, 600);

    // Phase 2: Matching species
    const t2 = setTimeout(() => {
      setStep2('done');
      setStep3('active');
      setPct(78);
    }, 1300);

    // Phase 3: Checking shape
    const t3 = setTimeout(() => {
      setStep3('done');
      setStep4('active');
      setPct(92);
    }, 1900);

    // Phase 4: Done & Navigate
    const t4 = setTimeout(() => {
      setStep4('done');
      setPct(100);
    }, 2400);

    const t5 = setTimeout(() => {
      if (isRescan === 'true') {
        const targetName = targetPlantName || commonName;
        const isMatch = isPlantMatching(plantInfo, targetName);

        if (!isMatch) {
          setShowMismatchModal(true);
          return;
        }

        const scoreVal = Math.max(80, Math.min(99, Math.round(parseFloat(confidence) || 94)));
        const aiCategoryRatings = {
          water: scoreVal >= 90 ? 5 : (scoreVal >= 80 ? 4 : 3),
          sunlight: scoreVal >= 88 ? 5 : (scoreVal >= 78 ? 4 : 3),
          humidity: scoreVal >= 85 ? 4 : (scoreVal >= 70 ? 3 : 2),
          growth: scoreVal >= 92 ? 5 : (scoreVal >= 82 ? 4 : 3),
          overall: Math.max(1, Math.min(5, Math.round(scoreVal / 20))),
        };
        addHealthScan(targetName, scoreVal, imageUri, aiCategoryRatings);

        router.replace({
          pathname: "/plant-details",
          params: {
            imageUri: imageUri ? encodeURIComponent(imageUri) : '',
            commonName: targetName,
            scientificName,
            confidence: String(scoreVal),
            healthScore: String(scoreVal),
            showHealthScoreDirectly: 'true',
            fromGarden: 'true',
            plantResult,
          },
        });
      } else {
        router.replace({
          pathname: "/plant-details",
          params: {
            imageUri: imageUri ? encodeURIComponent(imageUri) : '',
            commonName,
            scientificName,
            confidence,
            plantResult,
            fromFlow: "true",
          },
        });
      }
    }, 2700);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, []);

  // Translate translateY value for scanline
  const translateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200 - 4], // height of image wrapper minus line height
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Decorative Background */}
      <View style={styles.bgDecoContainer} pointerEvents="none">
        <View style={styles.bgGradientTop} />
        <View style={styles.bgGradientBottom} />
        <Image
          source={require('@/assets/images/leaf1.png')}
          style={styles.bgLeafTopRight}
          contentFit="contain"
        />
        <Image
          source={require('@/assets/images/leaf.png')}
          style={styles.bgLeafBottomLeft}
          contentFit="contain"
        />
        <Image
          source={require('@/assets/images/leaf1.png')}
          style={styles.bgLeafMidLeft}
          contentFit="contain"
        />
        <View style={styles.bgBlobTopLeft} />
        <View style={styles.bgBlobCenter} />
        <View style={styles.bgBlobBottomRight} />
        <View style={styles.bgDottedRing} />
      </View>

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
        <Text style={styles.headerTitle}>Identifying Your Plant</Text>
        <View style={styles.headerBtnPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Stepper Progress */}
        <View style={styles.stepperContainer}>
          <View style={styles.stepperRow}>
            <View style={[styles.stepItem, styles.stepItemActive]}>
              <View style={[styles.stepDot, styles.stepDotChecked]}>
                <Image
                  source={require('@/assets/images/upload.png')}
                  style={{ width: 14, height: 14 }}
                  tintColor="#FFFFFF"
                  contentFit="contain"
                />
              </View>
              <Text style={[styles.stepLabel, styles.stepLabelActive]}>Upload</Text>
            </View>
            <View style={[styles.stepConnector, styles.stepConnectorActive]} />
            <View style={[styles.stepItem, styles.stepItemActive]}>
              <View style={[styles.stepDot, styles.stepDotActive]}>
                <Image
                  source={require('@/assets/images/search.png')}
                  style={{ width: 14, height: 14 }}
                  tintColor="#FFFFFF"
                  contentFit="contain"
                />
              </View>
              <Text style={[styles.stepLabel, styles.stepLabelActive]}>Analyze</Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={styles.stepItem}>
              <View style={styles.stepDot}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#8CA696' }}>✓</Text>
              </View>
              <Text style={styles.stepLabel}>Results</Text>
            </View>
          </View>
        </View>

        {/* AI Scanning Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Our AI is analyzing your plant</Text>
          <Text style={styles.cardSub}>This usually takes 3-5 seconds.</Text>

          {/* Plant Scanner View */}
          <View style={styles.imageWrapper}>
            <Image
              source={imageUri ? { uri: imageUri } : "https://images.unsplash.com/photo-1596547609652-9cf5d8d76921?q=80&w=400&auto=format&fit=crop"}
              style={styles.plantPreview}
            />
            {/* Laser Scanline */}
            <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />

            {/* Analyzing % badge overlay */}
            <View style={styles.analyzingBadge}>
              {pct < 100 ? (
                <>
                  <Animated.View style={[styles.badgePulseDot, { opacity: pulseAnim }]} />
                  <Text style={styles.analyzingText}>{pct}% Analyzing...</Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#4E8C44', marginRight: 4 }}>✓</Text>
                  <Text style={styles.analyzingText}>Analysis Complete!</Text>
                </>
              )}
            </View>
          </View>

          {/* Checklist */}
          <View style={styles.checklist}>
            {/* Step 1 */}
            <View style={styles.checkRow}>
              <View style={styles.checkIconCell}>
                {step1 === 'done' ? (
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#4E8C44' }}>✓</Text>
                ) : step1 === 'active' ? (
                  <Animated.View style={[styles.activeDot, { opacity: pulseAnim }]} />
                ) : (
                  <View style={styles.pendingDot} />
                )}
              </View>
              <Text style={[styles.checkLabel, step1 === 'active' && styles.labelBold, step1 === 'done' && styles.labelDone]}>
                Detecting plant...
              </Text>
            </View>

            {/* Step 2 */}
            <View style={styles.checkRow}>
              <View style={styles.checkIconCell}>
                {step2 === 'done' ? (
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#4E8C44' }}>✓</Text>
                ) : step2 === 'active' ? (
                  <Animated.View style={[styles.activeDot, { opacity: pulseAnim }]} />
                ) : (
                  <View style={styles.pendingDot} />
                )}
              </View>
              <Text style={[styles.checkLabel, step2 === 'active' && styles.labelBold, step2 === 'done' && styles.labelDone]}>
                Matching with 100,000+ species...
              </Text>
            </View>

            {/* Step 3 */}
            <View style={styles.checkRow}>
              <View style={styles.checkIconCell}>
                {step3 === 'done' ? (
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#4E8C44' }}>✓</Text>
                ) : step3 === 'active' ? (
                  <Animated.View style={[styles.activeDot, { opacity: pulseAnim }]} />
                ) : (
                  <View style={styles.pendingDot} />
                )}
              </View>
              <Text style={[styles.checkLabel, step3 === 'active' && styles.labelBold, step3 === 'done' && styles.labelDone]}>
                Checking leaf shape, color & texture...
              </Text>
            </View>

            {/* Step 4 */}
            <View style={styles.checkRow}>
              <View style={styles.checkIconCell}>
                {step4 === 'done' ? (
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#4E8C44' }}>✓</Text>
                ) : step4 === 'active' ? (
                  <Animated.View style={[styles.activeDot, { opacity: pulseAnim }]} />
                ) : (
                  <View style={styles.pendingDot} />
                )}
              </View>
              <Text style={[styles.checkLabel, step4 === 'active' && styles.labelBold, step4 === 'done' && styles.labelDone]}>
                Almost done...
              </Text>
            </View>
          </View>
        </View>

        {/* Fact Card */}
        <View style={styles.factCard}>
          <View style={styles.factHeader}>
            <Image
              source={require('@/assets/images/photo-tip.png')}
              style={{ width: 22, height: 22 }}
              contentFit="contain"
            />
            <Text style={styles.factTitle}>Did you know?</Text>
          </View>
          <Text style={styles.factDescription}>
            Snake plants can remove certain indoor air pollutants and are one of the easiest houseplants to maintain.
          </Text>
        </View>

        {/* Footer info */}
        <View style={styles.footerInfo}>
          <Text style={styles.footerText}>
            Your photos are safe and only used for identification.
          </Text>
        </View>
      </ScrollView>

      {/* Mismatch Alert Modal */}
      <Modal
        visible={showMismatchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMismatchModal(false)}
      >
        <View style={styles.mismatchOverlay}>
          <View style={styles.mismatchCard}>
            <View style={styles.mismatchIconBg}>
              <Ionicons name="alert-circle" size={32} color="#D97706" />
            </View>

            <Text style={styles.mismatchTitle}>Plant Photo Mismatch ⚠️</Text>
            <Text style={styles.mismatchSub}>
              This photo does not appear to match your saved plant.
            </Text>

            <View style={styles.mismatchComparisonBox}>
              <View style={styles.mismatchRow}>
                <Text style={styles.mismatchLabel}>Target Plant:</Text>
                <Text style={styles.mismatchTargetText}>{targetPlantName || 'Saved Plant'}</Text>
              </View>
              <View style={styles.mismatchDivider} />
              <View style={styles.mismatchRow}>
                <Text style={styles.mismatchLabel}>Photo Identified:</Text>
                <Text style={styles.mismatchIdentifiedText}>{commonName} ({scientificName})</Text>
              </View>
            </View>

            <Text style={styles.mismatchNotice}>
              To update health timeline and score, please scan or upload a photo of your <Text style={{ fontWeight: '800' }}>{targetPlantName || 'saved plant'}</Text>.
            </Text>

            <View style={styles.mismatchBtnRow}>
              <TouchableOpacity
                style={styles.mismatchRetryBtn}
                activeOpacity={0.85}
                onPress={() => {
                  setShowMismatchModal(false);
                  router.replace({
                    pathname: '/upload-photo',
                    params: {
                      isRescan: 'true',
                      targetPlantName: targetPlantName || '',
                    },
                  });
                }}
              >
                <Ionicons name="camera-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.mismatchRetryText}>Try Rescan Again</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.mismatchCancelBtn}
                activeOpacity={0.7}
                onPress={() => {
                  setShowMismatchModal(false);
                  router.back();
                }}
              >
                <Text style={styles.mismatchCancelText}>Cancel & Go Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  bgDecoContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
  },
  bgGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
    backgroundColor: '#EDF5EB',
    opacity: 0.6,
    borderBottomLeftRadius: 80,
    borderBottomRightRadius: 80,
  },
  bgGradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: '#E8F0E6',
    opacity: 0.4,
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
  },
  bgLeafTopRight: {
    position: 'absolute',
    top: -10,
    right: -25,
    width: 220,
    height: 220,
    opacity: 0.08,
    transform: [{ rotate: '30deg' }],
    tintColor: '#3D7A35',
  },
  bgLeafBottomLeft: {
    position: 'absolute',
    bottom: 20,
    left: -35,
    width: 240,
    height: 240,
    opacity: 0.07,
    transform: [{ rotate: '-20deg' }],
    tintColor: '#3D7A35',
  },
  bgLeafMidLeft: {
    position: 'absolute',
    top: '40%' as any,
    left: -60,
    width: 160,
    height: 160,
    opacity: 0.05,
    transform: [{ rotate: '50deg' }],
    tintColor: '#5A9E50',
  },
  bgBlobTopLeft: {
    position: 'absolute',
    top: 60,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#4E8C44',
    opacity: 0.04,
  },
  bgBlobCenter: {
    position: 'absolute',
    top: '45%' as any,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#7DA676',
    opacity: 0.05,
  },
  bgBlobBottomRight: {
    position: 'absolute',
    bottom: 60,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#4E8C44',
    opacity: 0.04,
  },
  bgDottedRing: {
    position: 'absolute',
    top: 160,
    right: 30,
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#4E8C44',
    borderStyle: 'dashed' as any,
    opacity: 0.06,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBtnPlaceholder: {
    width: 40,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  stepperContainer: {
    marginVertical: 20,
    alignItems: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '90%',
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
  },
  stepItemActive: {
    transform: [{ scale: 1.05 }],
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2EBE0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: {
    backgroundColor: '#7DA676',
  },
  stepDotChecked: {
    backgroundColor: '#4E8C44',
  },
  stepLabel: {
    fontSize: 10,
    color: '#8CA696',
    fontWeight: '700',
    marginTop: 6,
  },
  stepLabelActive: {
    color: '#4E8C44',
  },
  stepConnector: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2EBE0',
    marginHorizontal: -12,
    marginTop: -16,
  },
  stepConnectorActive: {
    backgroundColor: '#4E8C44',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EBF2EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
  },
  cardSub: {
    fontSize: 12,
    color: '#718E7B',
    marginTop: 4,
  },
  imageWrapper: {
    width: 200,
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
    marginTop: 20,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2EBE0',
  },
  plantPreview: {
    width: '100%',
    height: '100%',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#52C41A',
    shadowColor: '#52C41A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  analyzingBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  badgePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#7DA676',
    marginRight: 6,
  },
  badgeCheckIcon: {
    marginRight: 4,
  },
  analyzingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1C3A27',
  },
  checklist: {
    width: '100%',
    marginTop: 24,
    gap: 12,
    paddingHorizontal: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkIconCell: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#7DA676',
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#E2EBE0',
  },
  checkLabel: {
    fontSize: 12,
    color: '#8CA696',
    marginLeft: 8,
    fontWeight: '500',
  },
  labelBold: {
    fontWeight: '700',
    color: '#1C3A27',
  },
  labelDone: {
    color: '#718E7B',
    textDecorationLine: 'none',
  },
  factCard: {
    backgroundColor: '#FFF9EB',
    borderWidth: 1,
    borderColor: '#FFEFE0',
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  factHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  factTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B25E00',
  },
  factDescription: {
    fontSize: 11,
    color: '#845014',
    lineHeight: 16,
    fontWeight: '500',
  },
  footerInfo: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    color: '#8CA696',
    fontWeight: '600',
  },
  mismatchOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  mismatchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  mismatchIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  mismatchTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
    textAlign: 'center',
  },
  mismatchSub: {
    fontSize: 12,
    color: '#718E7B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  mismatchComparisonBox: {
    backgroundColor: '#F8FBF7',
    borderRadius: 16,
    padding: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: '#EBF2EA',
    marginBottom: 14,
  },
  mismatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mismatchLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8CA696',
  },
  mismatchTargetText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E5322',
  },
  mismatchIdentifiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  mismatchDivider: {
    height: 1,
    backgroundColor: '#EBF2EA',
    marginVertical: 10,
  },
  mismatchNotice: {
    fontSize: 11,
    color: '#5A7F66',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 20,
  },
  mismatchBtnRow: {
    width: '100%',
    gap: 10,
  },
  mismatchRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E5322',
    paddingVertical: 14,
    borderRadius: 16,
  },
  mismatchRetryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  mismatchCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  mismatchCancelText: {
    color: '#8CA696',
    fontWeight: '700',
    fontSize: 13,
  },
});
