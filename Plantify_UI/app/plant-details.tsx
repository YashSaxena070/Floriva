import BottomTabBar from '@/components/BottomTabBar';
import CircularProgress from '@/components/CircularProgress';
import { getDatabase } from '@/database/sqlite';
import { plantRepository } from '@/repositories/plantRepository';
import { analyzePlantHealth, getWateringCountdown } from '@/services/plantHealthService';
import { getResolvedImageSource, resolveLocalUri } from '@/services/uriHelper';
import { SQLitePlant } from '@/types/plant';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Dimensions, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from './_layout';

const { width } = Dimensions.get('window');

function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\*/g, '');
}

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

const PERENUAL_API_KEY = process.env.EXPO_PUBLIC_PERENUAL_API_KEY || process.env.PERENUAL_API_KEY || '';
const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY || '';

const getWaterDetails = (watering?: string) => {
  if (!watering) return null;
  const w = watering.toLowerCase();
  if (w.includes('frequent') || w.includes('high')) {
    return { title: 'Frequent', desc: 'Keep soil moist consistently' };
  }
  if (w.includes('minimum') || w.includes('low') || w.includes('dry')) {
    return { title: 'Minimum', desc: 'Allow soil to dry out completely' };
  }
  if (w.includes('average') || w.includes('medium') || w.includes('moderate')) {
    return { title: 'Average', desc: 'Water when topsoil feels dry' };
  }
  return { title: watering, desc: 'Check soil moisture before watering' };
};

const getLightDetails = (sunlightStr?: string) => {
  if (!sunlightStr) return null;
  try {
    let list: string[] = [];
    if (sunlightStr.trim().startsWith('[')) {
      list = JSON.parse(sunlightStr) as string[];
    } else {
      list = [sunlightStr];
    }
    if (!list || list.length === 0) return null;
    const primary = list[0];
    const fullDesc = list.join(', ');
    const listLower = list.map(s => s.toLowerCase());

    if (listLower.some(s => s.includes('full sun')) && !listLower.some(s => s.includes('part shade') || s.includes('indirect') || s.includes('shade'))) {
      return { title: 'Full Sun', desc: 'Thrives in direct sunlight' };
    }
    if (listLower.some(s => s.includes('shade') || s.includes('low light'))) {
      return { title: primary, desc: `Prefers ${fullDesc.toLowerCase()}` };
    }
    return { title: primary, desc: 'Avoid harsh direct sun' };
  } catch (e) {
    return { title: sunlightStr, desc: 'Avoid harsh direct sun' };
  }
};

const getTempDetails = (plant?: SQLitePlant | null) => {
  if (!plant) return { title: '18°C - 25°C', desc: 'Standard room temperature' };
  const lowerCommon = (plant.common_name || '').toLowerCase();
  const isSucculent = lowerCommon.includes('cactus') || lowerCommon.includes('succulent') || lowerCommon.includes('aloe') || plant.drought_tolerant === 1;
  const isIndoor = plant.indoor === 1;

  if (isSucculent) {
    return { title: '20°C - 30°C', desc: 'Warm temperature lover' };
  }
  if (isIndoor) {
    return { title: '18°C - 24°C', desc: 'Standard room temperature' };
  }
  return { title: '10°C - 25°C', desc: 'Tolerates cooler drafts' };
};

const getAgeDetails = (plant?: SQLitePlant | null) => {
  if (!plant) return { title: '5 - 15 Years', desc: 'Multi-year growing cycle' };
  const cycleLower = (plant.cycle || '').toLowerCase();
  const familyLower = (plant.family || '').toLowerCase();
  const nameLower = (plant.common_name || '').toLowerCase();
  const isTree = familyLower.includes('sapindaceae') || nameLower.includes('maple') || nameLower.includes('tree') || nameLower.includes('oak') || nameLower.includes('willow') || nameLower.includes('fir');

  if (cycleLower.includes('annual')) {
    return { title: '1 Year', desc: 'Completes life cycle in one season' };
  }
  if (isTree) {
    return { title: '50+ Years', desc: 'Very long-lived outdoor tree' };
  }
  if (plant.indoor === 1) {
    return { title: '5 - 15 Years', desc: 'Long-lasting houseplant' };
  }
  return { title: '3 - 10 Years', desc: 'Multi-year growing cycle' };
};

const getPlantTip = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('snake')) {
    return "Snake Plant is one of the best air purifiers and releases oxygen at night. Perfect for your bedroom!";
  }
  if (lower.includes('aloe')) {
    return "Aloe Vera gel can be used to soothe burns and cuts. Keep it in a bright spot near your kitchen!";
  }
  if (lower.includes('monstera')) {
    return "Monstera leaves love moderate humidity. Wipe them with a damp cloth to help them photosynthesize!";
  }
  if (lower.includes('rose')) {
    return "Prune roses in early spring to encourage fresh blooms and maintain shape.";
  }
  return `${name} thrives in consistent conditions. Keep it away from dry heating vents and drafty windows.`;
};

export default function PlantDetailsScreen() {
  const router = useRouter();
  const {
    imageUri: rawImageUri,
    fromFlow,
    fromGarden,
    showHealthScoreDirectly,
    commonName = 'Snake Plant',
    scientificName = 'Sansevieria trifasciata',
    confidence = '96.2',
    plantResult,
    healthScore,
    healthStatus,
    lastScannedDate,
    nextWatering,
    scanId: paramScanId,
  } = useLocalSearchParams<{
    imageUri?: string;
    fromFlow?: string;
    fromGarden?: string;
    showHealthScoreDirectly?: string;
    commonName?: string;
    scientificName?: string;
    confidence?: string;
    plantResult?: string;
    healthScore?: string;
    healthStatus?: string;
    lastScannedDate?: string;
    nextWatering?: string;
    scanId?: string;
  }>();

  const imageUri = rawImageUri ? decodeURIComponent(rawImageUri) : undefined;

  // Extract scan_id and healthAnalysis from plantResult if available
  let extractedScanId = paramScanId || '';
  let extractedHealthAnalysis: any = null;
  if (plantResult) {
    try {
      const parsed = JSON.parse(plantResult);
      if (parsed.scan_id && !extractedScanId) extractedScanId = parsed.scan_id;
      if (parsed.healthAnalysis) extractedHealthAnalysis = parsed.healthAnalysis;
    } catch (e) { /* ignore parse errors */ }
  }

  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  const [activeTab, setActiveTab] = useState('Overview');
  const { savedPlants, savePlant, removePlant, addRecentScan, addHealthScan, updateCategoryRatings, reminders } = useUser();

  const isAlreadySaved = savedPlants.some((p) => p.name === commonName);
  const [isSaved, setIsSaved] = useState(isAlreadySaved);

  // Extract details from plantResult
  let otherNames = '';
  if (plantResult) {
    try {
      const parsed = JSON.parse(plantResult);
      const match = parsed.results?.[0];
      const names = match?.species?.commonNames;
      if (names && names.length > 1) {
        otherNames = `Also called ${names.slice(1, 4).join(', ')}`;
      }
    } catch (e) {
      console.warn(e);
    }
  }
  if (!otherNames) {
    otherNames = commonName === 'Snake Plant' ? "Also called Mother-in-law's Tongue" : `Identification match score: ${confidence}%`;
  }

  // Find a matching stock image from our category dataset if available
  const getStockImage = (name: string) => {
    const lowerName = name.toLowerCase();
    const matches: Record<string, string> = {
      'snake plant': 'https://images.unsplash.com/photo-1596547609652-9cf5d8d76921?q=80&w=500&auto=format&fit=crop',
      'peace lily': 'https://images.unsplash.com/photo-1593696140826-c58b021acf8b?q=80&w=500&auto=format&fit=crop',
      'monstera': 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=500&auto=format&fit=crop',
      'pothos': 'https://images.unsplash.com/photo-1596436889106-be35e843f974?q=80&w=500&auto=format&fit=crop',
      'aloe vera': 'https://images.unsplash.com/photo-1596547610051-fb1fbe7556f8?q=80&w=500&auto=format&fit=crop',
      'jade plant': 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?q=80&w=500&auto=format&fit=crop',
      'zebra': 'https://images.unsplash.com/photo-1508849789987-4e5333c12b78?q=80&w=500&auto=format&fit=crop',
      'cactus': 'https://images.unsplash.com/photo-1508849789987-4e5333c12b78?q=80&w=500&auto=format&fit=crop',
      'rose': 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=500&auto=format&fit=crop',
      'orchid': 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?q=80&w=500&auto=format&fit=crop',
      'lavender': 'https://images.unsplash.com/photo-1528826722805-8b18a5104c38?q=80&w=500&auto=format&fit=crop',
      'tulsi': 'https://images.unsplash.com/photo-1578159812516-e5c6a1e80931?q=80&w=500&auto=format&fit=crop',
      'basil': 'https://images.unsplash.com/photo-1578159812516-e5c6a1e80931?q=80&w=500&auto=format&fit=crop',
      'mint': 'https://images.unsplash.com/photo-1532704100644-55d379f5176c?q=80&w=500&auto=format&fit=crop',
      'rosemary': 'https://images.unsplash.com/photo-1594313525287-f83196f73a38?q=80&w=500&auto=format&fit=crop',
      'fiddle': 'https://images.unsplash.com/photo-1597055181300-e3633a207518?q=80&w=500&auto=format&fit=crop',
      'fig': 'https://images.unsplash.com/photo-1597055181300-e3633a207518?q=80&w=500&auto=format&fit=crop',
      'bonsai': 'https://images.unsplash.com/photo-1512428813833-df70f77a6b6c?q=80&w=500&auto=format&fit=crop',
      'maple': 'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?q=80&w=500&auto=format&fit=crop',
    };

    for (const key of Object.keys(matches)) {
      if (lowerName.includes(key)) {
        return matches[key];
      }
    }
    return null;
  };

  const [sqliteDetail, setSqliteDetail] = useState<SQLitePlant | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isHealthModalVisible, setIsHealthModalVisible] = useState(false);
  const toastAnim = useRef(new Animated.Value(-120)).current;

  const handleBackPress = () => {
    if (fromGarden === 'true') {
      router.replace('/(tabs)/my-garden');
    } else if (fromFlow === 'true' || showHealthScoreDirectly === 'true') {
      router.replace('/(tabs)');
    } else {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    }
  };

  useEffect(() => {
    const onBackPress = () => {
      handleBackPress();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [fromGarden, fromFlow, showHealthScoreDirectly]);

  const handleStarPress = (categoryKey: string, newRating: number) => {
    updateCategoryRatings(commonName, { [categoryKey]: newRating });
  };

  const renderStars = (categoryKey: 'water' | 'sunlight' | 'humidity' | 'growth' | 'overall', score: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity
          key={i}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          onPress={() => handleStarPress(categoryKey, i)}
        >
          <Ionicons
            name="star"
            size={20}
            color={i <= score ? "#E5A93C" : "#E2EBE0"}
            style={{ marginLeft: 3 }}
          />
        </TouchableOpacity>
      );
    }
    return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{stars}</View>;
  };

  const getCategoryStars = (score: number) => {
    if (score >= 92) return { water: 5, sunlight: 5, humidity: 4, growth: 4, overall: 5 };
    if (score >= 85) return { water: 4, sunlight: 4, humidity: 4, growth: 3, overall: 4 };
    if (score >= 75) return { water: 4, sunlight: 3, humidity: 3, growth: 3, overall: 4 };
    if (score >= 65) return { water: 3, sunlight: 3, humidity: 3, growth: 2, overall: 3 };
    return { water: 2, sunlight: 2, humidity: 2, growth: 2, overall: 2 };
  };

  const waterData = getWaterDetails(sqliteDetail?.watering);
  const lightData = getLightDetails(sqliteDetail?.sunlight);
  const tempData = getTempDetails(sqliteDetail);
  const ageData = getAgeDetails(sqliteDetail);
  const dynamicTabs = sqliteDetail ? ['Overview', 'Care Guide', 'Health', 'About', 'Did You Know?'] : ['Overview'];

  // AI Chatbot State & Logic
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; sender: 'user' | 'ai'; text: string }>>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Hello! I am your AI Doctor 🩺. I am ready to help you with your ${commonName}. Feel free to ask me anything about its health or care!`,
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);

  const handleSendChatMessage = async (textToSend?: string) => {
    const msgText = textToSend || chatInput;
    if (!msgText.trim()) return;

    const userMsg = {
      id: String(Date.now()),
      sender: 'user' as const,
      text: msgText,
    };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setIsAiTyping(true);

    try {
      const systemPrompt = `You are Plantify AI.

