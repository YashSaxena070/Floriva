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

// ── Product & Recommendation Types ──────────────────────────────

export interface ProductData {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  image_url: string | null;
  retailer_name: string | null;
  retailer_url: string | null;
  is_active: boolean;
  category_name?: string | null;
  created_at: string;
  updated_at: string;
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

export interface CartItemData {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  recommendation_reason: string | null;
  scan_id: string | null;
  created_at: string;
  product: ProductData;
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
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response?.data) {
      const errData = error.response.data;
      return Promise.reject({
        success: false,
        message: errData.message || 'An unexpected error occurred',
        errorCode: errData.errorCode || 'UNKNOWN_ERROR',
        status: error.response.status,
      });
    }
    return Promise.reject({
      success: false,
      message: error.message || 'Network error',
      errorCode: 'NETWORK_ERROR',
      status: 0,
    });
  }
);

// ── Token Management ─────────────────────────────────────────────

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
   * Check if a user is currently logged in.
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await getStoredToken();
    return !!token;
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
   * List products from catalog.
   */
  async getProducts(params?: {
    categoryId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: ProductData[]; total: number; page: number; total_pages: number }> {
    const response = await axiosInstance.get<ApiSuccessResponse<{ items: ProductData[]; total: number; page: number; total_pages: number }>>(
      '/api/products',
      { params }
    );
    return response.data.data;
  },

  /**
   * Get AI-recommended products for a disease and plant.
   */
  async getRecommendedProducts(payload: {
    disease_name: string;
    plant_name?: string;
    category?: string;
  }): Promise<ProductData[]> {
    const response = await axiosInstance.post<ApiSuccessResponse<ProductData[]>>(
      '/api/products/recommendations',
      payload
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
