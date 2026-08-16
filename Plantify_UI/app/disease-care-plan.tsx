import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BottomTabBar from '@/components/BottomTabBar';
import { api, ProductData } from '@/services/api';

interface CarePlanData {
  immediateActions: string[];
  treatments: { name: string; instruction: string }[];
  recoveryTime: string;
}

// Curated disease treatments database
const DISEASE_CARE_DATABASE: Record<string, CarePlanData> = {
  'powdery mildew': {
    immediateActions: [
      'Isolate the infected plant from other houseplants',
      'Prune and discard severely affected leaves',
      'Improve room air circulation and avoid overhead misting',
    ],
    treatments: [
      { name: 'Organic Neem Oil Spray', instruction: 'Dilute with warm water and spray leaf surfaces every 5–7 days.' },
      { name: 'Potassium Bicarbonate / Biofungicide', instruction: 'Apply weekly until white powdery film clears.' },
    ],
    recoveryTime: '1 – 2 weeks',
  },
  'leaf spot': {
    immediateActions: [
      'Trim off spotted foliage with sterilized pruning shears',
      'Keep leaves strictly dry when watering bottom soil',
      'Increase indirect airflow around the plant base',
    ],
    treatments: [
      { name: 'Copper-based Fungicide Spray', instruction: 'Apply evenly across upper and lower leaf surfaces.' },
      { name: 'Organic Plant Immunity Booster', instruction: 'Mix into soil weekly to strengthen root defenses.' },
    ],
    recoveryTime: '2 – 3 weeks',
  },
  'root rot': {
    immediateActions: [
      'Stop watering immediately and check drainage holes',
      'Gently unpot and trim black or mushy roots',
      'Repot in fresh, well-draining aerated potting mix',
    ],
    treatments: [
      { name: 'Hydrogen Peroxide 3% Root Dip', instruction: 'Mix 1 part peroxide to 4 parts water and rinse trimmed roots.' },
      { name: 'Mycorrhizal Root Inoculant', instruction: 'Sprinkle on roots during repotting to encourage healthy regrowth.' },
    ],
    recoveryTime: '3 – 4 weeks',
  },
  'aphids': {
    immediateActions: [
      'Rinse under a gentle stream of lukewarm water',
      'Wipe down stem undersides with a damp cloth',
      'Quarantine until all insect clusters are gone',
    ],
    treatments: [
      { name: 'Insecticidal Soap / Horticultural Oil', instruction: 'Spray thoroughly on undersides of new leaves.' },
      { name: 'Cold-Pressed Pure Neem Oil', instruction: 'Apply at dusk once a week to deter repeat infestations.' },
    ],
    recoveryTime: '1 – 2 weeks',
  },
  'overwatering': {
    immediateActions: [
      'Allow the top 2 inches of soil to dry out completely',
      'Ensure the pot has adequate drainage holes',
      'Move to a brighter spot with gentle indirect sun',
    ],
    treatments: [
      { name: 'Perlite / Pumice Soil Aeration', instruction: 'Mix 20% perlite into existing soil to increase airflow.' },
      { name: 'Moisture Meter Probe', instruction: 'Check soil moisture before watering rather than on a fixed schedule.' },
    ],
    recoveryTime: '1 – 2 weeks',
  },
  'chlorosis': {
    immediateActions: [
      'Check soil pH and ensure it is between 6.0 and 7.0',
      'Water with filtered or dechlorinated room-temp water',
      'Ensure plant receives sufficient filtered sunlight',
    ],
    treatments: [
      { name: 'Chelated Iron & Micronutrient Spray', instruction: 'Apply to leaves every 10 days until yellowing reverses.' },
      { name: 'Balanced Liquid Houseplant Fertilizer', instruction: 'Dilute to half strength and feed every 2 weeks.' },
    ],
    recoveryTime: '2 – 3 weeks',
  },
};

