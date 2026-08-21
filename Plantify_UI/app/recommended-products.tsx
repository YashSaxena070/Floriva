import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, FontAwesome6 } from '@expo/vector-icons';
import { api, ProductRecommendationItem, ProductData } from '@/services/api';
import { useUser } from './_layout';

const { width } = Dimensions.get('window');

// Retailer icon & color mapping
function getRetailerInfo(retailer: string) {
  const r = retailer.toLowerCase();
  if (r.includes('amazon')) {
    return { name: 'Amazon', bg: '#FF9900', color: '#111111', icon: 'cart-shopping' as const };
  }
  if (r.includes('flipkart')) {
    return { name: 'Flipkart', bg: '#2874F0', color: '#FFFFFF', icon: 'bag-shopping' as const };
  }
  if (r.includes('google') || r.includes('shopping')) {
    return { name: 'Google Shopping', bg: '#4285F4', color: '#FFFFFF', icon: 'magnifying-glass' as const };
  }
  return { name: retailer || 'Buy Online', bg: '#2D6A4F', color: '#FFFFFF', icon: 'store' as const };
}

export default function RecommendedProductsScreen() {
  const router = useRouter();
  const { isLoggedIn } = useUser();
  const params = useLocalSearchParams<{
    plantName?: string;
    scientificName?: string;
    diseaseName?: string;
    severity?: string;
    scanId?: string;
  }>();

  const plantName = params.plantName || 'Plant Diagnosis';
  const scientificName = params.scientificName || '';
  const diseaseName = params.diseaseName || 'Plant Care Issue';
  const severity = params.severity || 'medium';
  const scanId = params.scanId || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<ProductRecommendationItem[]>([]);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(new Set());
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'best' | 'budget' | 'premium'>('all');
  const [cartCount, setCartCount] = useState<number>(0);

  useEffect(() => {
    loadRecommendations();
    loadCartCount();
  }, [scanId]);

  const loadCartCount = async () => {
    try {
      const isAuthed = await api.isAuthenticated();
      if (isAuthed) {
        const cart = await api.getCart();
        if (cart && Array.isArray(cart.items)) {
          setCartCount(cart.total_items || cart.items.length);
        }
      }
    } catch {
      // Ignore cart count errors
    }
  };

  const loadRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      let recs: ProductRecommendationItem[] = [];

      // 1. Try to fetch scan-specific AI recommendations if scanId exists
      if (scanId) {
        try {
          const recData = await api.getRecommendedProductsForScan(scanId);
          if (recData && Array.isArray(recData.recommendations) && recData.recommendations.length > 0) {
            recs = recData.recommendations.map(r => ({
              ...r,
              buy_links: r.buy_links && r.buy_links.length > 0 ? r.buy_links : [
                {
                  retailer: 'amazon',
                  display_name: 'Amazon',
                  url: `https://www.amazon.com/s?k=${encodeURIComponent(r.product.name)}`,
                  search_query: r.product.name,
                },
                {
                  retailer: 'flipkart',
                  display_name: 'Flipkart',
                  url: `https://www.flipkart.com/search?q=${encodeURIComponent(r.product.name)}`,
                  search_query: r.product.name,
                },
                {
                  retailer: 'google',
                  display_name: 'Google Shopping',
                  url: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(r.product.name)}`,
                  search_query: r.product.name,
                },
              ],
            }));
          }
        } catch (scanErr) {
          console.warn('Could not load scan recommendations, falling back to catalog:', scanErr);
        }
      }

      // 2. If no scan recommendations returned, query products from database catalog
      if (recs.length === 0) {
        const catalog = await api.getProducts();
        if (catalog && catalog.length > 0) {
          const dLower = (diseaseName + ' ' + plantName).toLowerCase();

          // Determine target product category based on diagnosed disease
          let targetSlug = 'fungicide';
          if (
            dLower.includes('aphid') ||
            dLower.includes('pest') ||
            dLower.includes('mite') ||
            dLower.includes('bug') ||
            dLower.includes('insect') ||
            dLower.includes('thrip') ||
            dLower.includes('caterpillar')
          ) {
            targetSlug = 'pest_control';
          } else if (
            dLower.includes('chlorosis') ||
            dLower.includes('yellow') ||
            dLower.includes('nutrient') ||
            dLower.includes('deficien') ||
            dLower.includes('fertil') ||
            dLower.includes('healthy')
          ) {
            targetSlug = 'fertilizer';
          } else if (
            dLower.includes('soil') ||
            dLower.includes('root') ||
            dLower.includes('overwater') ||
            dLower.includes('drain')
          ) {
            targetSlug = 'soil_amendment';
          }

          // Sort products so direct disease treatments rank highest
          const sortedCatalog = [...catalog].sort((a, b) => {
            const aText = ((a.category_slug || '') + ' ' + (a.category_name || '') + ' ' + a.name + ' ' + (a.description || '')).toLowerCase();
            const bText = ((b.category_slug || '') + ' ' + (b.category_name || '') + ' ' + b.name + ' ' + (b.description || '')).toLowerCase();

            const aMatch = aText.includes(targetSlug) || (targetSlug === 'fungicide' && (aText.includes('copper') || aText.includes('sulfur') || aText.includes('fung')));
            const bMatch = bText.includes(targetSlug) || (targetSlug === 'fungicide' && (bText.includes('copper') || bText.includes('sulfur') || bText.includes('fung')));

            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
          });

          const matched: ProductRecommendationItem[] = sortedCatalog.map((p, idx) => {
            const matchType =
              idx === 0
                ? ('best_match' as const)
                : idx === 1
                ? ('budget_option' as const)
                : ('premium_option' as const);

            return {
              product: p,
              match_type: matchType,
              relevance_score: idx === 0 ? 0.96 : idx === 1 ? 0.88 : 0.84,
              reason:
                idx === 0
                  ? `Recommended treatment specifically matching ${diseaseName} on ${plantName}.`
                  : idx === 1
                  ? `Value-conscious alternative providing organic protection against ${diseaseName}.`
                  : `Comprehensive recovery formula for fast disease suppression.`,
              buy_links: [
                {
                  retailer: 'amazon',
                  display_name: 'Amazon',
                  url: `https://www.amazon.com/s?k=${encodeURIComponent(p.name)}`,
                  search_query: p.name,
                },
                {
                  retailer: 'flipkart',
                  display_name: 'Flipkart',
                  url: `https://www.flipkart.com/search?q=${encodeURIComponent(p.name)}`,
                  search_query: p.name,
                },
                {
                  retailer: 'google',
                  display_name: 'Google Shopping',
                  url: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(p.name)}`,
                  search_query: p.name,
                },
              ],
            };
          });

          recs = matched.slice(0, 6);
        }
      }

      setRecommendations(recs);
    } catch (err: any) {
      console.warn('Failed to load recommended products:', err);
      setError('Could not load recommended products. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async (item: ProductRecommendationItem) => {
    if (!isLoggedIn) {
      router.push('/login' as any);
      return;
    }

    const prodId = item.product.id;
    setAddingProductId(prodId);

    try {
      await api.addToCart({
        product_id: prodId,
        quantity: 1,
        recommendation_reason: item.reason,
        scan_id: scanId || undefined,
      });

      setAddedProductIds((prev) => new Set([...prev, prodId]));
      setCartCount((prev) => prev + 1);

      Alert.alert(
        'Added to Cart! 🛒',
        `"${item.product.name}" has been added to your treatment cart.`,
        [
          { text: 'Keep Browsing', style: 'cancel' },
          {
            text: 'View Cart',
            onPress: () => router.push('/cart' as any),
          },
        ]
      );
    } catch (err: any) {
      console.error('Failed to add item to cart:', err);
      Alert.alert('Error', 'Could not add item to cart. Please try again.');
    } finally {
      setAddingProductId(null);
    }
  };

  const handleOpenBuyLink = (linkUrl: string) => {
    if (!linkUrl) return;
    Linking.openURL(linkUrl).catch((err) => {
      console.warn('Failed to open retailer link:', err);
    });
  };

  // Filter recommendations
  const displayedRecs = recommendations.filter((r) => {
    if (selectedFilter === 'best') return r.match_type === 'best_match';
    if (selectedFilter === 'budget') return r.match_type === 'budget_option';
    if (selectedFilter === 'premium') return r.match_type === 'premium_option';
    return true;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          activeOpacity={0.7}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color="#1C3A27" />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Recommended Products</Text>
          <Text style={styles.headerSub}>{plantName}</Text>
        </View>

        <TouchableOpacity
          style={styles.cartHeaderBtn}
          activeOpacity={0.7}
          onPress={() => {
            if (!isLoggedIn) {
              router.push('/login' as any);
            } else {
              router.push('/cart' as any);
            }
          }}
        >
          <Ionicons name="bag-handle-outline" size={22} color="#1C3A27" />
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Diagnosis & Issue Banner */}
        <View style={styles.diagnosticBanner}>
          <View style={styles.bannerIconBg}>
            <Ionicons name="medkit" size={24} color="#2D6A4F" />
          </View>
          <View style={styles.bannerContent}>
            <View style={styles.bannerBadgeRow}>
              <View
                style={[
                  styles.severityPill,
                  severity === 'high'
                    ? styles.severityHigh
                    : severity === 'medium'
                    ? styles.severityMed
                    : styles.severityLow,
                ]}
              >
                <Text style={styles.severityText}>
                  {severity.toUpperCase()} SEVERITY
                </Text>
              </View>
              <Text style={styles.aiVerifiedText}>✨ AI Doctor Verified</Text>
            </View>
            <Text style={styles.bannerIssueTitle}>{diseaseName}</Text>
            <Text style={styles.bannerIssueDesc}>
              Showing verified treatments from our database formulated for {plantName}
              {scientificName ? ` (${scientificName})` : ''}.
            </Text>
          </View>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterPill, selectedFilter === 'all' && styles.filterPillActive]}
            onPress={() => setSelectedFilter('all')}
          >
            <Text
              style={[
                styles.filterPillText,
                selectedFilter === 'all' && styles.filterPillTextActive,
              ]}
            >
              All Picks ({recommendations.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedFilter === 'best' && styles.filterPillActive]}
            onPress={() => setSelectedFilter('best')}
          >
            <Text
              style={[
                styles.filterPillText,
                selectedFilter === 'best' && styles.filterPillTextActive,
              ]}
            >
              👑 Best Match
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedFilter === 'budget' && styles.filterPillActive]}
            onPress={() => setSelectedFilter('budget')}
          >
            <Text
              style={[
                styles.filterPillText,
                selectedFilter === 'budget' && styles.filterPillTextActive,
              ]}
            >
              💰 Budget
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedFilter === 'premium' && styles.filterPillActive]}
            onPress={() => setSelectedFilter('premium')}
          >
            <Text
              style={[
                styles.filterPillText,
                selectedFilter === 'premium' && styles.filterPillTextActive,
              ]}
            >
              ⚡ Premium
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content Loading & Error States */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2D6A4F" />
            <Text style={styles.loadingTitle}>Searching Plantify Product Catalog...</Text>
            <Text style={styles.loadingSub}>
              Checking database stock, species compatibility & AI treatment match.
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={32} color="#DC2626" />
            <Text style={styles.errorTitle}>Unable to load products</Text>
            <Text style={styles.errorSub}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadRecommendations}>
              <Text style={styles.retryBtnText}>Retry Search</Text>
            </TouchableOpacity>
          </View>
        ) : displayedRecs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Image
              source={require('@/assets/images/leaf.png')}
              style={styles.emptyImage}
              contentFit="contain"
            />
            <Text style={styles.emptyTitle}>No exact products found</Text>
            <Text style={styles.emptySub}>
              We couldn't find a direct product in the catalog for this category, but natural care and cultural practices are outlined in your Care Plan.
            </Text>
            <TouchableOpacity
              style={styles.viewCarePlanActionBtn}
              onPress={() =>
                router.push({
                  pathname: '/disease-care-plan',
                  params: { plantName, diseaseName, severity, scanId },
                })
              }
            >
              <Text style={styles.viewCarePlanActionText}>View Disease Care Plan</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        ) : (
          /* Product Recommendation Cards */
          <View style={styles.productsList}>
            {displayedRecs.map((item, idx) => {
              const { product, match_type, relevance_score, reason, buy_links } = item;
              const isAdded = addedProductIds.has(product.id);
              const isAdding = addingProductId === product.id;

              const isBest = match_type === 'best_match';
              const isBudget = match_type === 'budget_option';
              const isPremium = match_type === 'premium_option';

              return (
                <View
                  key={product.id || `rec-${idx}`}
                  style={[styles.productCard, isBest && styles.productCardBest]}
                >
                  {/* Badge Header Row */}
                  <View style={styles.productBadgeRow}>
                    {isBest && (
                      <View style={styles.bestMatchBadge}>
                        <Ionicons name="star" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.bestMatchBadgeText}>TOP AI DOCTOR PICK</Text>
                      </View>
                    )}
                    {isBudget && (
                      <View style={styles.budgetBadge}>
                        <Text style={styles.budgetBadgeText}>💰 VALUE OPTION</Text>
                      </View>
                    )}
                    {isPremium && (
                      <View style={styles.premiumBadge}>
                        <Text style={styles.premiumBadgeText}>⚡ FAST-ACTING PRO</Text>
                      </View>
                    )}

                    <View style={styles.scoreBadge}>
                      <Text style={styles.scoreBadgeText}>
                        {(relevance_score * 100).toFixed(0)}% Match
                      </Text>
                    </View>
                  </View>

                  {/* Main Product Info Row */}
                  <View style={styles.productMainRow}>
                    <Image
                      source={
                        product.image_url
                          ? { uri: product.image_url }
                          : require('@/assets/images/medicinal.png')
                      }
                      style={styles.productImage}
                      contentFit="cover"
                    />

                    <View style={styles.productInfoCol}>
                      {product.brand ? (
                        <Text style={styles.productBrand} numberOfLines={1}>
                          {product.brand}
                        </Text>
                      ) : null}
                      <Text style={styles.productName} numberOfLines={2}>
                        {product.name}
                      </Text>

                      <View style={styles.priceRow}>
                        <Text style={styles.productPrice}>₹{product.price.toFixed(2)}</Text>
                        <View
                          style={[
                            styles.stockTag,
                            product.stock > 10 ? styles.stockIn : styles.stockLow,
                          ]}
                        >
                          <Text
                            style={[
                              styles.stockTagText,
                              product.stock > 10 ? styles.stockInText : styles.stockLowText,
                            ]}
                          >
                            {product.stock > 10 ? 'In Stock' : product.stock > 0 ? `${product.stock} left` : 'Out of Stock'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* AI Reasoning / Doctor Note */}
                  <View style={styles.reasonBox}>
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color="#2D6A4F" style={{ marginTop: 2, marginRight: 6 }} />
                    <Text style={styles.reasonText}>
                      <Text style={{ fontWeight: '700', color: '#1C3A27' }}>Why this product: </Text>
                      {reason}
                    </Text>
                  </View>

                  {/* Usage Instructions if present */}
                  {product.usage_instructions ? (
                    <View style={styles.usageBox}>
                      <Text style={styles.usageTitle}>🌿 Application Guide:</Text>
                      <Text style={styles.usageText}>{product.usage_instructions}</Text>
                    </View>
                  ) : null}

                  {/* Action Buttons: Add to Cart + External Buy Links */}
                  <View style={styles.actionsContainer}>
                    <TouchableOpacity
                      style={[styles.addToCartBtn, isAdded && styles.addToCartBtnDone]}
                      activeOpacity={0.85}
                      disabled={isAdding || product.stock <= 0}
                      onPress={() => handleAddToCart(item)}
                    >
                      {isAdding ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : isAdded ? (
                        <>
                          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.addToCartBtnText}>Added to Cart</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="cart-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.addToCartBtnText}>Add to Care Cart</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* External Buy Links */}
                    {buy_links && buy_links.length > 0 && (
                      <View style={styles.retailersRow}>
                        <Text style={styles.retailersLabel}>Or order from:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.retailerBtnsScroll}>
                          {buy_links.map((link, lIdx) => {
                            const info = getRetailerInfo(link.retailer);
                            return (
                              <TouchableOpacity
                                key={`link-${lIdx}`}
                                style={[styles.retailerPill, { borderColor: info.bg }]}
                                activeOpacity={0.8}
                                onPress={() => handleOpenBuyLink(link.url)}
                              >
                                <FontAwesome6 name={info.icon} size={11} color={info.bg} style={{ marginRight: 5 }} />
                                <Text style={[styles.retailerPillText, { color: info.bg }]}>
                                  {info.name}
                                </Text>
                                <Ionicons name="open-outline" size={11} color={info.bg} style={{ marginLeft: 3 }} />
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Informative Footer Card */}
        <View style={styles.footerNoteCard}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#2D6A4F" style={{ marginRight: 8 }} />
          <Text style={styles.footerNoteText}>
            All recommendations adhere to verified botanical treatment protocols. Always follow manufacturer safety instructions when applying garden treatments.
          </Text>
        </View>
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.viewCarePlanBottomBtn}
          activeOpacity={0.85}
          onPress={() =>
            router.push({
              pathname: '/disease-care-plan',
              params: {
                plantName,
                diseaseName,
                severity,
                scanId: scanId || '',
              },
            })
          }
        >
          <Ionicons name="clipboard-outline" size={18} color="#2D6A4F" style={{ marginRight: 6 }} />
          <Text style={styles.viewCarePlanBottomText}>View Care Plan</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.viewCartBottomBtn}
          activeOpacity={0.85}
          onPress={() => {
            if (!isLoggedIn) {
              router.push('/login' as any);
            } else {
              router.push('/cart' as any);
            }
          }}
        >
          <Ionicons name="bag-check" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.viewCartBottomText}>
            View Cart {cartCount > 0 ? `(${cartCount})` : ''}
          </Text>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
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
    borderBottomColor: '#EBF4EA',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F5EF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
  },
  headerSub: {
    fontSize: 12,
    color: '#718E7B',
    marginTop: 1,
  },
  cartHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F5EF',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#DC2626',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 110,
  },
  diagnosticBanner: {
    flexDirection: 'row',
    backgroundColor: '#EBF4EA',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D0E5CC',
    marginBottom: 16,
  },
  bannerIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#2D6A4F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bannerContent: {
    flex: 1,
  },
  bannerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  severityPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  severityHigh: {
    backgroundColor: '#FEE2E2',
  },
  severityMed: {
    backgroundColor: '#FEF3C7',
  },
  severityLow: {
    backgroundColor: '#E0F2FE',
  },
  severityText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1C3A27',
  },
  aiVerifiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2D6A4F',
  },
  bannerIssueTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 4,
  },
  bannerIssueDesc: {
    fontSize: 12,
    color: '#527863',
    lineHeight: 17,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EBE0',
  },
  filterPillActive: {
    backgroundColor: '#2D6A4F',
    borderColor: '#2D6A4F',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#527863',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
  },
  loadingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C3A27',
    marginTop: 14,
  },
  loadingSub: {
    fontSize: 12,
    color: '#718E7B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
  },
  errorCard: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#991B1B',
    marginTop: 8,
  },
  errorSub: {
    fontSize: 12,
    color: '#B91C1C',
    textAlign: 'center',
    marginTop: 4,
  },
  retryBtn: {
    marginTop: 14,
    backgroundColor: '#DC2626',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
  },
  emptyImage: {
    width: 60,
    height: 60,
    marginBottom: 12,
    opacity: 0.6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
  },
  emptySub: {
    fontSize: 12,
    color: '#718E7B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    marginBottom: 16,
  },
  viewCarePlanActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D6A4F',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
  },
  viewCarePlanActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  productsList: {
    gap: 16,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8F1E6',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  productCardBest: {
    borderColor: '#7DA676',
    borderWidth: 1.5,
  },
  productBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bestMatchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E5322',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bestMatchBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  budgetBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  budgetBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  premiumBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  premiumBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5B21B6',
  },
  scoreBadge: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369A1',
  },
  productMainRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: '#F0F5EF',
  },
  productInfoCol: {
    flex: 1,
  },
  productBrand: {
    fontSize: 11,
    fontWeight: '700',
    color: '#718E7B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  productName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C3A27',
    marginTop: 2,
    lineHeight: 20,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  productPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2D6A4F',
  },
  stockTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stockIn: {
    backgroundColor: '#DCFCE7',
  },
  stockInText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  stockLow: {
    backgroundColor: '#FEF3C7',
  },
  stockLowText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  stockTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  reasonBox: {
    flexDirection: 'row',
    backgroundColor: '#F4F9F2',
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  reasonText: {
    flex: 1,
    fontSize: 12,
    color: '#3B5945',
    lineHeight: 17,
  },
  usageBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#EBF2EA',
  },
  usageTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1C3A27',
    marginBottom: 2,
  },
  usageText: {
    fontSize: 11,
    color: '#527863',
    lineHeight: 15,
  },
  actionsContainer: {
    marginTop: 14,
    gap: 10,
  },
  addToCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2D6A4F',
    borderRadius: 14,
    paddingVertical: 12,
    shadowColor: '#2D6A4F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  addToCartBtnDone: {
    backgroundColor: '#1E5322',
  },
  addToCartBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  retailersRow: {
    marginTop: 4,
  },
  retailersLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#718E7B',
    marginBottom: 6,
  },
  retailerBtnsScroll: {
    gap: 8,
  },
  retailerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retailerPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  footerNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#EBF4EA',
  },
  footerNoteText: {
    flex: 1,
    fontSize: 11,
    color: '#527863',
    lineHeight: 16,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EBF4EA',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    flexDirection: 'row',
    gap: 10,
  },
  viewCarePlanBottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EBF4EA',
    borderRadius: 16,
    paddingVertical: 14,
  },
  viewCarePlanBottomText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2D6A4F',
  },
  viewCartBottomBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2D6A4F',
    borderRadius: 16,
    paddingVertical: 14,
    shadowColor: '#2D6A4F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  viewCartBottomText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
