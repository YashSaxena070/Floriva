import WeatherCareCard from '@/components/WeatherCareCard';
import { getWateringCountdown } from '@/services/plantHealthService';
import { plantService } from '@/services/plantService';
import { getCurrentUserLocation } from '@/services/weatherService';
import { SQLitePlant as Plant } from '@/types/plant';
import { Camera } from 'expo-camera';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useRef, useState, useEffect } from 'react';
import { ActivityIndicator, Animated, Dimensions, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../_layout';

function formatChatMessage(text: string | null | undefined, textStyle: any) {
  if (!text) return null;
  const cleanStr = String(text).replace(/\*\*/g, '');
  const lines = cleanStr.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    let displayLine = line;
    if (trimmed.startsWith('* ')) {
      displayLine = '• ' + trimmed.slice(2);
    } else if (trimmed.startsWith('- ')) {
      displayLine = '• ' + trimmed.slice(2);
    }
    return (
      <Text key={idx} style={textStyle}>
        {displayLine}
      </Text>
    );
  });
}

const { width } = Dimensions.get('window');

// Data for Recent Scans
// Data for Categories
const CATEGORIES = [
  { id: '1', name: 'Indoor Plants', icon: require('@/assets/images/indoor.png') },
  { id: '2', name: 'Succulents', icon: require('@/assets/images/cactus.png') },
  { id: '3', name: 'Flowering', icon: require('@/assets/images/flower.png') },
  { id: '4', name: 'Medicinal', icon: require('@/assets/images/medicinal.png') },
  { id: '5', name: 'Trees', icon: require('@/assets/images/tree.png') },
];



