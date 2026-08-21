/**
 * Centralized API client for the Plantify backend.
 *
 * Uses axios with JWT token management via AsyncStorage.
 * All backend API calls should go through this module —
 * do NOT scatter fetch/axios calls across UI components.
 *
 * Usage:
 *   import { api } from '@/services/api';
 *   const plants = await api.getPlants();
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// ── Configuration ────────────────────────────────────────────────

const getBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  // Detect host IP when running in Expo Go on real devices over LAN
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:8000`;
    }
  }

  // Android emulator loopback
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }

  return 'http://localhost:8000';
};

const API_BASE_URL = getBaseUrl();
export const TOKEN_KEY = '@plantify_auth_token';
export const USER_KEY = '@plantify_auth_user';

// ── Types ────────────────────────────────────────────────────────

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errorCode: string;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface TokenData {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface HealthTimelinePointData {
  id: string;
  scan_id?: string | null;
  date: number;
  score: number;
  health_status?: string | null;
  issue?: string | null;
  image_url?: string | null;
  created_at: string;
}

export interface PlantData {
  id: string;
  user_id: string;
  name: string;
  scientific_name: string | null;
  identification_confidence: number | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  images: PlantImageData[];
  health_timeline?: HealthTimelinePointData[];
}

export interface PlantImageData {
  id: string;
  image_url: string;
  image_type: string | null;
  created_at: string;
}

export interface ScanData {
  id: string;
  plant_id: string;
  image_url: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  created_at: string;
  completed_at: string | null;
}

export interface ScanDetailData extends ScanData {
  health_analyses: HealthAnalysisData[];
}

export interface HealthAnalysisData {
  id: string;
  scan_id: string;
  health_status: string | null;
  issue: string | null;
  confidence: number | null;
  severity: string | null;
  symptoms: any;
  possible_causes: any;
  created_at: string;
}

// ── Identification Types ─────────────────────────────────────────

export interface IdentificationPlantResult {
  name: string;
  scientificName: string;
  confidence: number;
  family?: string;
  genus?: string;
  commonNames?: string[];
}

export interface IdentificationAlternative {
  name: string;
  scientificName: string;
  confidence: number;
  family?: string;
  genus?: string;
}

export interface IdentificationData {
  scan_id: string;
  plant: IdentificationPlantResult;
  alternatives: IdentificationAlternative[];
  lowConfidence: boolean;
  healthAnalysis?: HealthAnalysisApiResult | null;
}

// ── Health Analysis Types ────────────────────────────────────────

export interface HealthAnalysisApiResult {
  healthStatus: 'healthy' | 'warning' | 'diseased';
  issue: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high';
  symptoms: string[];
  possibleCauses: string[];
  lowConfidence?: boolean;
}


export interface CareRecommendationData {
  id: string;
  scan_id: string;
  summary: string;
  care: {
    watering: string;
    sunlight: string;
    temperature: string;
    humidity: string;
    soil: string;
    fertilization: string;
    pruning: string;
  };
  problem: {
    detected: boolean;
    name: string;
    category: string;
    severity: string;
    description: string;
  };
  treatment: {
    required: boolean;
    product_category: string;
    recommended_actions: string[];
    frequency: string;
    estimated_duration: string;
    precautions: string[];
    instructions: string;
  };
  provider: string;
  created_at: string;
}

export interface ProductCategoryData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface BuyLinkData {
  retailer: string;
  display_name: string;
  url: string;
  search_query: string;
}

export interface ProductData {
  id: string;
  name: string;
  brand: string | null;
  category_id: string | null;
  category_name?: string;
  category_slug?: string;
  description: string | null;
  price: number;
  stock: number;
  availability?: 'in_stock' | 'low_stock' | 'out_of_stock';
  image_url: string | null;
  usage_instructions: string | null;
  active: boolean;
  compatibilities?: Array<{
    problem_category: string;
    plant_species: string | null;
  }>;
}

export interface ProductRecommendationItem {
  product: ProductData;
  match_type: 'best_match' | 'budget_option' | 'premium_option';
  relevance_score: number;
  reason: string;
  buy_links?: BuyLinkData[];
}

export interface ProductRecommendationResponseData {
  recommendations: ProductRecommendationItem[];
  treatment_context: {
    problem_category: string;
    product_category: string;
    severity: string;
  };
  message: string | null;
}

export interface CartItemData {
  id: string;
  cart_id: string;
  product_id: string;
  product_name?: string;
  product_brand?: string | null;
  product_image_url?: string | null;
  price_at_addition: number;
  current_price?: number;
  stock?: number;
  quantity: number;
  recommendation_reason: string | null;
  scan_id: string | null;
  buy_links?: BuyLinkData[];
  created_at: string;
  product?: ProductData;
}

export interface CartData {
  id: string;
  user_id: string;
  items: CartItemData[];
  total_items: number;
  total_price: number;
  created_at: string;
  updated_at: string;
}

// ── Axios Instance ───────────────────────────────────────────────

const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT token to every request
axiosInstance.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: unwrap success responses, format errors
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    if (error.response?.status === 401) {
      // Server returned 401 Unauthorized (token expired or invalid)
      await clearAuthData();
    }
    if (error.response?.data) {
      const errData = error.response.data;
      return Promise.reject({
        success: false,
        message: errData.message || (errData as any).detail || 'An unexpected error occurred',
        errorCode: errData.errorCode || 'UNAUTHORIZED_ERROR',
        status: error.response.status,
      });
    }
    return Promise.reject({
      success: false,
      message: error.message || 'Network error',
      errorCode: 'NETWORK_ERROR',
      status: error.response?.status || 0,
    });
  }
);

// ── Token Management ─────────────────────────────────────────────

function decodeBase64(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, '');
  let output = '';

  if (str.length % 4 === 1) {
    throw new Error('Invalid base64 string');
  }

  for (
    let bc = 0, bs = 0, buffer: number, idx = 0;
    (buffer = str.charCodeAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(String.fromCharCode(buffer));
  }

  return output;
}

export function isJwtExpired(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const jsonStr = decodeBase64(base64);
    const payload = JSON.parse(jsonStr);
    if (!payload || !payload.exp) return false;
    // exp is in seconds
    const nowInSeconds = Math.floor(Date.now() / 1000);
    // If expired or expiring within 10 seconds, treat as expired
    return nowInSeconds >= (payload.exp - 10);
  } catch (err) {
    console.warn('Failed to parse JWT token expiry:', err);
    return true;
  }
}

export async function saveAuthData(tokenData: TokenData): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, tokenData.access_token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(tokenData.user));
}

export async function clearAuthData(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

export async function getStoredUser(): Promise<AuthUser | null> {
  const userData = await AsyncStorage.getItem(USER_KEY);
  return userData ? JSON.parse(userData) : null;
}

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function createUploadFormData(imageUri: string, fieldName = 'image', fileName = 'plant_scan.jpg'): Promise<FormData> {
  const formData = new FormData();
  if (Platform.OS === 'web') {
    try {
      const res = await fetch(imageUri);
      const blob = await res.blob();
      formData.append(fieldName, blob, fileName);
      return formData;
    } catch {
      // Fallback
    }
  }
  formData.append(fieldName, {
    uri: imageUri,
    name: fileName,
    type: 'image/jpeg',
  } as any);
  return formData;
}

// ── API Methods ──────────────────────────────────────────────────

export const api = {
  // ── Auth ────────────────────────────────────────────────────

  /**
   * Register a new user account.
   */
  async register(name: string, email: string, password: string): Promise<TokenData> {
    const response = await axiosInstance.post<ApiSuccessResponse<TokenData>>(
      '/api/auth/register',
      { name, email, password }
    );
    const tokenData = response.data.data;
    await saveAuthData(tokenData);
    return tokenData;
  },

  /**
   * Login with email and password.
   */
  async login(email: string, password: string): Promise<TokenData> {
    const response = await axiosInstance.post<ApiSuccessResponse<TokenData>>(
      '/api/auth/login',
      { email, password }
    );
    const tokenData = response.data.data;
    await saveAuthData(tokenData);
    return tokenData;
  },

  /**
   * Authenticate or register with Google OAuth2.
   */
  async loginWithGoogle(payload: {
    token?: string;
    email?: string;
    name?: string;
    google_id?: string;
  }): Promise<TokenData> {
    const response = await axiosInstance.post<ApiSuccessResponse<TokenData>>(
      '/api/auth/google',
      payload
    );
    const tokenData = response.data.data;
    await saveAuthData(tokenData);
    return tokenData;
  },

  /**
   * Get the current authenticated user's profile.
   */
  async getMe(): Promise<AuthUser> {
    const response = await axiosInstance.get<ApiSuccessResponse<AuthUser>>(
      '/api/auth/me'
    );
    return response.data.data;
  },

  /**
   * Logout: clear stored credentials.
   */
  async logout(): Promise<void> {
    await clearAuthData();
  },

  /**
   * Check if a user is currently logged in with a valid unexpired token.
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await getStoredToken();
    if (!token) return false;
    if (isJwtExpired(token)) {
      await clearAuthData();
      return false;
    }
    return true;
  },

  /**
   * Get the stored user without making an API call.
   */
  getStoredUser,

  // ── Plants ─────────────────────────────────────────────────

  /**
   * Create a new plant.
   */
  async createPlant(data: {
    name: string;
    scientific_name?: string;
    identification_confidence?: number;
    image_url?: string;
  }): Promise<PlantData> {
    const response = await axiosInstance.post<ApiSuccessResponse<PlantData>>(
      '/api/plants',
      data
    );
    return response.data.data;
  },

  /**
   * Get all plants for the authenticated user.
   */
  async getPlants(): Promise<PlantData[]> {
    const response = await axiosInstance.get<ApiSuccessResponse<PlantData[]>>(
      '/api/plants'
    );
    return response.data.data;
  },

  /**
   * Get a single plant by ID.
   */
  async getPlant(plantId: string): Promise<PlantData> {
    const response = await axiosInstance.get<ApiSuccessResponse<PlantData>>(
      `/api/plants/${plantId}`
    );
    return response.data.data;
  },

  /**
   * Update a plant (partial update).
   */
  async updatePlant(
    plantId: string,
    data: {
      name?: string;
      scientific_name?: string;
      identification_confidence?: number;
      image_url?: string;
    }
  ): Promise<PlantData> {
    const response = await axiosInstance.patch<ApiSuccessResponse<PlantData>>(
      `/api/plants/${plantId}`,
      data
    );
    return response.data.data;
  },

  /**
   * Delete a plant.
   */
  async deletePlant(plantId: string): Promise<void> {
    await axiosInstance.delete(`/api/plants/${plantId}`);
  },

  /**
   * Get the full health timeline history for a plant from database.
   */
  async getPlantHealthTimeline(plantId: string): Promise<HealthTimelinePointData[]> {
    const response = await axiosInstance.get<ApiSuccessResponse<HealthTimelinePointData[]>>(
      `/api/plants/${plantId}/health-timeline`
    );
    return response.data.data;
  },

  /**
   * Record a health scan/assessment for a plant and persist it to the database.
   */
  async addPlantHealthScan(
    plantId: string,
    data: {
      score: number;
      health_status?: string;
      issue?: string;
      image_url?: string;
      date?: number;
    }
  ): Promise<HealthTimelinePointData> {
    const response = await axiosInstance.post<ApiSuccessResponse<HealthTimelinePointData>>(
      `/api/plants/${plantId}/health-scans`,
      data
    );
    return response.data.data;
  },

  // ── Scans ──────────────────────────────────────────────────

  /**
   * Upload an image and create a scan for a plant.
   */
  async createScan(plantId: string, imageUri: string): Promise<ScanData> {
    const formData = await createUploadFormData(imageUri, 'image', 'plant_scan.jpg');

    const response = await axiosInstance.post<ApiSuccessResponse<ScanData>>(
      `/api/plants/${plantId}/scans`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data.data;
  },

  /**
   * Get all scans for a plant.
   */
  async getScans(plantId: string): Promise<ScanData[]> {
    const response = await axiosInstance.get<ApiSuccessResponse<ScanData[]>>(
      `/api/plants/${plantId}/scans`
    );
    return response.data.data;
  },

  /**
   * Get a single scan by ID (includes health analyses).
   */
  async getScan(scanId: string): Promise<ScanDetailData> {
    const response = await axiosInstance.get<ApiSuccessResponse<ScanDetailData>>(
      `/api/scans/${scanId}`
    );
    return response.data.data;
  },

  // ── Plant Identification ────────────────────────────────────

  /**
   * Upload an image and identify the plant using the backend AI pipeline.
   * The backend calls Pl@ntNet — API key is never exposed to the frontend.
   */
  async identifyPlant(plantId: string, imageUri: string): Promise<IdentificationData> {
    const formData = await createUploadFormData(imageUri, 'image', 'plant_identify.jpg');

    const response = await axiosInstance.post<ApiSuccessResponse<IdentificationData>>(
      `/api/plants/${plantId}/identify`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000, // 60s — Pl@ntNet can be slow
      }
    );
    return response.data.data;
  },

  // ── Health Check ───────────────────────────────────────────

  /**
   * Check if the backend API is healthy.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axiosInstance.get('/api/health');
      return response.data?.success === true;
    } catch {
      return false;
    }
  },

  // ── Health Analysis ─────────────────────────────────────────

  /**
   * Run health/disease analysis on an existing scan.
   * Called by the 'Diagnose Health' button on the plant details page.
   */
  async analyzeHealth(
    scanId: string,
    options?: {
      plantName?: string;
      scientificName?: string;
      imageUrl?: string;
    }
  ): Promise<HealthAnalysisApiResult> {
    const response = await axiosInstance.post<ApiSuccessResponse<HealthAnalysisApiResult>>(
      `/api/scans/${scanId}/health-analysis`,
      {
        plant_name: options?.plantName,
        scientific_name: options?.scientificName,
        image_url: options?.imageUrl,
      },
      {
        timeout: 60000, // 60s — vision analysis can be slow
      }
    );
    return response.data.data;
  },

  // ── AI Care & Treatment Analysis ────────────────────────────

  /**
   * Run full AI care & treatment analysis on a completed scan.
   */
  async analyzeScan(scanId: string): Promise<CareRecommendationData> {
    const response = await axiosInstance.post<ApiSuccessResponse<CareRecommendationData>>(
      `/api/scans/${scanId}/analyze`,
      {},
      { timeout: 60000 }
    );
    return response.data.data;
  },

  /**
   * Retrieve a previously generated care recommendation for a scan.
   */
  async getScanRecommendation(scanId: string): Promise<CareRecommendationData> {
    const response = await axiosInstance.get<ApiSuccessResponse<CareRecommendationData>>(
      `/api/scans/${scanId}/recommendation`
    );
    return response.data.data;
  },

  /**
   * Run end-to-end LangGraph pipeline for a scan.
   */
  async runScanPipeline(scanId: string): Promise<any> {
    const response = await axiosInstance.post<ApiSuccessResponse<any>>(
      `/api/scans/${scanId}/pipeline`,
      {},
      { timeout: 90000 }
    );
    return response.data.data;
  },

  // ── Product Catalog & Recommendations ────────────────────────

  /**
   * List product categories.
   */
  async getProductCategories(): Promise<ProductCategoryData[]> {
    const response = await axiosInstance.get<ApiSuccessResponse<ProductCategoryData[]>>(
      '/api/products/categories'
    );
    return response.data.data;
  },

  /**
   * List products from catalog.
   */
  async getProducts(params?: {
    category_id?: string;
    search?: string;
  }): Promise<ProductData[]> {
    const response = await axiosInstance.get<ApiSuccessResponse<ProductData[]>>(
      '/api/products',
      { params }
    );
    return response.data.data;
  },

  /**
   * Get single product details.
   */
  async getProduct(productId: string): Promise<ProductData> {
    const response = await axiosInstance.get<ApiSuccessResponse<ProductData>>(
      `/api/products/${productId}`
    );
    return response.data.data;
  },

  /**
   * Get AI-recommended products for a scan.
   */
  async getRecommendedProductsForScan(scanId: string): Promise<ProductRecommendationResponseData> {
    const response = await axiosInstance.post<ApiSuccessResponse<ProductRecommendationResponseData>>(
      `/api/scans/${scanId}/recommend-products`,
      {}
    );
    return response.data.data;
  },

  // ── Cart ────────────────────────────────────────────────────

  /**
   * Get user's active recommendation cart.
   */
  async getCart(): Promise<CartData> {
    const response = await axiosInstance.get<ApiSuccessResponse<CartData>>('/api/cart');
    return response.data.data;
  },

  /**
   * Add a product to the cart.
   */
  async addToCart(payload: {
    product_id: string;
    quantity?: number;
    recommendation_reason?: string;
    scan_id?: string;
  }): Promise<CartItemData> {
    const response = await axiosInstance.post<ApiSuccessResponse<CartItemData>>(
      '/api/cart/items',
      payload
    );
    return response.data.data;
  },

  /**
   * Update quantity of a cart item.
   */
  async updateCartItem(itemId: string, quantity: number): Promise<CartItemData> {
    const response = await axiosInstance.patch<ApiSuccessResponse<CartItemData>>(
      `/api/cart/items/${itemId}`,
      { quantity }
    );
    return response.data.data;
  },

  /**
   * Remove an item from the cart.
   */
  async removeCartItem(itemId: string): Promise<void> {
    await axiosInstance.delete(`/api/cart/items/${itemId}`);
  },

  /**
   * Clear all items in the cart.
   */
  async clearCart(): Promise<void> {
    await axiosInstance.delete('/api/cart');
  },
};

export default api;
