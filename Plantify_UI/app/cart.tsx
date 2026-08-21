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
import { useRouter } from 'expo-router';
import { Ionicons, FontAwesome6 } from '@expo/vector-icons';
import { api, CartData, CartItemData, BuyLinkData } from '@/services/api';
import { useUser } from './_layout';

const { width } = Dimensions.get('window');

function getRetailerBadge(retailer: string) {
  const r = retailer.toLowerCase();
  if (r.includes('amazon')) {
    return { name: 'Amazon', bg: '#FF9900', color: '#111111', icon: 'cart-shopping' as const };
  }
  if (r.includes('flipkart')) {
    return { name: 'Flipkart', bg: '#2874F0', color: '#FFFFFF', icon: 'bag-shopping' as const };
  }
  return { name: retailer || 'Store', bg: '#2D6A4F', color: '#FFFFFF', icon: 'store' as const };
}

export default function CartScreen() {
  const router = useRouter();
  const { isLoggedIn } = useUser();

  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login' as any);
      return;
    }
    loadCart();
  }, [isLoggedIn]);

  const loadCart = async () => {
    try {
      setLoading(true);
      const data = await api.getCart();
      setCart(data);
    } catch (err) {
      console.warn('Failed to load cart:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateQuantity = async (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(itemId);
      return;
    }

    try {
      setUpdatingItemId(itemId);
      await api.updateCartItem(itemId, newQty);
      await loadCart();
    } catch (err) {
      console.error('Failed to update quantity:', err);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      setUpdatingItemId(itemId);
      await api.removeCartItem(itemId);
      await loadCart();
    } catch (err) {
      console.error('Failed to remove cart item:', err);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleClearCart = () => {
    Alert.alert(
      'Clear Cart',
      'Are you sure you want to remove all items from your treatment cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              setClearing(true);
              await api.clearCart();
              await loadCart();
            } catch (err) {
              console.error('Failed to clear cart:', err);
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenLink = (url?: string, productName?: string) => {
    const finalUrl = url || `https://www.amazon.com/s?k=${encodeURIComponent(productName || 'plant treatment')}`;
    Linking.openURL(finalUrl).catch((err) => {
      console.warn('Failed to open retailer link:', err);
    });
  };

  const items = cart?.items || [];
  const totalPrice = cart?.total_price || 0;
  const totalItems = cart?.total_items || items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          activeOpacity={0.7}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color="#1C3A27" />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Plant Care Cart</Text>
          <Text style={styles.headerSub}>
            {totalItems} {totalItems === 1 ? 'item' : 'items'} saved
          </Text>
        </View>

        {items.length > 0 ? (
          <TouchableOpacity
            style={styles.clearBtn}
            activeOpacity={0.7}
            disabled={clearing}
            onPress={handleClearCart}
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2D6A4F" />
          <Text style={styles.loadingText}>Loading your care cart...</Text>
        </View>
      ) : items.length === 0 ? (
        /* Empty State */
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="bag-handle-outline" size={48} color="#718E7B" />
          </View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>
            Diagnose a plant disease or explore recommendations to add treatments to your cart.
          </Text>
          <TouchableOpacity
            style={styles.browseBtn}
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/my-garden' as any)}
          >
            <Text style={styles.browseBtnText}>Go to My Garden</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
      ) : (
        /* Cart Items List */
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.itemsList}>
            {items.map((item) => {
              const product = item.product;
              const name = item.product_name || product?.name || 'Treatment Product';
              const brand = item.product_brand || product?.brand || '';
              const price = item.price_at_addition || product?.price || 0;
              const imgUrl = item.product_image_url || product?.image_url;
              const isUpdating = updatingItemId === item.id;

              return (
                <View key={item.id} style={styles.cartCard}>
                  <View style={styles.cartCardTopRow}>
                    <Image
                      source={imgUrl ? { uri: imgUrl } : require('@/assets/images/medicinal.png')}
                      style={styles.cartProductImg}
                      contentFit="cover"
                    />

                    <View style={styles.cartProductDetails}>
                      {brand ? <Text style={styles.cartBrandText}>{brand}</Text> : null}
                      <Text style={styles.cartProductName} numberOfLines={2}>
                        {name}
                      </Text>
                      <Text style={styles.cartProductPrice}>₹{price.toFixed(2)}</Text>
                    </View>

                    <TouchableOpacity
                      style={styles.trashBtn}
                      activeOpacity={0.7}
                      disabled={isUpdating}
                      onPress={() => handleRemoveItem(item.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    </TouchableOpacity>
                  </View>

                  {/* Recommendation Reason Tag */}
                  {item.recommendation_reason ? (
                    <View style={styles.reasonTag}>
                      <Ionicons name="leaf" size={12} color="#2D6A4F" style={{ marginRight: 4 }} />
                      <Text style={styles.reasonTagText} numberOfLines={2}>
                        {item.recommendation_reason}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.cartCardDivider} />

                  {/* Bottom Controls Row: Quantity & Quick Buy Links */}
                  <View style={styles.cartControlsRow}>
                    <View style={styles.quantityContainer}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        activeOpacity={0.7}
                        disabled={isUpdating}
                        onPress={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                      >
                        <Ionicons name="remove" size={16} color="#1C3A27" />
                      </TouchableOpacity>

                      <View style={styles.qtyCount}>
                        {isUpdating ? (
                          <ActivityIndicator size="small" color="#2D6A4F" />
                        ) : (
                          <Text style={styles.qtyText}>{item.quantity}</Text>
                        )}
                      </View>

                      <TouchableOpacity
                        style={styles.qtyBtn}
                        activeOpacity={0.7}
                        disabled={isUpdating}
                        onPress={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                      >
                        <Ionicons name="add" size={16} color="#1C3A27" />
                      </TouchableOpacity>
                    </View>

                    {/* Fast Buy Button */}
                    <TouchableOpacity
                      style={styles.fastBuyBtn}
                      activeOpacity={0.8}
                      onPress={() => handleOpenLink(item.buy_links?.[0]?.url, name)}
                    >
                      <FontAwesome6 name="bag-shopping" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.fastBuyBtnText}>Buy on Amazon</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Order Summary Card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Order Estimate</Text>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal ({totalItems} items)</Text>
              <Text style={styles.summaryValue}>₹{totalPrice.toFixed(2)}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Estimated Shipping</Text>
              <Text style={[styles.summaryValue, { color: '#15803D' }]}>FREE</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Estimated GST / Tax</Text>
              <Text style={styles.summaryValue}>₹{(totalPrice * 0.05).toFixed(2)}</Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryTotalRow}>
              <Text style={styles.summaryTotalLabel}>Total Estimate</Text>
              <Text style={styles.summaryTotalValue}>
                ₹{(totalPrice + totalPrice * 0.05).toFixed(2)}
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Sticky Bottom Checkout Bar */}
      {items.length > 0 && (
        <View style={styles.checkoutBar}>
          <View style={styles.checkoutPriceCol}>
            <Text style={styles.checkoutPriceLabel}>Total Amount</Text>
            <Text style={styles.checkoutPriceValue}>
              ₹{(totalPrice + totalPrice * 0.05).toFixed(2)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.checkoutBtn}
            activeOpacity={0.85}
            onPress={() => {
              const firstItem = items[0];
              handleOpenLink(firstItem.buy_links?.[0]?.url, firstItem.product_name || firstItem.product?.name);
            }}
          >
            <Text style={styles.checkoutBtnText}>Proceed to Order</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
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
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#718E7B',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconBg: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#EBF4EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
  },
  emptySub: {
    fontSize: 13,
    color: '#718E7B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    marginBottom: 20,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D6A4F',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#2D6A4F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  browseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 110,
  },
  itemsList: {
    gap: 14,
  },
  cartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EBF4EA',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cartCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cartProductImg: {
    width: 65,
    height: 65,
    borderRadius: 12,
    backgroundColor: '#F0F5EF',
  },
  cartProductDetails: {
    flex: 1,
  },
  cartBrandText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#718E7B',
    textTransform: 'uppercase',
  },
  cartProductName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C3A27',
    marginTop: 2,
    lineHeight: 18,
  },
  cartProductPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2D6A4F',
    marginTop: 4,
  },
  trashBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reasonTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F9F2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  reasonTagText: {
    fontSize: 11,
    color: '#2D6A4F',
    fontWeight: '600',
  },
  cartCardDivider: {
    height: 1,
    backgroundColor: '#F0F5EF',
    marginVertical: 12,
  },
  cartControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F5EF',
    borderRadius: 12,
    padding: 3,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyCount: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C3A27',
  },
  fastBuyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9900',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  fastBuyBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#EBF4EA',
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#718E7B',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C3A27',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#F0F5EF',
    marginVertical: 10,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C3A27',
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2D6A4F',
  },
  checkoutBar: {
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  checkoutPriceCol: {
    flex: 1,
  },
  checkoutPriceLabel: {
    fontSize: 11,
    color: '#718E7B',
    fontWeight: '600',
  },
  checkoutPriceValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#2D6A4F',
  },
  checkoutBtn: {
    flex: 1.4,
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
  checkoutBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