export default function HomeScreen() {
  const router = useRouter();
  const { isLoggedIn, userName, recentScans, removeRecentScan, reminders, isDbSyncing, dbSyncProgress, dbSyncStatusText, savedPlants } = useUser();
  const [isNotiVisible, setIsNotiVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(width * 0.75)).current;
  const [currentCity, setCurrentCity] = useState<string | null>(null);

  // Fetch real location ONLY if logged in and permission is granted
  useEffect(() => {
    let isMounted = true;
    const checkUserLocation = async () => {
      if (!isLoggedIn) {
        if (isMounted) setCurrentCity(null);
        return;
      }
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await getCurrentUserLocation();
          if (isMounted && loc) {
            if (loc.city && loc.city !== 'Current Location') {
              setCurrentCity(loc.city);
            } else if (loc.region) {
              setCurrentCity(loc.region);
            } else {
              setCurrentCity('Local Area');
            }
          }
        } else {
          if (isMounted) setCurrentCity(null);
        }
      } catch {
        if (isMounted) setCurrentCity(null);
      }
    };
    checkUserLocation();
    return () => {
      isMounted = false;
    };
  }, [isLoggedIn]);

  // Category Explorer states
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryPlants, setCategoryPlants] = useState<Plant[]>([]);
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Search overlay states
  const [homeSearchQuery, setHomeSearchQuery] = useState('');
  const [homeSearchResults, setHomeSearchResults] = useState<Plant[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isExplorerFocused, setIsExplorerFocused] = useState(false);

  // Global Chat States
  const [isGlobalChatVisible, setIsGlobalChatVisible] = useState(false);
  const [globalChatMessages, setGlobalChatMessages] = useState<Array<{ id: string; sender: 'user' | 'ai'; text: string }>>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Hello! I am your AI Doctor 🩺. I am here to help you with any general plant care advice, disease diagnosis tips, watering schedules, or botanical questions. What is on your mind today?',
    },
  ]);
  const [globalChatInput, setGlobalChatInput] = useState('');
  const [isGlobalAiTyping, setIsGlobalAiTyping] = useState(false);

  const handleSendGlobalChatMessage = async (textToSend?: string) => {
    const msgText = textToSend || globalChatInput;
    if (!msgText.trim()) return;

    const userMsg = {
      id: String(Date.now()),
      sender: 'user' as const,
      text: msgText,
    };
    const updatedMessages = [...globalChatMessages, userMsg];
    setGlobalChatMessages(updatedMessages);
    setGlobalChatInput('');
    setIsGlobalAiTyping(true);

    try {
      const systemPrompt = `You are Plantify AI Doctor, a general botanical expert.
Help users with any general plant care advice, gardening tips, plant selection, disease symptoms, watering schedules, or general botanical questions.
Since this is a general consultation, give friendly, extremely helpful, and scientifically accurate answers.
If unsure, clearly say you're not certain.
Never invent facts.
Keep responses under 150 words.
Use bullet points whenever useful.`;

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages.map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text,
        })),
      ];

      const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY || '';
      if (!apiKey) {
        throw new Error('Groq API Key missing');
      }

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq API HTTP ${response.status}`);
      }

      const data = await response.json();
      const aiReply = data?.choices?.[0]?.message?.content?.trim();

      if (aiReply) {
        setGlobalChatMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + 1),
            sender: 'ai',
            text: aiReply,
          },
        ]);
      } else {
        throw new Error('Empty reply');
      }
    } catch (error) {
      console.warn('Groq API fetch failed:', error);
      let responseText = `I apologize, I am having trouble connecting right now. Keep your plants in healthy light and avoid overwatering. Let me know if you have other questions!`;
      setGlobalChatMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: 'ai',
          text: responseText,
        },
      ]);
    } finally {
      setIsGlobalAiTyping(false);
    }
  };

  const handleHomeSearch = async (query: string) => {
    setHomeSearchQuery(query);
    if (query.trim().length > 0) {
      const results = await plantService.searchPlants(query);
      setHomeSearchResults(results.slice(0, 10));
    } else {
      setHomeSearchResults([]);
    }
  };

  const handleCategoryPress = async (categoryName: string) => {
    const dbCategoryName = categoryName;

    setSelectedCategory(categoryName);
    setSearchQuery('');
    const plants = await plantService.getPlantsByCategory(dbCategoryName);
    setCategoryPlants(plants);
    setIsCategoryModalVisible(true);
  };

  // Generate dynamic notifications from reminders
  const FREQ_LABELS: Record<string, string> = {
    daily: 'daily',
    weekly: 'every week',
    every_2_weeks: 'every 2 weeks',
    monthly: 'every month',
    every_2_months: 'every 2 months',
  };
  const TIME_LABELS: Record<string, string> = {
    morning: '9:00 AM',
    noon: '12:00 PM',
    evening: '6:00 PM',
  };

  const dynamicNotifications = savedPlants.map((plant: any, idx: number) => {
    const matchingReminder = reminders.find((r: any) => r.plantName === plant.name);

    // Calculate water countdown for this specific plant
    const waterCountdown = getWateringCountdown({
      lastWateredDate: plant.lastWateredDate || matchingReminder?.lastWatered,
      watering: plant.watering,
      name: plant.name,
    });

    const isWateredToday = waterCountdown.status === 'watered_today';
    const isSnoozedActive = matchingReminder?.snoozedUntil && Date.now() < matchingReminder.snoozedUntil;

    let notificationTime = 'Due Today';
    let notificationBody = `Requires hydration today — scheduled care.`;

    if (isWateredToday) {
      notificationTime = 'Completed';
      notificationBody = `Plant has been hydrated today! Great job 🌿.`;
    } else if (isSnoozedActive) {
      notificationTime = 'Snoozed';
      notificationBody = `Watering reminder snoozed until ${new Date(matchingReminder.snoozedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
    } else if (waterCountdown.daysRemaining === 1) {
      notificationTime = 'Due Tomorrow';
      notificationBody = `Scheduled for watering tomorrow — prepare fresh water 💧.`;
    } else if (waterCountdown.daysRemaining > 1) {
      notificationTime = `Due in ${waterCountdown.daysRemaining} days`;
      notificationBody = `Scheduled for watering in ${waterCountdown.daysRemaining} days.`;
    }

    return {
      id: `water-plant-${plant.id || idx}`,
      title: isWateredToday ? `✅ ${plant.name} Watered` : `💧 Water ${plant.name}`,
      body: notificationBody,
      time: notificationTime,
      read: isWateredToday,
      type: 'water',
      plantName: plant.name,
      scientificName: plant.botanicalName || 'Dracaena trifasciata',
      imageUri: plant.imageUri || '',
    };
  });

  // Add scan notifications
  const scanNotifications = recentScans.slice(0, 3).map((scan: any, idx: number) => ({
    id: `scan-${idx}`,
    title: `🌿 ${scan.name} identified`,
    body: `${scan.botanicalName} — scan complete.`,
    time: scan.time || 'Recently',
    read: true,
    type: 'scan',
    plantName: scan.name,
    scientificName: scan.botanicalName || '',
    imageUri: scan.imageUri || '',
  }));

  const allNotifications = [...dynamicNotifications, ...scanNotifications];

  const openNotifications = () => {
    if (!isLoggedIn) {
      router.push('/login' as any);
      return;
    }
    setIsNotiVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeNotifications = () => {
    Animated.timing(slideAnim, {
      toValue: width * 0.75,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setIsNotiVisible(false);
    });
  };

  const handleScanCardPress = async () => {
    if (!isLoggedIn) {
      router.push({
        pathname: '/login' as any,
        params: { action: 'scan' },
      });
      return;
    }
    try {
      const { status } = await Camera.getCameraPermissionsAsync();
      if (status === 'granted') {
        router.push('/camera');
      } else {
        const { status: newStatus } = await Camera.requestCameraPermissionsAsync();
        if (newStatus === 'granted') {
          router.push('/camera');
        } else {
          alert('Camera permission is required to scan plants! 📸');
        }
      }
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      router.push('/camera');
    }
  };

  const handleUploadCardPress = () => {
    if (!isLoggedIn) {
      router.push({
        pathname: '/login' as any,
        params: { action: 'upload' },
      });
      return;
    }
    router.push('/upload-photo');
  };

  const handleNearbyPlantsPress = async () => {
    if (!isLoggedIn) {
      router.push({
        pathname: '/login' as any,
        params: { action: 'nearby' },
      });
      return;
    }
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        router.push('/nearby-plants');
      } else {
        router.push({
          pathname: '/location-permission',
          params: { action: 'nearby' }
        });
      }
    } catch (err) {
      console.warn('Error checking location permission:', err);
      router.push('/nearby-plants');
    }
  };

  const handleRecentScanPress = (item: any) => {
    // Navigate to plant details screen with full dynamic item parameters
    router.push({
      pathname: '/plant-details',
      params: {
        imageUri: item.imageUri ? encodeURIComponent(item.imageUri) : '',
        commonName: item.name,
        scientificName: item.botanicalName,
        confidence: item.confidence,
        plantResult: item.plantResult,
      }
    });
  };



  const renderGlobalChatbotModal = () => {
    return (
      <Modal
        visible={isGlobalChatVisible}
        animationType="slide"
        transparent={false}
        statusBarTranslucent={true}
        onRequestClose={() => setIsGlobalChatVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          style={{ flex: 1, backgroundColor: '#F8FBF7' }}
        >
          <StatusBar style="light" backgroundColor="#1E5322" translucent={true} />

          {/* Top Safe Area colored dark green to match header */}
          <SafeAreaView edges={['top']} style={{ backgroundColor: '#1E5322' }} />

          {/* Premium Header */}
          <SafeAreaView edges={['top']} style={chatStyles.chatHeader}>
            <View style={chatStyles.chatHeaderTopRow}>
              <TouchableOpacity
                style={chatStyles.chatBackBtn}
                onPress={() => setIsGlobalChatVisible(false)}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={chatStyles.chatHeaderTitle}>AI Doctor</Text>
              <View style={{ width: 36 }} />
            </View>
          </SafeAreaView>

          {/* Assistant Info Box */}
          <View style={chatStyles.chatPlantCard}>
            <Image
              source={require('@/assets/images/disease.png')}
              style={chatStyles.chatPlantThumb}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={chatStyles.chatPlantName}>Plantify AI Assistant</Text>
              <Text style={chatStyles.chatPlantScientific}>General Botanical Expert</Text>
            </View>
          </View>

          {/* Chat Messages List */}
          <ScrollView
            style={chatStyles.chatScrollView}
            contentContainerStyle={chatStyles.chatScrollContent}
            ref={(ref) => ref?.scrollToEnd({ animated: true })}
          >
            {globalChatMessages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  chatStyles.msgWrapper,
                  msg.sender === 'user' ? chatStyles.msgWrapperUser : chatStyles.msgWrapperAi
                ]}
              >
                {msg.sender === 'ai' && (
                  <View style={chatStyles.aiAvatar}>
                    <Text style={{ fontSize: 14 }}>🩺</Text>
                  </View>
                )}
                <View
                  style={[
                    chatStyles.msgBubble,
                    msg.sender === 'user' ? chatStyles.msgBubbleUser : chatStyles.msgBubbleAi
                  ]}
                >
                  <View style={{ flexShrink: 1 }}>
                    {formatChatMessage(msg.text, msg.sender === 'user' ? chatStyles.msgTextUser : chatStyles.msgTextAi)}
                  </View>
                </View>
              </View>
            ))}

            {isGlobalAiTyping && (
              <View style={[chatStyles.msgWrapper, chatStyles.msgWrapperAi]}>
                <View style={chatStyles.aiAvatar}>
                  <Text style={{ fontSize: 14 }}>🩺</Text>
                </View>
                <View style={[chatStyles.msgBubble, chatStyles.msgBubbleAi, chatStyles.typingBubble]}>
                  <Text style={[chatStyles.msgTextAi, { fontStyle: 'italic', color: '#8CA696' }]}>
                    AI Doctor is thinking...
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Suggestion Chips */}
          <View style={chatStyles.chipsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={chatStyles.chipsScroll}>
              {[
                { label: '🌱 General Care Tips', query: 'Can you give me some general indoor plant care tips?' },
                { label: '💧 Watering Schedule', query: 'How do I know when a plant needs water?' },
                { label: '🍂 Sick Plant Guide', query: 'My plant has brown/yellow leaves. What should I do?' },
                { label: '🏡 Indoor vs Outdoor', query: 'How do I choose between indoor and outdoor plants?' },
              ].map((chip, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={chatStyles.chipBtn}
                  onPress={() => handleSendGlobalChatMessage(chip.query)}
                >
                  <Text style={chatStyles.chipText}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Input Bar */}
          <View style={chatStyles.inputBar}>
            <TextInput
              style={chatStyles.textInput}
              placeholder="Ask AI Doctor a gardening question..."
              placeholderTextColor="#8CA696"
              value={globalChatInput}
              onChangeText={setGlobalChatInput}
              onSubmitEditing={() => handleSendGlobalChatMessage()}
            />
            <TouchableOpacity
              style={chatStyles.sendBtn}
              activeOpacity={0.8}
              onPress={() => handleSendGlobalChatMessage()}
            >
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Bottom Safe Area colored pure white */}
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#FFFFFF' }} />
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      {/* Top Header Bar */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <Image
            source={require('@/assets/images/leaf1.png')}
            style={styles.brandLogo}
            contentFit="contain"
          />
          <Text style={styles.brandText}>Plantify</Text>
        </View>

        {/* Real Location Pill: ONLY shown when logged in AND user granted location access */}
        {isLoggedIn && currentCity ? (
          <TouchableOpacity
            style={styles.locationHeaderPill}
            activeOpacity={0.8}
            onPress={() => router.push('/nearby-plants')}
          >
            <Ionicons name="location-sharp" size={13} color="#2D6A4F" />
            <Text style={styles.locationHeaderText} numberOfLines={1}>
              {currentCity}
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.notificationBtn}
          activeOpacity={0.7}
          onPress={openNotifications}
        >
          <Image
            source={require('@/assets/images/bell.png')}
            style={styles.notificationIconImage}
            contentFit="contain"
          />
          {allNotifications.filter((n) => !n.read).length > 0 && (
            <View style={styles.notiBadgeCount}>
              <Text style={styles.notiBadgeCountText}>
                {allNotifications.filter((n) => !n.read).length > 9
                  ? '9+'
                  : allNotifications.filter((n) => !n.read).length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {homeSearchQuery.trim().length > 0 ? (
        // Search Results Mode: Sticky Header + Scrollable Results
        <View style={styles.fixedSearchWrapper}>
          {/* Sticky search header area */}
          <View style={styles.stickySearchHeaderContainer}>
            <View style={styles.welcomeSearchRowSearchMode}>
              <View style={[styles.welcomeSearchLeft, { paddingRight: 0 }]}>
                {/* Welcome Text */}
                <View style={styles.rowWelcomeContainer}>
                  <Text style={styles.userGreeting}>{isLoggedIn ? `Hello ${userName} 👋` : 'Welcome 👋'}</Text>
                  <Text style={styles.headline}>What plant shall{'\n'}we discover today?</Text>
                </View>

                {/* Search Bar + Cross Button */}
                <View style={styles.searchBarRowSearchMode}>
                  <View style={[styles.rowSearchContainer, styles.rowSearchContainerFocused, { flex: 1, marginTop: 12, marginRight: 0 }]}>
                    <Image
                      source={require('@/assets/images/search.png')}
                      style={styles.searchIconImage}
                      contentFit="contain"
                    />
                    <TextInput
                      placeholder="Search by name, family, genus..."
                      placeholderTextColor="#8CA696"
                      style={[
                        styles.searchInput,
                        Platform.OS === 'web' && ({ outlineStyle: 'none', outlineWidth: 0 } as any)
                      ]}
                      value={homeSearchQuery}
                      onChangeText={handleHomeSearch}
                      autoFocus
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setHomeSearchQuery('');
                      setHomeSearchResults([]);
                    }}
                    style={styles.searchCrossButton}
                  >
                    <Text style={styles.searchCrossButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          {/* Scrollable Results */}
          <ScrollView
            style={styles.searchResultsScroll}
            contentContainerStyle={styles.searchResultsScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Search Results ({homeSearchResults.length})</Text>
            </View>

            {homeSearchResults.length === 0 ? (
              <View style={styles.searchEmptyContainer}>
                <Text style={{ fontSize: 32, marginBottom: 12 }}>🔍</Text>
                <Text style={styles.searchEmptyText}>No plants match your search. Try looking up another name!</Text>
              </View>
            ) : (
              <View style={styles.searchGrid}>
                {homeSearchResults.map((plant) => (
                  <TouchableOpacity
                    key={plant.id}
                    style={styles.searchResultCard}
                    activeOpacity={0.9}
                    onPress={() => router.push({
                      pathname: '/plant-details',
                      params: {
                        imageUri: plant.image_url ? encodeURIComponent(plant.image_url) : '',
                        commonName: plant.common_name,
                        scientificName: plant.scientific_name,
                        confidence: '100',
                        plantResult: JSON.stringify({
                          results: [{
                            score: 1.00,
                            species: {
                              scientificNameWithoutAuthor: plant.scientific_name,
                              commonNames: [plant.common_name]
                            }
                          }]
                        })
                      }
                    })}
                  >
                    <Image
                      source={plant.image_url ? { uri: plant.image_url } : require('@/assets/images/leaf.png')}
                      style={styles.searchResultImage}
                      contentFit={plant.image_url ? "cover" : "contain"}
                    />
                    <View style={styles.searchResultInfo}>
                      <Text style={styles.searchResultName} numberOfLines={1}>{plant.common_name}</Text>
                      <Text style={styles.searchResultBotanical} numberOfLines={1}>{plant.scientific_name}</Text>
                      <View style={styles.searchResultBadge}>
                        <Text style={styles.searchResultBadgeText}>{plant.care_level}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        // Normal scrollable home page
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Welcome Text & Search Bar Row */}
          <View style={styles.welcomeSearchRow}>
            <View style={styles.welcomeSearchLeft}>
              {/* Welcome Text */}
              <View style={styles.rowWelcomeContainer}>
                <Text style={styles.userGreeting}>{isLoggedIn ? `Hello ${userName} 👋` : 'Welcome 👋'}</Text>
                <Text style={styles.headline}>What plant shall{'\n'}we discover today?</Text>
              </View>

              {/* Search Bar */}
              <View style={[styles.rowSearchContainer, isSearchFocused && styles.rowSearchContainerFocused]}>
                <Image
                  source={require('@/assets/images/search.png')}
                  style={styles.searchIconImage}
                  contentFit="contain"
                />
                <TextInput
                  placeholder="Search by name, family, genus..."
                  placeholderTextColor="#8CA696"
                  style={[
                    styles.searchInput,
                    Platform.OS === 'web' && ({ outlineStyle: 'none', outlineWidth: 0 } as any)
                  ]}
                  value={homeSearchQuery}
                  onChangeText={handleHomeSearch}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                />
              </View>
            </View>

            <View style={styles.welcomeSearchRight}>
              <Image
                source={require('@/assets/images/home-2.png')}
                style={styles.headerPlantImage}
                contentFit="contain"
              />
            </View>
          </View>

          {/* Subtle Sync Indicator Banner */}
          {isDbSyncing && (
            <View style={styles.syncBanner}>
              <ActivityIndicator size="small" color="#4E8C44" style={{ marginRight: 8 }} />
              <Text style={styles.syncBannerText}>
                Syncing catalog database... {(dbSyncProgress * 100).toFixed(0)}%
              </Text>
            </View>
          )}

          <>
            {/* Scan Plant Banner Card */}
            <TouchableOpacity
              style={styles.scanBannerCard}
              activeOpacity={0.95}
              onPress={handleScanCardPress}
            >
              <View style={styles.scanCardLeft}>
                <View style={styles.scanCardHeaderRow}>
                  <View style={styles.scanCameraIconBg}>
                    <Image source={require('@/assets/images/camera.png')} style={styles.cardCameraIcon} contentFit="contain" tintColor="#FFFFFF" />
                  </View>
                  <View style={styles.scanCardTextContainer}>
                    <Text style={styles.scanCardTitle}>Scan a Plant</Text>
                    <Text style={styles.scanCardSub}>Identify any plant</Text>
                    <Text style={styles.scanCardSub}>in seconds.</Text>
                  </View>
                </View>
                <View style={styles.scanNowBtn}>
                  <Text style={styles.scanNowText}>Scan Now</Text>
                  <Image source={require('@/assets/images/next.png')} style={styles.scanNowIcon} contentFit="contain" tintColor="#FFFFFF" />
                </View>
              </View>
              <View style={styles.scanCardRight}>
                <Image
                  source={require('@/assets/images/plant-home.png')}
                  style={styles.scanMonsteraImage}
                  contentFit="contain"
                />
              </View>
            </TouchableOpacity>

            {/* Mini Grid Menu */}
            <View style={styles.gridRow}>
              {/* Upload Card */}
              <TouchableOpacity
                style={styles.gridCard}
                activeOpacity={0.9}
                onPress={handleUploadCardPress}
              >
                <View style={styles.gridIconBg}>
                  <Image source={require('@/assets/images/upload.png')} style={styles.gridIconImage} contentFit="contain" />
                </View>
                <View style={styles.gridTextContainer}>
                  <Text style={styles.gridCardTitle}>Upload Photo</Text>
                  <Text style={styles.gridCardSub}>Choose from your{'\n'}gallery</Text>
                </View>
                <View style={styles.gridArrow}>
                  <Image source={require('@/assets/images/next.png')} style={styles.gridArrowIcon} contentFit="contain" />
                </View>
              </TouchableOpacity>

              {/* Nearby Plants Card */}
              <TouchableOpacity
                style={[styles.gridCard, styles.nearbyCard]}
                activeOpacity={0.9}
                onPress={handleNearbyPlantsPress}
              >
                <View style={[styles.gridIconBg, styles.nearbyIconBg]}>
                  <Image source={require('@/assets/images/location.png')} style={styles.gridIconImage} contentFit="contain" />
                </View>
                <View style={styles.gridTextContainer}>
                  <Text style={styles.gridCardTitle}>Nearby Plants</Text>
                  <Text style={styles.gridCardSub}>Discover plants that{'\n'}grow well near you</Text>
                </View>
                <View style={[styles.gridArrow, styles.nearbyArrow]}>
                  <Image source={require('@/assets/images/next.png')} style={styles.gridArrowIcon} contentFit="contain" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Weather Care Card - Sky Blue Container */}
            <WeatherCareCard />

            {/* Recent Scans Section */}
            {recentScans.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recent Scans</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalScrollContent}
                >
                  {recentScans.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.scanItemCard}
                      activeOpacity={0.9}
                      onPress={() => handleRecentScanPress(item)}
                    >
                      <View style={styles.scanItemInner}>
                        {/* Remove button */}
                        <TouchableOpacity
                          style={styles.scanRemoveBtn}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={(e) => {
                            e.stopPropagation();
                            removeRecentScan(item.id);
                          }}
                        >
                          <Text style={styles.scanRemoveText}>✕</Text>
                        </TouchableOpacity>

                        {item.imageUri ? (
                          <Image
                            source={{ uri: item.imageUri }}
                            style={styles.scanItemImg}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.scanItemImgPlaceholder, { backgroundColor: item.bgColor }]}>
                            <Text style={styles.scanItemEmoji}>{item.emoji}</Text>
                          </View>
                        )}
                        <View style={styles.scanItemDetails}>
                          <Text style={styles.scanItemName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.scanItemBotanical} numberOfLines={1}>{item.botanicalName}</Text>
                          <Text style={styles.scanItemTime}>{item.time}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Explore Categories Section */}
            <Text style={[styles.sectionTitle, styles.categoryTitle]}>Explore Categories</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesScrollContent}
              style={{ marginBottom: 16 }}
            >
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.catItem}
                  activeOpacity={0.8}
                  onPress={() => handleCategoryPress(cat.name)}
                >
                  <View style={styles.catIconBg}>
                    <Image
                      source={cat.icon}
                      style={styles.catIconImage}
                      contentFit="contain"
                    />
                  </View>
                  <Text style={styles.catLabel}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        </ScrollView>
      )}

      {/* Notifications Sidebar Modal */}
      <Modal
        visible={isNotiVisible}
        transparent
        animationType="fade"
        onRequestClose={closeNotifications}
      >
        <View style={styles.modalContainer}>
          {/* Backdrop Overlay */}
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={closeNotifications}
          />

          {/* Sliding Sidebar */}
          <Animated.View style={[styles.sidebarContainer, { transform: [{ translateX: slideAnim }] }]}>
            <View style={styles.sidebarHeader}>
              <View style={styles.sidebarHeaderLeft}>
                <Image
                  source={require('@/assets/images/bell.png')}
                  style={{ width: 22, height: 22, marginRight: 8 }}
                  tintColor="#4E8C44"
                  contentFit="contain"
                />
                <Text style={styles.sidebarHeading}>Notification</Text>
              </View>
              <TouchableOpacity style={styles.sidebarCloseBtn} onPress={closeNotifications}>
                <Text style={styles.sidebarCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.notiList} showsVerticalScrollIndicator={false}>
              {allNotifications.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 36, marginBottom: 12 }}>🔔</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C3A27', marginBottom: 6 }}>No notifications yet</Text>
                  <Text style={{ fontSize: 12, color: '#718E7B', textAlign: 'center', lineHeight: 18 }}>Scan plants and set care reminders to receive notifications here.</Text>
                </View>
              ) : (
                allNotifications.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.notiItem, !item.read && styles.notiUnread]}
                    activeOpacity={item.time === 'Completed' ? 1 : 0.8}
                    disabled={item.time === 'Completed'}
                    onPress={() => {
                      if (item.type === 'water') {
                        closeNotifications();
                        router.push({
                          pathname: '/smart-watering',
                          params: {
                            plantName: item.plantName,
                            scientificName: item.scientificName,
                            imageUri: item.imageUri ? encodeURIComponent(item.imageUri) : '',
                          }
                        });
                      }
                    }}
                  >
                    <View style={styles.notiHeaderRow}>
                      <Text style={styles.notiTitle}>{item.title}</Text>
                      <Text style={styles.notiTime}>{item.time}</Text>
                    </View>
                    <Text style={styles.notiBody}>{item.body}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* Category Plants Explorer Modal */}
      <Modal
        visible={isCategoryModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsCategoryModalVisible(false)}
      >
        <SafeAreaView style={styles.explorerModalContainer} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={styles.explorerHeader}>
            <TouchableOpacity
              style={styles.explorerBackBtn}
              onPress={() => setIsCategoryModalVisible(false)}
            >
              <Image
                source={require('@/assets/images/next.png')}
                style={{ width: 18, height: 18, transform: [{ rotate: '180deg' }] }}
                tintColor="#1C3A27"
                contentFit="contain"
              />
            </TouchableOpacity>
            <Text style={styles.explorerHeaderTitle}>{selectedCategory}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Search Bar inside Explorer */}
          <View style={[styles.explorerSearchContainer, isExplorerFocused && styles.explorerSearchContainerFocused]}>
            <Image
              source={require('@/assets/images/search.png')}
              style={styles.explorerSearchIcon}
              contentFit="contain"
            />
            <TextInput
              placeholder={`Search in ${selectedCategory}...`}
              placeholderTextColor="#8CA696"
              style={styles.explorerSearchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setIsExplorerFocused(true)}
              onBlur={() => setIsExplorerFocused(false)}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={styles.explorerClearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Plant Grid */}
          <FlatList
            data={categoryPlants.filter(p => p.common_name.toLowerCase().includes(searchQuery.toLowerCase()) || p.scientific_name.toLowerCase().includes(searchQuery.toLowerCase()))}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            contentContainerStyle={styles.explorerGridContent}
            columnWrapperStyle={styles.explorerGridRow}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.explorerEmptyContainer}>
                <Text style={{ fontSize: 32, marginBottom: 12 }}>🔍</Text>
                <Text style={styles.explorerEmptyText}>No plants found matching "{searchQuery}"</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.explorerPlantCard}
                activeOpacity={0.9}
                onPress={() => {
                  setIsCategoryModalVisible(false);
                  router.push({
                    pathname: '/plant-details',
                    params: {
                      imageUri: item.image_url ? encodeURIComponent(item.image_url) : '',
                      commonName: item.common_name,
                      scientificName: item.scientific_name,
                      confidence: '98.5',
                      plantResult: JSON.stringify({
                        results: [
                          {
                            score: 0.985,
                            species: {
                              scientificNameWithoutAuthor: item.scientific_name,
                              commonNames: [item.common_name]
                            }
                          }
                        ]
                      })
                    }
                  });
                }}
              >
                {!(selectedCategory === 'Indoor Plants' || selectedCategory === 'Succulents' || selectedCategory === 'Medicinal') && (
                  <Image
                    source={item.image_url ? { uri: item.image_url } : require('@/assets/images/leaf.png')}
                    style={styles.explorerPlantImage}
                    contentFit={item.image_url ? "cover" : "contain"}
                  />
                )}
                <View style={styles.explorerPlantInfo}>
                  <Text style={styles.explorerPlantName} numberOfLines={1}>{item.common_name}</Text>
                  <Text style={styles.explorerPlantBotanical} numberOfLines={1}>{item.scientific_name}</Text>
                  <View style={styles.explorerPlantFooter}>
                    <View style={styles.explorerDifficultyBadge}>
                      <Text style={styles.explorerDifficultyText}>{item.care_level}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* Floating Ask AI Button */}
      <TouchableOpacity
        style={styles.floatingAskAiBtn}
        activeOpacity={0.85}
        onPress={() => setIsGlobalChatVisible(true)}
      >
        <Ionicons name="sparkles" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {renderGlobalChatbotModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EAF6EC',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#EAF6EC',
    borderBottomWidth: 0,
  },
  locationHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
    maxWidth: '45%',
    borderWidth: 1,
    borderColor: '#D4E6D2',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  locationHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2D6A4F',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandLogo: {
    width: 20,
    height: 20,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
  },
  notificationBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FBF7',
    position: 'relative',
  },
  notiBadgeCount: {
    position: 'absolute',
    top: -1,
    right: -1,
    backgroundColor: '#DC2626',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  notiBadgeCountText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  notificationIconImage: {
    width: 24,
    height: 24,
  },
  scrollContent: {
    paddingBottom: 110, // space for tab bar
  },
  welcomeContainer: {
    paddingHorizontal: 24,
    marginTop: 20,
  },
  userGreeting: {
    fontSize: 15,
    fontWeight: '600',
    color: '#718E7B',
  },
  headline: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C3A27',
    marginTop: 6,
    lineHeight: 30,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginTop: 20,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2EBE0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchIconImage: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1C3A27',
    fontWeight: '500',
    padding: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any
    })
  },
  scanBannerCard: {
    flexDirection: 'row',
    backgroundColor: '#e0e8e9ff',
    marginHorizontal: 24,
    marginTop: 20,
    borderRadius: 24,
    padding: 20,
    height: 150,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C4DEC0',
    borderStyle: 'dashed',
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  welcomeSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 10,
    position: 'relative',
    minHeight: 180,
  },
  welcomeSearchLeft: {
    flex: 1,
    paddingRight: 120,
  },
  welcomeSearchRight: {
    position: 'absolute',
    right: 10,
    bottom: -15,
    width: 175,
    height: 175,
  },
  rowWelcomeContainer: {
    marginTop: 10,
  },
  rowSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginRight: 25,
    marginTop: 16,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2EBE0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  },
  rowSearchContainerFocused: {
    borderColor: '#7DA676',
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  headerPlantImage: {
    marginVertical: -23,
    width: '140%',
    height: '100%',
  },
  scanCardLeft: {
    flex: 1.2,
    justifyContent: 'center',
  },
  scanCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  scanCardTextContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  scanCameraIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#769371ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardCameraIcon: {
    width: 28,
    height: 28,
  },
  scanCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C3A27',
  },
  scanCardSub: {
    fontSize: 12,
    color: '#637269ff',
    marginTop: 2,
    lineHeight: 16,
  },
  scanNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4E8C44',
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  scanNowText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    marginRight: 4,
  },
  scanNowIcon: {
    width: 10,
    height: 10,
    marginLeft: 2,
  },
  scanCardRight: {
    flex: 0.8,
    justifyContent: 'flex-end',
  },
  scanMonsteraImage: {
    width: '140%',
    height: '140%',
    bottom: -34,
    right: 25,
  },
  scanMonsteraPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanMonsteraEmoji: {
    fontSize: 60,
  },
  gridRow: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginTop: 16,
    gap: 16,
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EBF2EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  gridIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F8F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridIconImage: {
    width: 20,
    height: 20,
  },
  nearbyIconBg: {
    backgroundColor: '#FFFFFF',
  },
  nearbyCard: {
    backgroundColor: '#EAF2FD',
    borderColor: '#D0E1FD',
  },
  nearbyArrow: {
    backgroundColor: '#FFFFFF',
  },
  gridTextContainer: {
    marginTop: 12,
  },
  gridCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C3A27',
  },
  gridCardSub: {
    fontSize: 10,
    color: '#718E7B',
    marginTop: 2,
    lineHeight: 13,
  },
  gridArrow: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F3F8F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridArrowIcon: {
    width: 8,
    height: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
  },
  categoryTitle: {
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 14,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7DA676',
  },
  horizontalScrollContent: {
    paddingLeft: 24,
    paddingRight: 8,
    paddingVertical: 12,
  },
  scanItemCard: {
    width: 150,
    height: 196,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#EBF2EA',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  scanItemInner: {
    flex: 1,
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  scanRemoveBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanRemoveText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  scanItemImg: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: 19,
    borderTopRightRadius: 19,
  },
  scanItemImgPlaceholder: {
    width: '100%',
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 19,
    borderTopRightRadius: 19,
  },
  scanItemEmoji: {
    fontSize: 44,
  },
  scanItemDetails: {
    padding: 12,
  },
  scanItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C3A27',
  },
  scanItemBotanical: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#718E7B',
    marginTop: 2,
  },
  scanItemTime: {
    fontSize: 9,
    color: '#8CA696',
    fontWeight: '600',
    marginTop: 6,
  },
  categoriesScrollContent: {
    paddingLeft: 24,
    paddingRight: 8,
  },
  catItem: {
    alignItems: 'center',
    marginRight: 20,
    width: 72,
  },
  catIconBg: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#EBF4EA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  catIconImage: {
    width: 24,
    height: 24,
  },
  catLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1C3A27',
    marginTop: 8,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sidebarContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: width * 0.75,
    backgroundColor: '#FFFFFF',
    paddingTop: 40,
    paddingHorizontal: 20,
    shadowColor: '#1C3A27',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 16,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
    marginBottom: 20,
  },
  sidebarHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sidebarHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
  },
  sidebarCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F8F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebarCloseText: {
    fontSize: 14,
    color: '#718E7B',
    fontWeight: '700',
  },
  notiList: {
    flex: 1,
  },
  notiItem: {
    padding: 14,
    backgroundColor: '#F8FBF7',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EBF2EA',
  },
  notiUnread: {
    backgroundColor: '#F0F7EF',
    borderColor: '#D8EAD4',
  },
  notiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notiTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C3A27',
  },
  notiTime: {
    fontSize: 9,
    color: '#8CA696',
    fontWeight: '600',
  },
  notiBody: {
    fontSize: 10,
    color: '#718E7B',
    lineHeight: 14,
  },
  explorerModalContainer: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  explorerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  explorerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  explorerHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
  },
  explorerSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6EFE6',
    height: 46,
  },
  explorerSearchContainerFocused: {
    borderColor: '#7DA676',
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  explorerSearchIcon: {
    width: 18,
    height: 18,
    marginRight: 10,
  },
  explorerSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1C3A27',
    fontWeight: '500',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any
    })
  },
  explorerClearText: {
    fontSize: 12,
    color: '#8CA696',
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  explorerGridContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 40,
  },
  explorerGridRow: {
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  explorerPlantCard: {
    width: (width - 40) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E6EFE6',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  explorerPlantImage: {
    width: '100%',
    height: 120,
  },
  explorerPlantInfo: {
    padding: 12,
  },
  explorerPlantName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C3A27',
  },
  explorerPlantBotanical: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#718E7B',
    marginTop: 2,
  },
  explorerPlantFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  explorerDifficultyBadge: {
    backgroundColor: '#EBF4EA',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  explorerDifficultyText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#4E8C44',
  },
  explorerEmptyContainer: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  explorerEmptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#718E7B',
    textAlign: 'center',
    lineHeight: 18,
  },
  homeSectionContainer: {
    marginBottom: 22,
  },
  sqlitePlantCard: {
    width: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E6EFE6',
    marginRight: 14,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  sqlitePlantImg: {
    width: '100%',
    height: 100,
  },
  sqlitePlantInfo: {
    padding: 10,
  },
  sqlitePlantName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C3A27',
  },
  sqlitePlantBotanical: {
    fontSize: 9,
    fontStyle: 'italic',
    color: '#718E7B',
    marginTop: 2,
  },
  sqlitePlantBadge: {
    backgroundColor: '#EBF4EA',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  sqlitePlantBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#4E8C44',
  },
  searchResultsContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  searchEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  searchEmptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#718E7B',
    textAlign: 'center',
    lineHeight: 18,
  },
  searchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  searchResultCard: {
    width: (width - 54) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EBF2EA',
    marginBottom: 16,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  searchResultImage: {
    width: '100%',
    height: 110,
  },
  searchResultInfo: {
    padding: 10,
  },
  searchResultName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C3A27',
  },
  searchResultBotanical: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#718E7B',
    marginTop: 2,
  },
  searchResultBadge: {
    backgroundColor: '#EBF4EA',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  searchResultBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#4E8C44',
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF4EA',
    marginHorizontal: 24,
    marginTop: -8,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D0E5CE',
  },
  syncBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E5034',
  },
  fixedSearchWrapper: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  stickySearchHeaderContainer: {
    backgroundColor: '#F8FBF7',
    borderBottomWidth: 1,
    borderBottomColor: '#E2EBE0',
    paddingBottom: 16,
    zIndex: 100,
  },
  welcomeSearchRowSearchMode: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 10,
    position: 'relative',
  },
  searchBarRowSearchMode: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchCrossButton: {
    padding: 10,
    marginLeft: 8,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2EBE0',
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  },
  searchCrossButtonText: {
    color: '#8CA696',
    fontWeight: 'bold',
    fontSize: 15,
  },
  searchResultsScroll: {
    flex: 1,
  },
  searchResultsScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  floatingAskAiBtn: {
    position: 'absolute',
    bottom: 76,
    right: 20,
    backgroundColor: '#1E1E20', // light black / premium dark charcoal
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
});