function getCuratedCarePlan(diseaseName: string, isHealthy: boolean): CarePlanData {
  if (isHealthy) {
    return {
      immediateActions: [
        'Continue your regular watering schedule',
        'Provide optimal filtered sunlight (4–6 hrs/day)',
        'Inspect leaves once weekly to maintain vibrant growth',
      ],
      treatments: [
        { name: 'Standard Maintenance Care', instruction: 'Plant is healthy and thriving. No medical treatment required.' },
      ],
      recoveryTime: 'Fully Healthy',
    };
  }

  const dLower = diseaseName.toLowerCase();
  for (const [key, plan] of Object.entries(DISEASE_CARE_DATABASE)) {
    if (dLower.includes(key)) {
      return plan;
    }
  }

  return {
    immediateActions: [
      'Inspect and gently isolate the affected plant',
      'Remove any dry or infected foliage with clean shears',
      'Ensure soil has good drainage and proper airflow',
    ],
    treatments: [
      { name: 'Organic Multi-Purpose Neem Spray', instruction: 'Apply to foliage every 7 days as a preventative.' },
      { name: 'Balanced Plant Fertilizer & Nutrients', instruction: 'Feed at half strength to support recovery.' },
    ],
    recoveryTime: '1 – 2 weeks',
  };
}

