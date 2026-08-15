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

// ── Configuration ────────────────────────────────────────────────

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
const TOKEN_KEY = '@plantify_auth_token';
const USER_KEY = '@plantify_auth_user';

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

async function saveAuthData(tokenData: TokenData): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, tokenData.access_token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(tokenData.user));
}

async function clearAuthData(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

async function getStoredUser(): Promise<AuthUser | null> {
  const userData = await AsyncStorage.getItem(USER_KEY);
  return userData ? JSON.parse(userData) : null;
}

async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
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
    const formData = new FormData();

    formData.append('image', {
      uri: imageUri,
      name: 'plant_scan.jpg',
      type: 'image/jpeg',
    } as any);

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
    const formData = new FormData();

    formData.append('image', {
      uri: imageUri,
      name: 'plant_identify.jpg',
      type: 'image/jpeg',
    } as any);

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
};

export default api;