const chatStyles = StyleSheet.create({
  chatContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  chatHeader: {
    backgroundColor: '#1E5322',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: '#1E5322',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  chatHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  chatPlantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    borderLeftWidth: 4,
    borderLeftColor: '#1E5322',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  chatPlantThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D0E0CE',
    backgroundColor: '#F8FBF7',
  },
  chatPlantName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C3A27',
  },
  chatPlantScientific: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#718E7B',
    marginTop: 1,
  },
  chatScrollView: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: '#F8FBF7',
  },
  chatScrollContent: {
    paddingVertical: 16,
  },
  msgWrapper: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '92%',
  },
  msgWrapperUser: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  msgWrapperAi: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
    paddingRight: 12,
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EBF4EA',
    borderWidth: 1.2,
    borderColor: '#C0DCCA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 2,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  msgBubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexShrink: 1,
  },
  msgBubbleUser: {
    backgroundColor: '#1E5322',
    borderBottomRightRadius: 4,
    shadowColor: '#1E5322',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  msgBubbleAi: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1.2,
    borderColor: '#E2EBE0',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  typingBubble: {
    backgroundColor: '#F3F8F2',
    borderColor: '#E2EBE0',
  },
  msgTextUser: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 20,
    flexShrink: 1,
  },
  msgTextAi: {
    color: '#1C3A27',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 20,
    flexShrink: 1,
  },
  chipsContainer: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F5EF',
    backgroundColor: '#FFFFFF',
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chipBtn: {
    backgroundColor: '#F3F8F2',
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1C3A27',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F5EF',
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F8FBF7',
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    fontSize: 13.5,
    color: '#1C3A27',
    fontWeight: '600',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E5322',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E5322',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
});
