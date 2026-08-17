import { FontAwesome6, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { api, PlantData } from '@/services/api';
import { plantService } from '@/services/plantService';
import { resolveLocalUri } from '@/services/uriHelper';

// Helper to check if string is a valid UUID
const isUUID = (str: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// Create User Context
export const UserContext = createContext({
  userName: 'User',
  setUserName: (name: string) => { },
  scansCount: 0,
  setScansCount: (count: number) => { },
  userAvatar: null as string | null,
  setUserAvatar: (avatar: string) => { },
  userEmail: '',
  setUserEmail: (email: string) => { },
  savedPlants: [] as any[],
  savePlant: async (plant: any): Promise<void> => { },
  removePlant: async (id: string): Promise<void> => { },
  recentScans: [] as any[],
  addRecentScan: (scan: any) => { },
  removeRecentScan: (id: string) => { },
  reminders: [] as any[],
  saveReminder: (reminder: any) => { },
  addHealthScan: (plantName: string, score: number, imageUri?: string, categoryRatings?: any) => { },
  updateCategoryRatings: (plantName: string, ratings: any) => { },
  logout: async () => { },
  refreshUserData: async () => { },
  isLoadingUserData: false,
  isDbSyncing: false,
  dbSyncProgress: 0,
  dbSyncStatusText: '',
});

// Custom hook to consume context
export const useUser = () => useContext(UserContext);

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [userName, setUserName] = useState('User');
  const [scansCount, setScansCount] = useState(0);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [savedPlants, setSavedPlants] = useState<any[]>([]);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [isLoadingUserData, setIsLoadingUserData] = useState(false);

  // Syncing states for SQLite catalog
  const [isDbSyncing, setIsDbSyncing] = useState(false);
  const [dbSyncProgress, setDbSyncProgress] = useState(0);
  const [dbSyncStatusText, setDbSyncStatusText] = useState('');

  // Start SQLite botanical catalog synchronization in the background on startup
  useEffect(() => {
    const runBackgroundSync = async () => {
      try {
        const needsSync = await plantService.initializeDatabase();
        if (needsSync) {
          setIsDbSyncing(true);
          await plantService.downloadAndSyncPlants((prog, text) => {
            setDbSyncProgress(prog);
            setDbSyncStatusText(text);
          });
          setIsDbSyncing(false);
        }
      } catch (err) {
        console.warn('Background database synchronization failed:', err);
        setIsDbSyncing(false);
      }
    };
    runBackgroundSync();
  }, []);

  /**
   * Refreshes all user data dynamically from the PostgreSQL database.
   * Completely bypasses and purges client-side AsyncStorage caching.
   */
  const refreshUserData = useCallback(async () => {
    setIsLoadingUserData(true);
    try {
      const isAuthed = await api.isAuthenticated();
      if (!isAuthed) {
        setUserName('User');
        setUserEmail('');
        setUserAvatar(null);
        setSavedPlants([]);
        setRecentScans([]);
        setReminders([]);
        setScansCount(0);
        return;
      }

      // 1. Fetch authenticated user profile from Backend DB
      try {
        const user = await api.getMe();
        if (user) {
          setUserName(user.name || user.email.split('@')[0]);
          setUserEmail(user.email);
        }
      } catch (err) {
        console.warn('Could not fetch user profile from DB:', err);
      }

      // 2. Fetch authenticated user's plants directly from Backend DB
      try {
        const dbPlants: PlantData[] = await api.getPlants();
        if (Array.isArray(dbPlants)) {
          const mapped = dbPlants.map((p) => ({
            id: p.id,
            name: p.name,
            botanicalName: p.scientific_name || p.name,
            imageUri: p.image_url || resolveLocalUri(p.image_url) || 'https://images.unsplash.com/photo-1596547609652-9cf5d8d76921?q=80&w=300&auto=format&fit=crop',
            confidence: p.identification_confidence ? Math.round(p.identification_confidence * 100) : 95,
            nextWatering: 'In 3 days',
            lastScannedDate: new Date(p.created_at).getTime(),
            created_at: p.created_at,
          }));

          setSavedPlants(mapped);
          setScansCount(mapped.length);
          setRecentScans(mapped.slice(0, 8));

          // Auto-generate active reminders for the user's saved plants
          const plantReminders = mapped.map((plant) => ({
            plantName: plant.name,
            wateringFreq: 'daily',
            wateringTime: 'morning',
            fertilizerFreq: 'none',
            enableNotifications: true,
            lastWatered: Date.now() - 24 * 60 * 60 * 1000,
            snoozedUntil: undefined,
          }));
          setReminders(plantReminders);
        } else {
          setSavedPlants([]);
          setRecentScans([]);
          setReminders([]);
          setScansCount(0);
        }
      } catch (err) {
        console.warn('Could not fetch user plants from DB:', err);
        setSavedPlants([]);
        setRecentScans([]);
        setReminders([]);
        setScansCount(0);
      }
    } catch (err) {
      console.error('Failed to refresh user data from DB:', err);
    } finally {
      setIsLoadingUserData(false);
    }
  }, []);

  // On App Launch: Purge old AsyncStorage plant/scan cache and load from DB
  useEffect(() => {
    const initializeAppData = async () => {
      try {
        // Clean out legacy persisted AsyncStorage keys to prevent stale data leakage
        await AsyncStorage.multiRemove([
          '@saved_plants',
          '@recent_scans',
          '@reminders',
          '@total_scans_count',
          '@user_name',
          '@user_email',
          '@user_avatar',
          '@cached_plants',
        ]);
      } catch (err) {
        console.warn('AsyncStorage legacy cache cleanup warning:', err);
      }

      // Fetch clean user data from database
      await refreshUserData();
    };

    initializeAppData();
  }, [refreshUserData]);

  const updateUserName = (name: string) => {
    setUserName(name);
  };

  const updateUserAvatar = (avatar: string) => {
    setUserAvatar(avatar);
  };

  const updateUserEmail = (email: string) => {
    setUserEmail(email);
  };

  /**
   * Saves a plant to the Backend DB and updates local in-memory state.
   */
  const savePlant = async (plant: any) => {
    try {
      const fixedPlant = {
        ...plant,
        imageUri: resolveLocalUri(plant.imageUri) || plant.imageUri,
        lastScannedDate: plant.lastScannedDate || Date.now(),
      };

      // Optimistic in-memory update
      setSavedPlants((prev) => {
        const alreadyExists = prev.some((p) => p.name === fixedPlant.name);
        if (alreadyExists) {
          return prev.map((p) => p.name === fixedPlant.name ? { ...p, ...fixedPlant } : p);
        }
        return [...prev, fixedPlant];
      });

      // Create reminder in memory
      setReminders((prevRem) => {
        if (prevRem.some((r) => r.plantName === fixedPlant.name)) return prevRem;
        return [...prevRem, {
          plantName: fixedPlant.name,
          wateringFreq: 'daily',
          wateringTime: 'morning',
          fertilizerFreq: 'none',
          enableNotifications: true,
          lastWatered: Date.now() - 24 * 60 * 60 * 1000,
          snoozedUntil: undefined,
        }];
      });

      // Persist to Backend Database
      const isAuthed = await api.isAuthenticated();
      if (isAuthed) {
        try {
          const confidenceDecimal = fixedPlant.confidence ? (fixedPlant.confidence > 1 ? fixedPlant.confidence / 100 : fixedPlant.confidence) : 0.95;
          const created = await api.createPlant({
            name: fixedPlant.name,
            scientific_name: fixedPlant.botanicalName || fixedPlant.name,
            identification_confidence: confidenceDecimal,
            image_url: typeof fixedPlant.imageUri === 'string' ? fixedPlant.imageUri : undefined,
          });

          if (created && created.id) {
            // Update the local plant ID with the real backend DB UUID
            setSavedPlants((prev) =>
              prev.map((p) => (p.name === fixedPlant.name ? { ...p, id: created.id } : p))
            );
          }
        } catch (dbErr) {
          console.warn('Backend DB plant save error:', dbErr);
        }
      }
    } catch (err) {
      console.error('Failed to save plant:', err);
    }
  };

  /**
   * Removes a plant from the Backend DB and updates local in-memory state.
   */
  const removePlant = async (id: string) => {
    try {
      // Optimistic in-memory update
      setSavedPlants((prev) => prev.filter((p) => p.id !== id));

      // Remove from backend DB if it has a valid DB UUID
      if (isUUID(id)) {
        const isAuthed = await api.isAuthenticated();
        if (isAuthed) {
          try {
            await api.deletePlant(id);
          } catch (dbErr) {
            console.warn('Backend DB plant delete error:', dbErr);
          }
        }
      }
    } catch (err) {
      console.error('Failed to remove plant:', err);
    }
  };

  const addRecentScan = (scan: any) => {
    const fixedScan = {
      ...scan,
      imageUri: resolveLocalUri(scan.imageUri) || scan.imageUri,
    };
    setRecentScans((prev) => {
      const filtered = prev.filter((s) => s.name !== fixedScan.name);
      return [fixedScan, ...filtered].slice(0, 8);
    });
    setScansCount((prev) => prev + 1);
  };

  const removeRecentScan = (id: string) => {
    setRecentScans((prev) => prev.filter((s) => s.id !== id));
  };

  const saveReminder = (reminder: any) => {
    setReminders((prev) => {
      const filtered = prev.filter((r) => r.plantName !== reminder.plantName);
      return [...filtered, reminder];
    });
  };

  const addHealthScan = (
    plantName: string,
    score: number,
    imageUri?: string,
    categoryRatings?: { water: number; sunlight: number; humidity: number; growth: number; overall: number }
  ) => {
    setSavedPlants((prev) =>
      prev.map((p) => {
        if (p.name === plantName || p.botanicalName === plantName) {
          const history = Array.isArray(p.healthHistory) ? p.healthHistory : [];
          return {
            ...p,
            confidence: score,
            lastScannedDate: Date.now(),
            imageUri: imageUri || p.imageUri,
            healthHistory: [...history, { date: Date.now(), score: Math.round(score) }],
            categoryRatings: categoryRatings || p.categoryRatings,
          };
        }
        return p;
      })
    );
  };

  const updateCategoryRatings = (
    plantName: string,
    ratings: { water?: number; sunlight?: number; humidity?: number; growth?: number; overall?: number }
  ) => {
    setSavedPlants((prev) =>
      prev.map((p) => {
        if (p.name === plantName || p.botanicalName === plantName) {
          const currentRatings = p.categoryRatings || { water: 4, sunlight: 4, humidity: 3, growth: 3, overall: 4 };
          return {
            ...p,
            categoryRatings: { ...currentRatings, ...ratings },
          };
        }
        return p;
      })
    );
  };

  const logout = async () => {
    try {
      await api.logout();
      // Reset all user data in state
      setUserName('User');
      setUserEmail('');
      setUserAvatar(null);
      setSavedPlants([]);
      setRecentScans([]);
      setReminders([]);
      setScansCount(0);
    } catch (err) {
      console.error('Failed to log out:', err);
    }
  };

  const [loaded, error] = useFonts({
    ...Ionicons.font,
    'Ionicons': require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'),
    ...MaterialCommunityIcons.font,
    'Material Design Icons': require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),
    'MaterialCommunityIcons': require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),
    ...FontAwesome6.font,
  });

  useEffect(() => {
    if (error) {
      console.warn('Font loading error in Expo:', error);
    }
  }, [error]);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <UserContext.Provider value={{
      userName,
      setUserName: updateUserName,
      scansCount,
      setScansCount,
      userAvatar,
      setUserAvatar: updateUserAvatar,
      userEmail,
      setUserEmail: updateUserEmail,
      savedPlants,
      savePlant,
      removePlant,
      recentScans,
      addRecentScan,
      removeRecentScan,
      reminders,
      saveReminder,
      addHealthScan,
      updateCategoryRatings,
      logout,
      refreshUserData,
      isLoadingUserData,
      isDbSyncing,
      dbSyncProgress,
      dbSyncStatusText,
    }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="location-permission" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="upload-photo" />
          <Stack.Screen name="camera" />
          <Stack.Screen name="upload-progress" />
          <Stack.Screen name="ai-analysis" />
          <Stack.Screen name="plant-details" />
          <Stack.Screen name="care-reminder" />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </UserContext.Provider>
  );
}