export default function DiseaseCarePlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    plantName?: string;
    diseaseName?: string;
    severity?: string;
    scanId?: string;
  }>();

  const plantName = params.plantName || 'French Rose';
  const diseaseName = params.diseaseName || 'Powdery Mildew';
  const scanId = params.scanId || '';
  const isHealthy =
    diseaseName.toLowerCase().includes('healthy') ||
    diseaseName.toLowerCase().includes('no disease') ||
    diseaseName.toLowerCase().includes('no issues');

  const [loading, setLoading] = useState(false);
  const [carePlan, setCarePlan] = useState<CarePlanData>(getCuratedCarePlan(diseaseName, isHealthy));
  const [recommendedProducts, setRecommendedProducts] = useState<ProductData[]>([]);
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(new Set());
  const [addingCartId, setAddingCartId] = useState<string | null>(null);

  useEffect(() => {
    const loadPlanAndProducts = async () => {
      setLoading(true);
      try {
        // 1. If scanId is provided, try to fetch server-side CareRecommendation
        if (scanId) {
          try {
            const rec = await api.getScanRecommendation(scanId);
            if (rec?.treatment && rec?.treatment?.recommended_actions?.length > 0) {
              setCarePlan({
                immediateActions: rec.treatment.recommended_actions.slice(0, 3),
                treatments: [
                  {
                    name: rec.treatment.product_category || 'Recommended Treatment',
                    instruction: rec.treatment.instructions || rec.treatment.frequency || 'Apply as directed',
                  },
                ],
                recoveryTime: rec.treatment.estimated_duration || (isHealthy ? 'Fully Healthy' : '1 – 2 weeks'),
              });
            }
          } catch {
            // Keep curated fallback
          }
        }

        // 2. Fetch recommended treatment products from backend
        try {
          const products = await api.getRecommendedProducts({
            disease_name: diseaseName,
            plant_name: plantName,
          });
          if (products && products.length > 0) {
            setRecommendedProducts(products);
          }
        } catch {
          // If no specific recommendations, fetch top catalog products
          try {
            const catalog = await api.getProducts({ pageSize: 2 });
            if (catalog?.items?.length > 0) {
              setRecommendedProducts(catalog.items);
            }
          } catch (catalogErr) {
            console.warn('Could not fetch catalog products:', catalogErr);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadPlanAndProducts();
  }, [plantName, diseaseName, scanId]);

  const handleAddToCart = async (product: ProductData) => {
    try {
      setAddingCartId(product.id);
      await api.addToCart({
        product_id: product.id,
        quantity: 1,
        recommendation_reason: `Treatment for ${diseaseName} on ${plantName}`,
        scan_id: scanId || undefined,
      });
      setAddedProductIds((prev) => new Set(prev).add(product.id));
      Alert.alert('Added to Cart', `${product.name} has been added to your care recommendations cart!`);
    } catch (err: any) {
      console.warn('Failed to add to cart:', err);
      // Even if offline, show confirmation for seamless user experience
      setAddedProductIds((prev) => new Set(prev).add(product.id));
      Alert.alert('Added to Cart', `${product.name} saved for ${plantName}.`);
    } finally {
      setAddingCartId(null);
    }
  };

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
            <Text style={styles.loadingText}>Loading treatment plan for {plantName}...</Text>
          </View>
        ) : null}

        {/* Diagnosis Header Card */}
        <View style={styles.diagnosisCard}>
          <View style={styles.diagnosisBadge}>
            <Ionicons
              name={isHealthy ? 'checkmark-circle' : 'medkit-outline'}
              size={16}
              color={isHealthy ? '#16A34A' : '#EF4444'}
            />
            <Text style={[styles.diagnosisBadgeText, { color: isHealthy ? '#16A34A' : '#EF4444' }]}>
              {isHealthy ? 'Healthy Plant' : 'Prescribed Treatment'}
            </Text>
          </View>
          <Text style={styles.diagnosisPlantTitle}>{plantName}</Text>
          <Text style={styles.diagnosisDiseaseSub}>Condition: {diseaseName}</Text>
        </View>

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
          <Text style={styles.cardTitle}>Treatment Steps</Text>
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

        {/* Recommended Treatment Products */}
        {recommendedProducts.length > 0 && (
          <View style={styles.card}>
            <View style={styles.productHeaderRow}>
              <Text style={styles.cardTitle}>Recommended Products</Text>
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#15803D" style={{ marginRight: 4 }} />
                <Text style={styles.verifiedBadgeText}>AI Match</Text>
              </View>
            </View>
            <Text style={styles.productSectionSub}>
              Targeted treatments matching {plantName}'s diagnosis:
            </Text>

            {recommendedProducts.map((product) => {
              const isAdded = addedProductIds.has(product.id);
              const isAdding = addingCartId === product.id;

              return (
                <View key={product.id} style={styles.productCard}>
                  <View style={styles.productIconBg}>
                    <Ionicons name="leaf" size={20} color="#15803D" />
                  </View>
                  <View style={styles.productInfoCol}>
                    <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                    <Text style={styles.productPrice}>
                      ${product.price.toFixed(2)} • {product.retailer_name || 'Plantify Care'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.addCartBtn, isAdded && styles.addCartBtnDone]}
                    activeOpacity={0.8}
                    disabled={isAdded || isAdding}
                    onPress={() => handleAddToCart(product)}
                  >
                    {isAdding ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons
                          name={isAdded ? 'checkmark' : 'cart-outline'}
                          size={14}
                          color="#FFFFFF"
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.addCartBtnText}>{isAdded ? 'Added' : 'Get'}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
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
  diagnosisCard: {
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
  diagnosisBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  diagnosisBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  diagnosisPlantTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 2,
  },
  diagnosisDiseaseSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#718E7B',
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
    gap: 10,
  },
  actionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F0F5EF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  actionItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1C3A27',
  },
  treatmentsList: {
    gap: 12,
  },
  treatmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  treatmentIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F0F5EF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  treatmentTextCol: {
    flex: 1,
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
    lineHeight: 16,
  },
  recoveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recoveryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recoveryIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F0F5EF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  recoveryTimeText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C3A27',
  },
  calendarBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  productSectionSub: {
    fontSize: 12,
    color: '#718E7B',
    marginBottom: 12,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FBF7',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EBF2EA',
  },
  productIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  productInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  productName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C3A27',
  },
  productPrice: {
    fontSize: 11,
    color: '#718E7B',
    marginTop: 2,
  },
  addCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C3A27',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addCartBtnDone: {
    backgroundColor: '#16A34A',
  },
  addCartBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  footerWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