You are an experienced plant expert.

Current Plant Consultation Context:
• Common Name: "${commonName}"
• Botanical / Scientific Name: "${scientificName}"
${sqliteDetail?.watering ? `• Watering Preference: ${sqliteDetail.watering}` : ''}
${sqliteDetail?.sunlight ? `• Sunlight Preference: ${sqliteDetail.sunlight}` : ''}
${sqliteDetail?.care_level ? `• Care Level: ${sqliteDetail.care_level}` : ''}

Help users with:
• watering
• sunlight
• fertilizer
• pests
• diseases
• propagation
• pruning
• indoor plants
• outdoor plants
• flowering
• vegetables
• herbs
• succulents

If unsure, clearly say you're not certain.

Never invent facts.

Keep responses under 150 words.

Use bullet points whenever useful.

Suggest preventive care tips.

Do not answer non-plant questions.`;

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages.map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text,
        })),
      ];

      const apiKey = GROQ_API_KEY;
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
        const errText = await response.text();
        console.warn('Groq API Error Response:', errText);
        throw new Error(`Groq API HTTP ${response.status}`);
      }

      const data = await response.json();
      const aiReply = data?.choices?.[0]?.message?.content?.trim();

      if (aiReply) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + 1),
            sender: 'ai',
            text: aiReply,
          },
        ]);
      } else {
        throw new Error('Empty reply from Groq');
      }
    } catch (error) {
      console.warn('Groq API fetch failed, falling back to local Doctor response:', error);
      let responseText = `Regarding your ${commonName} (${scientificName}): Keep it in optimal light and check topsoil moisture before watering.`;
      const query = msgText.toLowerCase();

      if (query.includes('water') || query.includes('watering')) {
        responseText = `Watering advice for ${commonName}: ${waterData ? waterData.title + ' - ' + waterData.desc : 'Water thoroughly when the topsoil feels dry. Avoid soggy roots.'}`;
      } else if (query.includes('light') || query.includes('sun') || query.includes('sunlight')) {
        responseText = `Sunlight advice for ${commonName}: ${lightData ? lightData.title + ' - ' + lightData.desc : 'Keep in bright, indirect sunlight. Avoid direct, scorching afternoon sun.'}`;
      } else if (query.includes('issue') || query.includes('sick') || query.includes('yellow') || query.includes('brown')) {
        responseText = `Health issues for ${commonName}: Check for proper drainage. Yellow or brown tips usually point to watering issues (either overwatering or underwatering). Make sure you check soil moisture!`;
      } else if (query.includes('toxic') || query.includes('pet') || query.includes('dog') || query.includes('cat')) {
        const toxicPets = sqliteDetail?.poisonous_to_pets === 1 ? 'is toxic to pets' : 'is pet-friendly';
        const toxicHumans = sqliteDetail?.poisonous_to_humans === 1 ? 'is mildly toxic to humans' : 'is safe for humans';
        responseText = `Toxicity report: The ${commonName} (${scientificName}) ${toxicPets} and ${toxicHumans}.`;
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: 'ai',
          text: responseText,
        },
      ]);
    } finally {
      setIsAiTyping(false);
    }
  };

  const renderChatbotModal = () => {
    return (
      <Modal
        visible={isChatVisible}
        animationType="slide"
        transparent={false}
        statusBarTranslucent={true}
        onRequestClose={() => setIsChatVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          style={{ flex: 1, backgroundColor: '#F8FBF7' }}
        >
          <StatusBar style="light" backgroundColor="#1E5322" translucent={true} />

          {/* Premium Header with top safe area padding */}
          <SafeAreaView edges={['top']} style={chatStyles.chatHeader}>
            <View style={chatStyles.chatHeaderTopRow}>
              <TouchableOpacity
                style={chatStyles.chatBackBtn}
                onPress={() => setIsChatVisible(false)}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={chatStyles.chatHeaderTitle}>AI Doctor</Text>
              <View style={{ width: 36 }} />
            </View>
          </SafeAreaView>

          {/* Plant Info Box (Flower part in the white part below header) */}
          <View style={chatStyles.chatPlantCard}>
            <Image
              source={getResolvedImageSource(imageUri || sqliteDetail?.image_url, commonName, !!imageUri)}
              style={chatStyles.chatPlantThumb}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={chatStyles.chatPlantName}>{cleanText(commonName) || 'Plant'}</Text>
              <Text style={chatStyles.chatPlantScientific}>{cleanText(scientificName) || 'Botanic name'}</Text>
            </View>
          </View>

          {/* Chat Messages List */}
          <ScrollView
            style={chatStyles.chatScrollView}
            contentContainerStyle={chatStyles.chatScrollContent}
            ref={(ref) => ref?.scrollToEnd({ animated: true })}
          >
            {chatMessages.map((msg) => (
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

            {isAiTyping && (
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
                { label: '💧 Watering Needs', query: 'How much water does it need?' },
                { label: '☀️ Light Requirements', query: 'What sunlight is best?' },
                { label: '🐶 Safe for Pets?', query: 'Is it pet-friendly or toxic?' },
                { label: '🍂 Yellow Leaves?', query: 'Why are leaves yellowing or turning brown?' },
              ].map((chip, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={chatStyles.chipBtn}
                  onPress={() => handleSendChatMessage(chip.query)}
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
              placeholder="Ask AI Doctor about plant health..."
              placeholderTextColor="#8CA696"
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={() => handleSendChatMessage()}
            />
            <TouchableOpacity
              style={chatStyles.sendBtn}
              activeOpacity={0.8}
              onPress={() => handleSendChatMessage()}
            >
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Bottom Phone Navigation Tabs */}
          <BottomTabBar />

          {/* Bottom Safe Area colored pure white to match the tab bar */}
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#FFFFFF' }} />
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  // Retrieve detailed metadata from SQLite or Perenual API
  useEffect(() => {
    const fetchExtraDetails = async () => {
      try {
        const db = await getDatabase();
        // 1. Check if we already have it locally
        let row = await db.getFirstAsync<SQLitePlant>(
          'SELECT * FROM Plants WHERE common_name LIKE ? OR scientific_name LIKE ?',
          [`%${commonName}%`, `%${scientificName}%`]
        );

        // 2. If not found locally, construct a detailed local record using PlantNet identification data
        if (!row) {
          try {
            const normalizedCommon = commonName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const mapped: SQLitePlant = {
              id: Date.now() + Math.floor(Math.random() * 1000),
              common_name: normalizedCommon,
              scientific_name: scientificName,
              family: 'Plantaceae',
              genus: scientificName.split(' ')[0] || 'Genus',
              cycle: 'Perennial',
              watering: 'Average',
              sunlight: JSON.stringify(["Part shade", "Indirect light"]),
              indoor: 1,
              poisonous_to_humans: 0,
              poisonous_to_pets: 0,
              care_level: 'Medium',
              growth_rate: 'Regular',
              drought_tolerant: 0,
              salt_tolerant: 0,
              medicinal: 0,
              edible: 0,
              description: `A beautiful and unique plant specimen of ${normalizedCommon} (${scientificName}). Highly appreciated for its foliage and ornamental value.`,
              image_url: imageUri || '',
              thumbnail_url: imageUri || '',
            };

            await plantRepository.savePlant(mapped);
            row = mapped;
          } catch (genErr) {
            console.warn('Failed to generate local plant details:', genErr);
          }
        }

        let finalImageUri = imageUri || null;
        if (row) {
          const fixedRow = {
            ...row,
            image_url: resolveLocalUri(row.image_url) || row.image_url,
            thumbnail_url: resolveLocalUri(row.thumbnail_url) || row.thumbnail_url,
          };
          setSqliteDetail(fixedRow);
          // If we don't have a user uploaded image, use the official database image
          if (!finalImageUri && fixedRow.image_url) {
            finalImageUri = fixedRow.image_url;
          }
        }

        // Add to recent scans using the official image URI
        addRecentScan({
          id: String(Date.now()),
          name: commonName,
          botanicalName: scientificName,
          time: 'Just now',
          emoji: '🌿',
          bgColor: '#E2F0DE',
          imageUri: finalImageUri,
          confidence: confidence,
          plantResult: plantResult || null,
        });
      } catch (err) {
        console.warn('Error reading SQLite details:', err);
      }
    };

    fetchExtraDetails();
  }, [commonName, scientificName, imageUri, confidence, plantResult]);

  const triggerToast = () => {
    setShowToast(true);
    Animated.spring(toastAnim, {
      toValue: 30,
      useNativeDriver: true,
      tension: 40,
      friction: 8,
    }).start();

    setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setShowToast(false);
      });
    }, 2500);
  };

  const handleSaveToggle = () => {
    if (!isSaved) {
      const initialScore = healthAnalysis.healthScore;
      savePlant({
        id: String(Date.now()),
        name: commonName,
        botanicalName: scientificName,
        imageUri: imageUri || sqliteDetail?.image_url || 'https://images.unsplash.com/photo-1596547609652-9cf5d8d76921?q=80&w=300&auto=format&fit=crop',
        nextWatering: 'In 3 days',
        healthStatus: healthAnalysis.healthStatus,
        confidence: initialScore,
        plantResult: plantResult || null,
        healthHistory: [{ date: Date.now(), score: initialScore }],
      });
      setIsSaved(true);
      triggerToast();
    } else {
      const plantToRemove = savedPlants.find((p) => p.name === commonName);
      if (plantToRemove) {
        removePlant(plantToRemove.id);
      }
      setIsSaved(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out the ${commonName} on Plantify! ${confidence}% Match!`,
      });
    } catch (error) {
      console.log(error);
    }
  };

  const savedPlantMatch = savedPlants.find((p: any) => p.name === commonName || (p.botanicalName && p.botanicalName === scientificName));
  const parsedLastScan = lastScannedDate ? parseInt(lastScannedDate, 10) : undefined;
  const effectiveLastScan = parsedLastScan || savedPlantMatch?.lastScannedDate;

  const healthAnalysis = analyzePlantHealth({
    confidence: confidence || savedPlantMatch?.confidence,
    lastScannedDate: effectiveLastScan,
    name: commonName,
    botanicalName: scientificName,
    watering: sqliteDetail?.watering || savedPlantMatch?.watering,
  });

  const defaultCategoryStars = getCategoryStars(healthAnalysis.healthScore);
  const categoryStars = {
    water: savedPlantMatch?.categoryRatings?.water ?? defaultCategoryStars.water,
    sunlight: savedPlantMatch?.categoryRatings?.sunlight ?? defaultCategoryStars.sunlight,
    humidity: savedPlantMatch?.categoryRatings?.humidity ?? defaultCategoryStars.humidity,
    growth: savedPlantMatch?.categoryRatings?.growth ?? defaultCategoryStars.growth,
    overall: savedPlantMatch?.categoryRatings?.overall ?? defaultCategoryStars.overall,
  };

  const waterCountdown = getWateringCountdown({
    lastWateredDate: savedPlantMatch?.lastWateredDate || reminders.find((r: any) => r.plantName === commonName)?.lastWatered,
    wateringIntervalDays: healthAnalysis.wateringDays,
    watering: sqliteDetail?.watering || savedPlantMatch?.watering,
    name: commonName,
  });

  if (showHealthScoreDirectly === 'true') {
    return (
      <SafeAreaView style={styles.healthModalContainer} edges={['top', 'bottom']}>
        <StatusBar style="dark" />

        {/* Modal Top Bar */}
        <View style={styles.healthModalHeader}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={handleBackPress}
          >
            <Ionicons name="arrow-back" size={24} color="#1C3A27" />
          </TouchableOpacity>
          <Text style={styles.healthModalTitle}>Plant Health Score</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={handleShare}>
            <Ionicons name="ellipsis-horizontal" size={24} color="#1C3A27" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.healthModalScroll} showsVerticalScrollIndicator={false}>
          {/* Gauge */}
          <View style={styles.gaugeContainer}>
            <CircularProgress
              size={170}
              strokeWidth={14}
              percentage={healthAnalysis.healthScore}
              color={healthAnalysis.isOverdue10Days ? "#DC2626" : "#1E5322"}
              bgColor="#E2EBE0"
              textSize={38}
            />
            <Text style={[styles.gaugeStatus, healthAnalysis.isOverdue10Days && { color: '#DC2626' }, { marginTop: 16 }]}>
              {healthAnalysis.isOverdue10Days ? 'Urgent Health Check' : healthAnalysis.healthStatus}
            </Text>
            <Text style={styles.gaugeSub}>
              {healthAnalysis.healthScore >= 90 ? 'Your plant is in great shape!' : 'Care required for optimal growth.'}
            </Text>
          </View>

          {/* Plant Issue & Care Schedule Card */}
          <View style={styles.issueDiagnosisCard}>
            <View style={styles.issueHeaderRow}>
              <View style={styles.issueBadge}>
                <Ionicons name="sparkles" size={14} color="#1E5322" />
                <Text style={styles.issueBadgeText}>AI Health Diagnosis</Text>
              </View>
              <View style={styles.waterSchedulePill}>
                <Ionicons name="water" size={13} color="#0369A1" />
                <Text style={styles.waterScheduleText}>{healthAnalysis.wateringScheduleText}</Text>
              </View>
            </View>
            <Text style={styles.issueTitleText}>{healthAnalysis.issueTitle}</Text>
            <Text style={styles.issueDescText}>{healthAnalysis.issueDescription}</Text>
          </View>

          {/* Weekly / Overdue Rescan Prompt Card */}
          <View style={[styles.rescanPromptCard, healthAnalysis.isOverdue10Days && styles.rescanOverdue10Card]}>
            <View style={styles.rescanHeaderRow}>
              <Ionicons name={healthAnalysis.isOverdue10Days ? "alert-circle" : "camera"} size={20} color={healthAnalysis.isOverdue10Days ? "#DC2626" : "#1E5322"} />
              <Text style={[styles.rescanPromptTitle, healthAnalysis.isOverdue10Days && { color: '#B91C1C' }]}>
                {healthAnalysis.isOverdue10Days ? '🚨 Urgent: Scan Overdue (>10 Days)' : 'Weekly Health Scan'}
              </Text>
            </View>
            <Text style={[styles.rescanPromptDesc, healthAnalysis.isOverdue10Days && { color: '#991B1B' }]}>
              {healthAnalysis.isOverdue10Days
                ? 'This plant has not been scanned in over 10 days! Take a fresh photo now to update health diagnosis & score.'
                : 'Scan your existing plant every week to track foliage growth, check for issues, and keep your health score accurate!'}
            </Text>
            <TouchableOpacity
              style={[styles.rescanActionButton, healthAnalysis.isOverdue10Days && { backgroundColor: '#DC2626' }]}
              activeOpacity={0.85}
              onPress={() => router.push({
                pathname: '/upload-photo',
                params: {
                  isRescan: 'true',
                  targetPlantName: commonName,
                }
              })}
            >
              <Ionicons name="camera-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.rescanActionButtonText}>Rescan Plant Now 📸</Text>
            </TouchableOpacity>
          </View>

          {/* Ratings Card */}
          <View style={styles.healthBreakdownCard}>
            {/* Water */}
            <View style={styles.ratingRow}>
              <View style={styles.ratingRowLeft}>
                <Ionicons name="water" size={20} color="#498EC5" style={{ marginRight: 10 }} />
                <Text style={styles.ratingRowLabel}>Water</Text>
              </View>
              {renderStars('water', categoryStars.water)}
            </View>

            <View style={styles.ratingRowDivider} />

            {/* Sunlight */}
            <View style={styles.ratingRow}>
              <View style={styles.ratingRowLeft}>
                <Ionicons name="sunny" size={20} color="#D89E3A" style={{ marginRight: 10 }} />
                <Text style={styles.ratingRowLabel}>Sunlight</Text>
              </View>
              {renderStars('sunlight', categoryStars.sunlight)}
            </View>

            <View style={styles.ratingRowDivider} />

            {/* Humidity */}
            <View style={styles.ratingRow}>
              <View style={styles.ratingRowLeft}>
                <Ionicons name="water-outline" size={20} color="#498EC5" style={{ marginRight: 10 }} />
                <Text style={styles.ratingRowLabel}>Humidity</Text>
              </View>
              {renderStars('humidity', categoryStars.humidity)}
            </View>

            <View style={styles.ratingRowDivider} />

            {/* Growth */}
            <View style={styles.ratingRow}>
              <View style={styles.ratingRowLeft}>
                <Ionicons name="leaf" size={20} color="#4E8C44" style={{ marginRight: 10 }} />
                <Text style={styles.ratingRowLabel}>Growth</Text>
              </View>
              {renderStars('growth', categoryStars.growth)}
            </View>

            <View style={styles.ratingRowDivider} />

            {/* Overall Health */}
            <View style={styles.ratingRow}>
              <View style={styles.ratingRowLeft}>
                <Ionicons name="shield-checkmark" size={20} color="#4E8C44" style={{ marginRight: 10 }} />
                <Text style={styles.ratingRowLabel}>Overall Health</Text>
              </View>
              {renderStars('overall', categoryStars.overall)}
            </View>
          </View>
        </ScrollView>

        {/* Bottom Button */}
        <View style={styles.healthModalFooter}>
          <TouchableOpacity
            style={styles.healthModalButton}
            activeOpacity={0.85}
            onPress={() => {
              router.push({
                pathname: '/plant-health-timeline',
                params: {
                  plantName: commonName,
                  scientificName,
                  currentScore: String(healthAnalysis.healthScore),
                }
              });
            }}
          >
            <Text style={styles.healthModalButtonText}>View Health Timeline</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (fromGarden === 'true') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />

        {showToast && (
          <Animated.View style={[styles.toastContainer, { transform: [{ translateY: toastAnim }] }]}>
            <Image
              source={require('@/assets/images/leaf1.png')}
              style={styles.toastIcon}
              contentFit="contain"
            />
            <Text style={styles.toastText}>{commonName} added to My Garden! 🌿</Text>
          </Animated.View>
        )}

        {/* Top Navigation */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={handleBackPress}
          >
            <Ionicons name="arrow-back" size={24} color="#1C3A27" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={22} color="#1C3A27" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Plant Overview Row */}
          <View style={styles.plantHeaderCard}>
            <Image
              source={getResolvedImageSource(imageUri || sqliteDetail?.image_url, commonName, !!imageUri)}
              style={styles.detailsPlantImg}
            />
            <View style={styles.detailsPlantInfo}>
              <Text style={styles.detailsCommonName}>{commonName}</Text>
              <View style={styles.scientificNameRow}>
                <Text style={styles.detailsScientificName}>{scientificName}</Text>
                <TouchableOpacity>
                  <Ionicons name="pencil-outline" size={16} color="#718E7B" />
                </TouchableOpacity>
              </View>
              <View style={styles.healthBadge}>
                <Text style={styles.healthBadgeText}>Healthy</Text>
              </View>
            </View>
          </View>

          {/* Health Score Card */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => setIsHealthModalVisible(true)}
          >
            <View style={styles.healthScoreCardHeader}>
              <Text style={styles.healthScoreLabel}>Health Score</Text>
            </View>
            <View style={styles.healthScoreCardContent}>
              <CircularProgress
                size={60}
                strokeWidth={4.5}
                percentage={healthAnalysis.healthScore}
                color={healthAnalysis.isOverdue10Days ? "#DC2626" : (healthAnalysis.healthScore >= 90 ? "#4E8C44" : "#D89E3A")}
                bgColor="#E2EBE0"
                textSize={13}
              />
              <Text style={[styles.healthStatusText, healthAnalysis.isOverdue10Days && { color: '#DC2626' }]}>
                {healthAnalysis.isOverdue10Days ? 'Urgent Scan' : (healthStatus || healthAnalysis.healthStatus)}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Quick Care metrics card */}
          <View style={styles.card}>
            <View style={styles.careMetricsContainer}>
              {/* Water Column */}
              <View style={styles.metricColumn}>
                <Ionicons name="water" size={22} color="#498EC5" />
                <Text style={styles.metricLabel}>Water</Text>
                <Text style={styles.metricValue}>{waterData ? waterData.title : (nextWatering ? `Next:\n${nextWatering}` : 'Every 6–7 days')}</Text>
              </View>

              <View style={styles.verticalDivider} />

              {/* Sunlight Column */}
              <View style={styles.metricColumn}>
                <Ionicons name="sunny" size={22} color="#D89E3A" />
                <Text style={styles.metricLabel}>Sunlight</Text>
                <Text style={styles.metricValue}>{lightData ? lightData.title : 'Low to Bright\nIndirect'}</Text>
              </View>

              <View style={styles.verticalDivider} />

              {/* Humidity Column */}
              <View style={styles.metricColumn}>
                <Ionicons name="water-outline" size={22} color="#498EC5" />
                <Text style={styles.metricLabel}>Humidity</Text>
                <Text style={styles.metricValue}>40–60%</Text>
              </View>
            </View>
          </View>

          {/* Accordions menu card */}
          <View style={styles.menuCard}>
            {/* About Plant */}
            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.8}
              onPress={() => toggleSection('about')}
            >
              <Text style={styles.menuRowText}>About Plant</Text>
              <Ionicons
                name={expandedSection === 'about' ? 'chevron-down' : 'chevron-forward'}
                size={18}
                color="#8CA696"
              />
            </TouchableOpacity>
            {expandedSection === 'about' && (
              <View style={styles.accordionContent}>
                <Text style={styles.accordionText}>
                  {cleanText(sqliteDetail?.description) || 'A resilient and beautiful plant known for its striking foliage and easy-to-care nature. Perfect for adding a fresh green aesthetic to any space.'}
                </Text>
              </View>
            )}

            {/* Care Guide */}
            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.8}
              onPress={() => toggleSection('care')}
            >
              <Text style={styles.menuRowText}>Care Guide</Text>
              <Ionicons
                name={expandedSection === 'care' ? 'chevron-down' : 'chevron-forward'}
                size={18}
                color="#8CA696"
              />
            </TouchableOpacity>
            {expandedSection === 'care' && (
              <View style={styles.accordionContent}>
                <Text style={styles.accordionText}>
                  <Text style={{ fontWeight: '700' }}>• Watering: </Text>{waterData ? `${waterData.title} (${waterData.desc})` : 'Water when topsoil feels dry.'}{'\n'}
                  <Text style={{ fontWeight: '700' }}>• Sunlight: </Text>{lightData ? `${lightData.title} (${lightData.desc})` : 'Avoid harsh direct sun.'}{'\n'}
                  <Text style={{ fontWeight: '700' }}>• Temperature: </Text>{tempData ? `${tempData.title} (${tempData.desc})` : 'Standard room temperature.'}{'\n'}
                  <Text style={{ fontWeight: '700' }}>• Care Level: </Text>{sqliteDetail ? `${sqliteDetail.care_level}` : 'Medium care needed.'}
                </Text>
              </View>
            )}

            {/* Common Issues */}
            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.8}
              onPress={() => toggleSection('issues')}
            >
              <Text style={styles.menuRowText}>Common Issues</Text>
              <Ionicons
                name={expandedSection === 'issues' ? 'chevron-down' : 'chevron-forward'}
                size={18}
                color="#8CA696"
              />
            </TouchableOpacity>
            {expandedSection === 'issues' && (
              <View style={styles.accordionContent}>
                <Text style={styles.accordionText}>
                  <Text style={{ fontWeight: '700' }}>• Overwatering: </Text>Yellowing leaves and soft stems. Let soil dry out completely.{'\n'}
                  <Text style={{ fontWeight: '700' }}>• Underwatering: </Text>Wrinkled leaves or dry brown tips. Water thoroughly.{'\n'}
                  <Text style={{ fontWeight: '700' }}>• Dust buildup: </Text>Wipe leaves once a month with a damp cloth to encourage sunlight absorption.
                </Text>
              </View>
            )}

            {/* Toxicity */}
            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.8}
              onPress={() => toggleSection('toxicity')}
            >
              <Text style={styles.menuRowText}>Toxicity</Text>
              <Ionicons
                name={expandedSection === 'toxicity' ? 'chevron-down' : 'chevron-forward'}
                size={18}
                color="#8CA696"
              />
            </TouchableOpacity>
            {expandedSection === 'toxicity' && (
              <View style={styles.accordionContent}>
                <Text style={styles.accordionText}>
                  <Text style={{ fontWeight: '700' }}>• Pets: </Text>{sqliteDetail?.poisonous_to_pets === 1 ? 'Toxic to cats and dogs if ingested. Keep out of reach.' : 'Safe and friendly for cats and dogs.'}{'\n'}
                  <Text style={{ fontWeight: '700' }}>• Humans: </Text>{sqliteDetail?.poisonous_to_humans === 1 ? 'Mildly toxic if ingested. Avoid contact with eyes/mouth.' : 'Safe and non-toxic to humans.'}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Sticky Action Footer */}
        <View style={styles.detailsFooter}>
          {/* Floating Light Blue Diagnose Button */}
          <TouchableOpacity
            style={styles.diagnoseFloatingBtn}
            activeOpacity={0.85}
            onPress={() => {
              const activeImage = imageUri || sqliteDetail?.image_url || '';
              router.push({
                pathname: '/disease-detection-result',
                params: {
                  plantName: commonName,
                  scientificName: scientificName,
                  imageUri: activeImage ? encodeURIComponent(activeImage) : '',
                  healthScore: String(healthAnalysis.healthScore),
                  scanId: extractedScanId,
                  healthAnalysisData: extractedHealthAnalysis ? JSON.stringify(extractedHealthAnalysis) : '',
                }
              });
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="medkit-outline" size={22} color="#0369A1" style={{ marginRight: 8 }} />
              <Text style={styles.diagnoseFloatingText}>Diagnose Health</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#0369A1" />
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.timelineButton, { flex: 1 }]}
              activeOpacity={0.85}
              onPress={() => router.push({
                pathname: '/care-reminder',
                params: { plantName: commonName }
              })}
            >
              <Text style={styles.timelineButtonText}>AI Care Timeline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.askAiBtn}
              activeOpacity={0.85}
              onPress={() => setIsChatVisible(true)}
            >
              <Ionicons name="sparkles" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.askAiBtnText}>Ask AI</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Plant Health Score Modal (Image 2) */}
        <Modal
          visible={isHealthModalVisible}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setIsHealthModalVisible(false)}
        >
          <SafeAreaView style={styles.healthModalContainer} edges={['top', 'bottom']}>
            <StatusBar style="dark" />

            {/* Modal Top Bar */}
            <View style={styles.healthModalHeader}>
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => setIsHealthModalVisible(false)}
              >
                <Ionicons name="arrow-back" size={24} color="#1C3A27" />
              </TouchableOpacity>
              <Text style={styles.healthModalTitle}>Plant Health Score</Text>
              <TouchableOpacity style={styles.headerBtn} onPress={handleShare}>
                <Ionicons name="share-outline" size={22} color="#1C3A27" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.healthModalScroll} showsVerticalScrollIndicator={false}>
              {/* Gauge */}
              <View style={styles.gaugeContainer}>
                <View style={styles.gaugeRing}>
                  <Text style={styles.gaugePercent}>{healthScore || '94'}%</Text>
                </View>
                <Text style={styles.gaugeStatus}>{healthStatus || 'Excellent'}</Text>
                <Text style={styles.gaugeSub}>Your plant is in great shape!</Text>
              </View>

              {/* Ratings Card */}
              <View style={styles.healthBreakdownCard}>
                {/* Water */}
                <View style={styles.ratingRow}>
                  <View style={styles.ratingRowLeft}>
                    <Ionicons name="water" size={20} color="#498EC5" style={{ marginRight: 10 }} />
                    <Text style={styles.ratingRowLabel}>Water</Text>
                  </View>
                  {renderStars('water', categoryStars.water)}
                </View>

                <View style={styles.ratingRowDivider} />

                {/* Sunlight */}
                <View style={styles.ratingRow}>
                  <View style={styles.ratingRowLeft}>
                    <Ionicons name="sunny" size={20} color="#D89E3A" style={{ marginRight: 10 }} />
                    <Text style={styles.ratingRowLabel}>Sunlight</Text>
                  </View>
                  {renderStars('sunlight', categoryStars.sunlight)}
                </View>

                <View style={styles.ratingRowDivider} />

                {/* Humidity */}
                <View style={styles.ratingRow}>
                  <View style={styles.ratingRowLeft}>
                    <Ionicons name="water-outline" size={20} color="#498EC5" style={{ marginRight: 10 }} />
                    <Text style={styles.ratingRowLabel}>Humidity</Text>
                  </View>
                  {renderStars('humidity', categoryStars.humidity)}
                </View>

                <View style={styles.ratingRowDivider} />

                {/* Growth */}
                <View style={styles.ratingRow}>
                  <View style={styles.ratingRowLeft}>
                    <Ionicons name="leaf" size={20} color="#4E8C44" style={{ marginRight: 10 }} />
                    <Text style={styles.ratingRowLabel}>Growth</Text>
                  </View>
                  {renderStars('growth', categoryStars.growth)}
                </View>

                <View style={styles.ratingRowDivider} />

                {/* Overall Health */}
                <View style={styles.ratingRow}>
                  <View style={styles.ratingRowLeft}>
                    <Ionicons name="shield-checkmark" size={20} color="#4E8C44" style={{ marginRight: 10 }} />
                    <Text style={styles.ratingRowLabel}>Overall Health</Text>
                  </View>
                  {renderStars('overall', categoryStars.overall)}
                </View>
              </View>
            </ScrollView>

            {/* Bottom Button */}
            <View style={styles.healthModalFooter}>
              <TouchableOpacity
                style={styles.healthModalButton}
                activeOpacity={0.85}
                onPress={() => {
                  setIsHealthModalVisible(false);
                  router.push({
                    pathname: '/care-reminder',
                    params: { plantName: commonName }
                  });
                }}
              >
                <Text style={styles.healthModalButtonText}>View Health Timeline</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
        {renderChatbotModal()}
      </SafeAreaView>
    );
  } else {
    return (
      <SafeAreaView style={oldStyles.container} edges={['top']}>
        <StatusBar style="dark" />

        {showToast && (
          <Animated.View style={[oldStyles.toastContainer, { transform: [{ translateY: toastAnim }] }]}>
            <Image
              source={require('@/assets/images/leaf1.png')}
              style={oldStyles.toastIcon}
              contentFit="contain"
            />
            <Text style={oldStyles.toastText}>{commonName} added to My Garden! 🌿</Text>
          </Animated.View>
        )}

        {/* Top Navigation */}
        <View style={oldStyles.topHeader}>
          <TouchableOpacity
            style={oldStyles.headerBtn}
            onPress={() => {
              router.back();
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#1C3A27" />
          </TouchableOpacity>
          <View style={oldStyles.rightHeaderActions}>
            <TouchableOpacity
              style={[oldStyles.headerBtn, { flexDirection: 'row', width: 'auto', paddingHorizontal: 12, backgroundColor: isSaved ? '#4E8C44' : '#EBF4EA' }]}
              onPress={handleSaveToggle}
            >
              <Ionicons name={isSaved ? "heart" : "heart-outline"} size={20} color={isSaved ? "#FFFFFF" : "#1C3A27"} style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: isSaved ? "#FFFFFF" : "#1C3A27" }}>{isSaved ? 'Saved' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={oldStyles.headerBtn} onPress={handleShare}>
              <Ionicons name="share-outline" size={22} color="#1C3A27" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={oldStyles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Plant Hero Section */}
          <View style={oldStyles.heroSection}>
            <Image
              source={getResolvedImageSource(imageUri || sqliteDetail?.image_url, commonName, !!imageUri)}
              style={oldStyles.heroImg}
            />
            {/* Match Score Badge */}
            <View style={oldStyles.matchBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#4E8C44" />
              <Text style={oldStyles.matchText}>{confidence}% Match</Text>
            </View>
            {/* Slide Indicator */}
            <View style={oldStyles.slideIndicator}>
              <Text style={oldStyles.slideText}>1/5</Text>
            </View>
          </View>

          {/* Identity Details */}
          <View style={oldStyles.identityContainer}>
            <Text style={oldStyles.plantName}>{commonName}</Text>
            <Text style={oldStyles.botanicalName}>{scientificName}</Text>

            <View style={oldStyles.commonNameRow}>
              <Ionicons name="leaf-outline" size={14} color="#718E7B" style={{ marginRight: 4 }} />
              <Text style={oldStyles.commonNameText}>{otherNames}</Text>
            </View>

            {/* Badges */}
            <View style={oldStyles.badgesRow}>
              <View style={oldStyles.badgeItem}>
                <Ionicons
                  name={sqliteDetail && sqliteDetail.indoor === 0 ? "home-outline" : "home"}
                  size={14}
                  color="#1C3A27"
                  style={{ marginRight: 4 }}
                />
                <Text style={oldStyles.badgeText}>
                  {sqliteDetail && sqliteDetail.indoor === 0 ? 'Outdoor Plant' : 'Indoor Plant'}
                </Text>
              </View>
              <View style={oldStyles.badgeItem}>
                <Ionicons name="sunny-outline" size={14} color="#1C3A27" style={{ marginRight: 4 }} />
                <Text style={oldStyles.badgeText}>
                  {sqliteDetail ? `${sqliteDetail.care_level} Care` : 'Easy Care'}
                </Text>
              </View>
            </View>
          </View>

          {/* Custom Tab Switcher */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={oldStyles.tabsScrollContent}
            style={oldStyles.tabsContainer}
          >
            {dynamicTabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[oldStyles.tabItem, activeTab === tab && oldStyles.tabItemActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[oldStyles.tabText, activeTab === tab && oldStyles.tabTextActive]}>
                  {tab}
                </Text>
                {activeTab === tab && <View style={oldStyles.tabIndicator} />}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Tab Content (Overview is active) */}
          {activeTab === 'Overview' && (
            <View style={oldStyles.overviewContainer}>
              {/* Plant Description */}
              <View style={oldStyles.descriptionBlock}>
                <Text numberOfLines={descExpanded ? undefined : 3} style={oldStyles.descText}>
                  {cleanText(sqliteDetail?.description) || 'A resilient and beautiful plant known for its striking foliage and easy-to-care nature. Perfect for adding a fresh green aesthetic to any space.'}
                </Text>
                <TouchableOpacity onPress={() => setDescExpanded(!descExpanded)} style={oldStyles.readMoreBtn} activeOpacity={0.7}>
                  <Text style={oldStyles.readMoreText}>{descExpanded ? 'Read less' : 'Read more'}</Text>
                  <Ionicons name={descExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#4E8C44" />
                </TouchableOpacity>
              </View>

              {/* Quick Specs Grid */}
              <View style={oldStyles.quickSpecsGrid}>
                <View style={oldStyles.quickSpecCard}>
                  <View style={[oldStyles.specIconBadge, { backgroundColor: '#E0F2FE' }]}>
                    <Ionicons name="globe-outline" size={18} color="#0284C7" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={oldStyles.specLabel}>Native / Family</Text>
                    <Text style={oldStyles.specValue} numberOfLines={1}>
                      {sqliteDetail?.family || 'Tropical'}
                    </Text>
                  </View>
                </View>

                <View style={oldStyles.quickSpecCard}>
                  <View style={[oldStyles.specIconBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="trending-up-outline" size={18} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={oldStyles.specLabel}>Growth Rate</Text>
                    <Text style={oldStyles.specValue} numberOfLines={1}>
                      {sqliteDetail?.growth_rate || 'Moderate'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Care Guide Cards Grid */}
              {sqliteDetail && (waterData || lightData || tempData || ageData) && (
                <>
                  <View style={oldStyles.sectionHeader}>
                    <Text style={oldStyles.sectionTitle}>Care Guide</Text>
                    <TouchableOpacity
                      style={oldStyles.calendarLinkRow}
                      onPress={() => router.push({
                        pathname: '/care-reminder',
                        params: { plantName: commonName }
                      })}
                    >
                      <Text style={oldStyles.calendarLinkText}>View calendar</Text>
                      <Ionicons name="calendar-outline" size={14} color="#4E8C44" style={{ marginHorizontal: 2 }} />
                      <Ionicons name="chevron-forward" size={12} color="#4E8C44" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={oldStyles.careScrollContent}
                    style={{ marginBottom: 20 }}
                  >
                    {/* Water Card */}
                    {waterData && (
                      <View style={[oldStyles.careCard, oldStyles.waterCard]}>
                        <View style={[oldStyles.careIconBg, oldStyles.waterIconBg]}>
                          <Ionicons name="water" size={18} color="#0284C7" />
                        </View>
                        <Text style={oldStyles.careCardTitle} numberOfLines={1} adjustsFontSizeToFit>WATER</Text>
                        <Text style={oldStyles.careCardDesc} numberOfLines={1}>{waterData.title}</Text>
                        <Text style={oldStyles.careCardDetails}>{waterData.desc}</Text>
                      </View>
                    )}

                    {/* Light Card */}
                    {lightData && (
                      <View style={[oldStyles.careCard, oldStyles.lightCard]}>
                        <View style={[oldStyles.careIconBg, oldStyles.lightIconBg]}>
                          <Ionicons name="sunny" size={18} color="#D97706" />
                        </View>
                        <Text style={oldStyles.careCardTitle} numberOfLines={1} adjustsFontSizeToFit>LIGHT</Text>
                        <Text style={oldStyles.careCardDesc} numberOfLines={1}>
                          {lightData.title}
                        </Text>
                        <Text style={oldStyles.careCardDetails}>{lightData.desc}</Text>
                      </View>
                    )}

                    {/* Temperature Card */}
                    {tempData && (
                      <View style={[oldStyles.careCard, oldStyles.tempCard]}>
                        <View style={[oldStyles.careIconBg, oldStyles.tempIconBg]}>
                          <Ionicons name="thermometer-outline" size={18} color="#DC2626" />
                        </View>
                        <Text style={oldStyles.careCardTitle} numberOfLines={1} adjustsFontSizeToFit>TEMPERATURE</Text>
                        <Text style={oldStyles.careCardDesc} numberOfLines={1}>{tempData.title}</Text>
                        <Text style={oldStyles.careCardDetails}>{tempData.desc}</Text>
                      </View>
                    )}

                    {/* Lifespan Age Card */}
                    {ageData && (
                      <View style={[oldStyles.careCard, oldStyles.humidityCard]}>
                        <View style={[oldStyles.careIconBg, oldStyles.humidityIconBg]}>
                          <Ionicons name="time-outline" size={18} color="#059669" />
                        </View>
                        <Text style={oldStyles.careCardTitle} numberOfLines={1} adjustsFontSizeToFit>LIFESPAN</Text>
                        <Text style={oldStyles.careCardDesc} numberOfLines={1}>{ageData.title}</Text>
                        <Text style={oldStyles.careCardDetails}>{ageData.desc}</Text>
                      </View>
                    )}
                  </ScrollView>
                </>
              )}

              {/* Plant Tip Section */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push({
                  pathname: '/care-reminder',
                  params: { plantName: commonName }
                })}
                style={oldStyles.plantTipBanner}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>🪴</Text>
                <View style={oldStyles.tipTextCol}>
                  <Text style={oldStyles.tipBannerTitle}>Plant Tip</Text>
                  <Text style={oldStyles.tipBannerDesc}>
                    {getPlantTip(commonName)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#4E8C44" style={{ alignSelf: 'center', marginLeft: 8 }} />
              </TouchableOpacity>

              {/* Is It Pet Friendly Card */}
              {sqliteDetail && (sqliteDetail.poisonous_to_pets !== null || sqliteDetail.poisonous_to_humans !== null) && (
                <View style={[oldStyles.petCard, sqliteDetail.poisonous_to_pets === 1 ? oldStyles.petCardToxic : oldStyles.petCardSafe]}>
                  <View style={oldStyles.petCardContent}>
                    <Text style={{ fontSize: 22, marginRight: 10 }}>{sqliteDetail.poisonous_to_pets === 1 ? '⚠️' : '🛡️'}</Text>
                    <View style={oldStyles.petTextCol}>
                      <Text style={[oldStyles.petTitle, sqliteDetail.poisonous_to_pets === 1 ? oldStyles.petTitleToxic : oldStyles.petTitleSafe]}>
                        Is it pet friendly?
                      </Text>
                      <Text style={[oldStyles.petDesc, sqliteDetail.poisonous_to_pets === 1 ? oldStyles.petDescToxic : oldStyles.petDescSafe]}>
                        {sqliteDetail.poisonous_to_pets === 1
                          ? 'Toxic to pets if ingested. Keep away from cats and dogs.'
                          : 'Non-toxic. Perfectly safe for dogs, cats, and humans.'}
                      </Text>
                    </View>
                  </View>
                  <View style={oldStyles.petGraphicContainer}>
                    <Text style={{ fontSize: 22, marginRight: 6 }}>🐶🐱</Text>
                  </View>
                  <TouchableOpacity
                    style={[oldStyles.learnMoreBtn, sqliteDetail.poisonous_to_pets === 1 ? oldStyles.learnMoreBtnToxic : oldStyles.learnMoreBtnSafe]}
                    activeOpacity={0.8}
                    onPress={() => Alert.alert('Pet Toxicity Check', sqliteDetail.poisonous_to_pets === 1
                      ? 'Always research your specific plant species to ensure pet compatibility. Keep toxic plants elevated out of pet reach.'
                      : 'This plant is generally considered safe, but monitor your pets to prevent minor digestive issues if ingested.')}
                  >
                    <Text style={[oldStyles.learnMoreText, sqliteDetail.poisonous_to_pets === 1 ? oldStyles.learnMoreTextToxic : oldStyles.learnMoreTextSafe]}>
                      Learn more
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={12}
                      color={sqliteDetail.poisonous_to_pets === 1 ? '#C84C4C' : '#4E8C44'}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Tab Content (Care Guide active) */}
          {activeTab === 'Care Guide' && (
            <View style={oldStyles.overviewContainer}>
              <View style={oldStyles.detailSection}>
                <Text style={oldStyles.detailSectionTitle}>💦 Watering Schedule</Text>
                <Text style={oldStyles.detailSectionText}>
                  {cleanText(`This plant requires ${sqliteDetail?.watering || 'average'} watering. Make sure the top soil has dried out slightly before watering again to prevent root rot.`)}
                </Text>
              </View>

              <View style={oldStyles.detailSection}>
                <Text style={oldStyles.detailSectionTitle}>☀️ Sunlight Needs</Text>
                <Text style={oldStyles.detailSectionText}>
                  {cleanText(`Prefers: ${sqliteDetail?.sunlight ? (sqliteDetail.sunlight.trim().startsWith('[') ? (function () { try { return JSON.parse(sqliteDetail.sunlight).join(', '); } catch (e) { return sqliteDetail.sunlight; } })() : sqliteDetail.sunlight) : 'Bright indirect light'}. Keep away from dark, windowless corners or intense direct sun which burns leaves.`)}
                </Text>
              </View>

              <View style={oldStyles.detailSection}>
                <Text style={oldStyles.detailSectionTitle}>🌵 Drought Tolerance</Text>
                <Text style={oldStyles.detailSectionText}>
                  {cleanText(`Drought Resistant: ${sqliteDetail?.drought_tolerant === 1 ? 'Yes' : 'No'}. ${sqliteDetail?.drought_tolerant === 1 ? 'This plant can survive periods of drought and is very forgiving.' : 'This plant requires consistent moisture to thrive.'}`)}
                </Text>
              </View>
            </View>
          )}

          {/* Tab Content (Health active) */}
          {activeTab === 'Health' && (
            <View style={oldStyles.overviewContainer}>
              <View style={oldStyles.detailSection}>
                <Text style={oldStyles.detailSectionTitle}>🛡️ Maintenance & Care Level</Text>
                <Text style={oldStyles.detailSectionText}>
                  {cleanText(`Difficulty Rating: ${sqliteDetail?.care_level || 'Easy'}. Suitable for plant parents of all experience levels.`)}
                </Text>
              </View>

              <View style={oldStyles.detailSection}>
                <Text style={oldStyles.detailSectionTitle}>🚫 Toxicity Status</Text>
                <View style={oldStyles.toxicityRow}>
                  <Text style={oldStyles.toxicityLabel}>Toxic to Humans:</Text>
                  <Text style={[oldStyles.toxicityValue, sqliteDetail?.poisonous_to_humans === 1 ? oldStyles.toxicAlert : oldStyles.nonToxic]}>
                    {sqliteDetail?.poisonous_to_humans === 1 ? 'Yes, Toxic' : 'No, Safe'}
                  </Text>
                </View>
                <View style={[oldStyles.toxicityRow, { marginTop: 8 }]}>
                  <Text style={oldStyles.toxicityLabel}>Toxic to Pets:</Text>
                  <Text style={[oldStyles.toxicityValue, sqliteDetail?.poisonous_to_pets === 1 ? oldStyles.toxicAlert : oldStyles.nonToxic]}>
                    {sqliteDetail?.poisonous_to_pets === 1 ? 'Yes, Toxic' : 'No, Safe'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Tab Content (About active) */}
          {activeTab === 'About' && (
            <View style={oldStyles.overviewContainer}>
              <View style={oldStyles.detailSection}>
                <Text style={oldStyles.detailSectionTitle}>🧬 Taxonomy & Origin</Text>
                <View style={oldStyles.taxonomyTable}>
                  <View style={oldStyles.taxonomyRow}>
                    <Text style={oldStyles.taxonomyLabel}>Common Name</Text>
                    <Text style={oldStyles.taxonomyValueText}>{sqliteDetail?.common_name || commonName}</Text>
                  </View>
                  <View style={oldStyles.taxonomyRow}>
                    <Text style={oldStyles.taxonomyLabel}>Scientific Name</Text>
                    <Text style={[oldStyles.taxonomyValueText, { fontStyle: 'italic' }]}>{sqliteDetail?.scientific_name || scientificName}</Text>
                  </View>
                  <View style={oldStyles.taxonomyRow}>
                    <Text style={oldStyles.taxonomyLabel}>Family</Text>
                    <Text style={oldStyles.taxonomyValueText}>{sqliteDetail?.family || 'Plantaceae'}</Text>
                  </View>
                  <View style={oldStyles.taxonomyRow}>
                    <Text style={oldStyles.taxonomyLabel}>Genus</Text>
                    <Text style={oldStyles.taxonomyValueText}>{sqliteDetail?.genus || 'Genus'}</Text>
                  </View>
                  <View style={oldStyles.taxonomyRow}>
                    <Text style={oldStyles.taxonomyLabel}>Cycle</Text>
                    <Text style={oldStyles.taxonomyValueText}>{sqliteDetail?.cycle || 'Perennial'}</Text>
                  </View>
                </View>
              </View>

              <View style={oldStyles.detailSection}>
                <Text style={oldStyles.detailSectionTitle}>🍎 Usage Properties</Text>
                <View style={oldStyles.taxonomyTable}>
                  <View style={oldStyles.taxonomyRow}>
                    <Text style={oldStyles.taxonomyLabel}>Medicinal Value</Text>
                    <Text style={oldStyles.taxonomyValueText}>{sqliteDetail?.medicinal === 1 ? 'Yes, therapeutic properties' : 'None reported'}</Text>
                  </View>
                  <View style={oldStyles.taxonomyRow}>
                    <Text style={oldStyles.taxonomyLabel}>Edible Value</Text>
                    <Text style={oldStyles.taxonomyValueText}>{sqliteDetail?.edible === 1 ? 'Yes, edible parts' : 'Non-edible'}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Tab Content (Did You Know? active) */}
          {(activeTab === 'Did You Know?' || activeTab === 'Similar') && (
            <View style={oldStyles.overviewContainer}>
              <View style={oldStyles.didYouKnowCard}>
                <View style={oldStyles.didYouKnowHeaderRow}>
                  <View style={oldStyles.bulbIconContainer}>
                    <Ionicons name="bulb" size={24} color="#D97706" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={oldStyles.didYouKnowTitle}>Did You Know?</Text>
                    <Text style={oldStyles.didYouKnowSub}>Fascinating Plant Fact</Text>
                  </View>
                </View>

                <Text style={oldStyles.didYouKnowFactText}>
                  {cleanText(sqliteDetail?.description)
                    ? `Did you know? ${commonName} (${scientificName}) is uniquely adapted: ${cleanText(sqliteDetail?.description)}`
                    : `Did you know? ${commonName} (${scientificName}) continuously filters indoor air toxins like formaldehyde and benzene, releasing fresh oxygen while conserving water efficiently through specialized CAM photosynthesis!`}
                </Text>

                <View style={oldStyles.factGrid}>
                  <View style={oldStyles.factGridItem}>
                    <Ionicons name="leaf-outline" size={16} color="#15803D" style={{ marginRight: 6 }} />
                    <Text style={oldStyles.factGridText}>Family: {sqliteDetail?.family || 'Botanical Specimen'}</Text>
                  </View>
                  <View style={oldStyles.factGridItem}>
                    <Ionicons name="sparkles-outline" size={16} color="#D97706" style={{ marginRight: 6 }} />
                    <Text style={oldStyles.factGridText}>Air Clean Rating: High 🌿</Text>
                  </View>
                </View>

                <View style={oldStyles.factBadgeRow}>
                  <View style={oldStyles.factBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#B45309" style={{ marginRight: 6 }} />
                    <Text style={oldStyles.factBadgeText}>Verified Botanical Fact</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Sticky Action Footer */}
        <View style={oldStyles.footerContainer}>
          {/* Floating Light Blue Diagnose Button */}
          <TouchableOpacity
            style={oldStyles.diagnoseFloatingBtn}
            activeOpacity={0.85}
            onPress={() => {
              const activeImage = imageUri || sqliteDetail?.image_url || '';
              router.push({
                pathname: '/disease-detection-result',
                params: {
                  plantName: commonName,
                  scientificName: scientificName,
                  imageUri: activeImage ? encodeURIComponent(activeImage) : '',
                  healthScore: String(healthAnalysis.healthScore),
                  scanId: extractedScanId,
                  healthAnalysisData: extractedHealthAnalysis ? JSON.stringify(extractedHealthAnalysis) : '',
                }
              });
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="medkit-outline" size={22} color="#0369A1" style={{ marginRight: 8 }} />
              <Text style={oldStyles.diagnoseFloatingText}>Diagnose Health</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#0369A1" />
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Heart / Save Button */}
            <TouchableOpacity
              style={[oldStyles.saveBtn, isSaved ? oldStyles.saveBtnActive : oldStyles.saveBtnInactive, { flexDirection: 'row', alignItems: 'center' }]}
              activeOpacity={0.85}
              onPress={handleSaveToggle}
            >
              <Ionicons 
                name={isSaved ? "heart" : "heart-outline"} 
                size={20} 
                color={isSaved ? "#FFFFFF" : "#1C3A27"} 
                style={{ marginRight: 6 }} 
              />
              <Text style={[oldStyles.saveBtnText, isSaved ? oldStyles.saveBtnTextActive : oldStyles.saveBtnTextInactive]}>
                {isSaved ? "Saved" : "Save"}
              </Text>
            </TouchableOpacity>

            {/* Set Reminder Button */}
            <TouchableOpacity
              style={oldStyles.reminderBtn}
              activeOpacity={0.85}
              onPress={() => router.push({
                pathname: '/care-reminder',
                params: { plantName: commonName }
              })}
            >
              <Text style={{ fontSize: 15, marginRight: 4 }}>📅</Text>
              <Text style={oldStyles.reminderBtnText}>Reminder</Text>
            </TouchableOpacity>

            {/* Ask AI Button */}
            <TouchableOpacity
              style={oldStyles.askAiBtn}
              activeOpacity={0.85}
              onPress={() => setIsChatVisible(true)}
            >
              <Ionicons name="sparkles" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={oldStyles.askAiBtnText}>Ask AI</Text>
            </TouchableOpacity>
          </View>
        </View>
        {renderChatbotModal()}
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#F8FBF7',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 180,
  },
  plantHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  detailsPlantImg: {
    width: 100,
    height: 100,
    borderRadius: 20,
    marginRight: 16,
  },
  detailsPlantInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  detailsLocation: {
    fontSize: 16,
    color: '#1C3A27',
    fontWeight: '700',
    marginBottom: 2,
  },
  detailsCommonName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 4,
  },
  scientificNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  detailsScientificName: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#718E7B',
  },
  healthBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EBF4EA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  healthBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4E8C44',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    padding: 20,
    marginBottom: 16,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  healthScoreCardHeader: {
    marginBottom: 12,
  },
  healthScoreLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C3A27',
  },
  healthScoreCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  healthStatusText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4E8C44',
  },
  progressCircleLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressTextLarge: {
    fontSize: 13,
    fontWeight: '800',
  },
  careMetricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metricColumn: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#718E7B',
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C3A27',
    textAlign: 'center',
    lineHeight: 16,
  },
  verticalDivider: {
    width: 1,
    height: '70%',
    backgroundColor: '#EBF2EA',
    alignSelf: 'center',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    overflow: 'hidden',
    marginBottom: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  menuRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C3A27',
  },
  accordionContent: {
    backgroundColor: '#F9FBF9',
    padding: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  accordionText: {
    fontSize: 13,
    color: '#5F7265',
    lineHeight: 18,
  },
  detailsFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F5EF',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 8,
  },
  timelineButton: {
    backgroundColor: '#1E5322',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E5322',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  timelineButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  askAiBtn: {
    paddingHorizontal: 16,
    height: 52,
    flexDirection: 'row',
    backgroundColor: '#1E5322',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E5322',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  askAiBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  toastContainer: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    backgroundColor: '#1C3A27',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 999,
  },
  toastIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  issueDiagnosisCard: {
    width: '100%',
    backgroundColor: '#F3F8F2',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    padding: 16,
    marginBottom: 16,
  },
  issueHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  issueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2EBE0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  issueBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E5322',
  },
  waterSchedulePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  waterScheduleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369A1',
  },
  issueTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 4,
  },
  issueDescText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5F7265',
    lineHeight: 16,
  },
  rescanPromptCard: {
    width: '100%',
    backgroundColor: '#FEF9EE',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#FBE8C5',
    padding: 16,
    marginBottom: 16,
  },
  rescanOverdue10Card: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  rescanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  rescanPromptTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E5322',
  },
  rescanPromptDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: '#7B623B',
    lineHeight: 16,
    marginBottom: 12,
  },
  rescanActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E5322',
    paddingVertical: 10,
    borderRadius: 12,
  },
  rescanActionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  healthModalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  healthModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  healthModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
  },
  healthModalScroll: {
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 120,
    alignItems: 'center',
  },
  gaugeContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  gaugeRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 14,
    borderColor: '#1E5322',
    borderTopColor: '#D0E0CE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  gaugePercent: {
    fontSize: 38,
    fontWeight: '800',
    color: '#1C3A27',
  },
  gaugeStatus: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E5322',
    marginBottom: 4,
  },
  gaugeSub: {
    fontSize: 14,
    fontWeight: '500',
    color: '#718E7B',
  },
  healthBreakdownCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#EBF2EA',
    paddingHorizontal: 20,
    paddingVertical: 8,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  ratingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingRowLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C3A27',
  },
  ratingRowDivider: {
    height: 1,
    backgroundColor: '#F0F5EF',
  },
  healthModalFooter: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
  },
  healthModalButton: {
    backgroundColor: '#1E5322',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E5322',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  healthModalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  overviewContainer: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  didYouKnowCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
  },
  didYouKnowHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  bulbIconContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.2,
    borderColor: '#FCD34D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  didYouKnowTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#92400E',
  },
  didYouKnowSub: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '600',
    marginTop: 1,
  },
  didYouKnowFactText: {
    fontSize: 13.5,
    color: '#78350F',
    lineHeight: 21,
    fontWeight: '500',
    marginBottom: 16,
  },
  factGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  factGridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  factGridText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
  },
  factBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  factBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  factBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  diagnoseFloatingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E0F2FE',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderRadius: 18,
    height: 52,
    paddingHorizontal: 18,
    marginBottom: 12,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  diagnoseFloatingText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0369A1',
  },
});

const oldStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  topHeader: {
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
  rightHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scrollContent: {
    paddingBottom: 180, // space for footer
  },
  heroSection: {
    width: '100%',
    height: 250,
    backgroundColor: '#FFFFFF',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImg: {
    width: '80%',
    height: '90%',
  },
  matchBadge: {
    position: 'absolute',
    top: 16,
    left: 24,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF4EA',
    borderWidth: 1,
    borderColor: '#7DA676',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  matchText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4E8C44',
    marginLeft: 4,
  },
  slideIndicator: {
    position: 'absolute',
    bottom: 16,
    right: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  slideText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  identityContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  plantName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C3A27',
  },
  botanicalName: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#718E7B',
    marginTop: 2,
  },
  commonNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  commonNameText: {
    fontSize: 12,
    color: '#8CA696',
    fontWeight: '500',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  badgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F8F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1C3A27',
  },
  tabsContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  tabsScrollContent: {
    paddingHorizontal: 24,
    height: 48,
    alignItems: 'center',
  },
  tabItem: {
    marginRight: 28,
    height: '100%',
    justifyContent: 'center',
    position: 'relative',
  },
  tabItemActive: {},
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8CA696',
  },
  tabTextActive: {
    color: '#4E8C44',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#4E8C44',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  descRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  descLeft: {
    flex: 1.2,
  },
  descriptionBlock: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EBF2EA',
    marginBottom: 14,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  descText: {
    fontSize: 13.5,
    color: '#3A4D3F',
    lineHeight: 20,
    fontWeight: '400',
  },
  readMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  readMoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4E8C44',
  },
  quickSpecsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  quickSpecCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EBF2EA',
    gap: 10,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  specIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  specLabel: {
    fontSize: 10.5,
    color: '#718E7B',
    fontWeight: '600',
  },
  specValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1C3A27',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C3A27',
  },
  calendarLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calendarLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4E8C44',
  },
  careScrollContent: {
    paddingRight: 16,
  },
  careCard: {
    width: 155,
    minHeight: 140,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.2,
    marginRight: 12,
    justifyContent: 'space-between',
  },
  waterCard: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  lightCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  tempCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  humidityCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  careIconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  waterIconBg: {
    backgroundColor: '#FFFFFF',
  },
  lightIconBg: {
    backgroundColor: '#FFFFFF',
  },
  tempIconBg: {
    backgroundColor: '#FFFFFF',
  },
  humidityIconBg: {
    backgroundColor: '#FFFFFF',
  },
  careCardTitle: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  careCardDesc: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  careCardDetails: {
    fontSize: 10.5,
    color: '#475569',
    marginTop: 4,
    lineHeight: 14,
    fontWeight: '500',
  },
  plantTipBanner: {
    flexDirection: 'row',
    backgroundColor: '#F3FBF5',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2F2E7',
    marginBottom: 24,
  },
  tipTextCol: {
    flex: 1,
  },
  tipBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C3A27',
  },
  tipBannerDesc: {
    fontSize: 11,
    color: '#2E4C38',
    lineHeight: 16,
    marginTop: 4,
    fontWeight: '500',
  },
  petCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 20,
  },
  petCardToxic: {
    backgroundColor: '#FFF2F2',
    borderColor: '#FFE0E0',
  },
  petCardSafe: {
    backgroundColor: '#F3FBF5',
    borderColor: '#E0F5E6',
  },
  petCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  petWarningIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  petTextCol: {
    flex: 1,
  },
  petTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  petTitleToxic: {
    color: '#C84C4C',
  },
  petTitleSafe: {
    color: '#4E8C44',
  },
  petDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
    fontWeight: '500',
  },
  petDescToxic: {
    color: '#A03C3C',
  },
  petDescSafe: {
    color: '#5A7F66',
  },
  petGraphicContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  learnMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  learnMoreBtnToxic: {
    borderColor: '#FFE0E0',
  },
  learnMoreBtnSafe: {
    borderColor: '#E0F5E6',
  },
  learnMoreText: {
    fontSize: 9,
    fontWeight: '700',
    marginRight: 2,
  },
  learnMoreTextToxic: {
    color: '#C84C4C',
  },
  learnMoreTextSafe: {
    color: '#4E8C44',
  },
  specIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F5EF',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 8,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  saveBtnInactive: {
    backgroundColor: '#F1F7F2',
    borderWidth: 1.5,
    borderColor: '#A3C69D',
  },
  saveBtnActive: {
    backgroundColor: '#4E8C44',
    borderWidth: 1.5,
    borderColor: '#4E8C44',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  saveBtnTextInactive: {
    color: '#1C3A27',
  },
  saveBtnTextActive: {
    color: '#FFFFFF',
  },
  diagnoseFloatingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E0F2FE',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderRadius: 18,
    height: 52,
    paddingHorizontal: 18,
    marginBottom: 12,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  diagnoseFloatingText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0369A1',
  },
  reminderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4E8C44',
    borderRadius: 16,
    height: 52,
  },
  reminderBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  askAiBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4E8C44',
    borderRadius: 16,
    height: 52,
  },
  askAiBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  overviewContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  didYouKnowCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
  },
  didYouKnowHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  bulbIconContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.2,
    borderColor: '#FCD34D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  didYouKnowTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#92400E',
  },
  didYouKnowSub: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '600',
    marginTop: 1,
  },
  didYouKnowFactText: {
    fontSize: 13.5,
    color: '#78350F',
    lineHeight: 21,
    fontWeight: '500',
    marginBottom: 16,
  },
  factGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  factGridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  factGridText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
  },
  factBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  factBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  factBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  detailSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EBF2EA',
    padding: 16,
    marginBottom: 16,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 8,
  },
  detailSectionText: {
    fontSize: 12,
    color: '#718E7B',
    lineHeight: 18,
    fontWeight: '500',
  },
  toxicityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toxicityLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#718E7B',
  },
  toxicityValue: {
    fontSize: 12,
    fontWeight: '800',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  toxicAlert: {
    backgroundColor: '#FFF0F0',
    color: '#C84C4C',
  },
  nonToxic: {
    backgroundColor: '#EBF4EA',
    color: '#4E8C44',
  },
  taxonomyTable: {
    marginTop: 4,
  },
  taxonomyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  taxonomyLabel: {
    fontSize: 12,
    color: '#8CA696',
    fontWeight: '600',
  },
  taxonomyValueText: {
    fontSize: 12,
    color: '#1C3A27',
    fontWeight: '700',
  },
  toastContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: '#1C3A27',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 9999,
  },
  toastIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
    tintColor: '#FFFFFF',
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});

const chatStyles = StyleSheet.create({
  chatContainer: {
    flex: 1,
    backgroundColor: '#F8FBF7',
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
