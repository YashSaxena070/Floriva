import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform, TextInput, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../_layout';
import { analyzePlantHealth, getWateringCountdown } from '@/services/plantHealthService';
import CircularProgress from '@/components/CircularProgress';

const getMoistureLevel = (nextWatering: string, id: string) => {
  const cleanWater = nextWatering.toLowerCase();
  const numericId = parseInt(id.replace(/\D/g, '').slice(-3)) || 45;
  
  if (cleanWater.includes('today')) {
    return {
      percentage: 15 + (numericId % 15),
      color: '#C84C4C',
      lightColor: '#FFEBEB',
    };
  }
  if (cleanWater.includes('tomorrow') || cleanWater.includes('in 1 day')) {
    return {
      percentage: 40 + (numericId % 15),
      color: '#D89E3A',
      lightColor: '#FFF8EB',
    };
  }
  
  const percent = 75 + (numericId % 21);
  return {
    percentage: percent,
    color: '#1E6F2D',
    lightColor: '#EBF4EA',
  };
};

const formatNextWatering = (nextWatering: string) => {
  const val = nextWatering.trim();
  const lowerVal = val.toLowerCase();
  if (lowerVal.startsWith('in ')) {
    return val.substring(3);
  }
  return val;
};

export default function MyGardenScreen() {
  const router = useRouter();
  const { savedPlants, removePlant, reminders } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [plantToDelete, setPlantToDelete] = useState<any | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const handleRemovePlant = (plant: any) => {
    setPlantToDelete(plant);
  };

  const confirmDelete = () => {
    if (plantToDelete) {
      removePlant(plantToDelete.id);
      setPlantToDelete(null);
    }
  };

  const cancelDelete = () => {
    setPlantToDelete(null);
  };

  const filteredPlants = savedPlants.filter((plant) =>
    plant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (plant.botanicalName && plant.botanicalName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      {/* Header Row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#1C3A27" />
          </TouchableOpacity>
          <Text style={styles.title}>My Garden</Text>
        </View>
      </View>
      
      {/* Search Row */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBar, isSearchFocused && styles.searchBarFocused]}>
          <Ionicons name="search" size={20} color={isSearchFocused ? "#4E8C44" : "#8CA696"} style={styles.searchIcon} />
          <TextInput
            placeholder="Search your plants"
            placeholderTextColor="#8CA696"
            style={[
              styles.searchInput,
              Platform.OS === 'web' && ({ outlineStyle: 'none', outlineWidth: 0 } as any)
            ]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {filteredPlants.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Image
              source={require('@/assets/images/leaf.png')}
              style={styles.emptyStateIcon}
              contentFit="contain"
            />
            <Text style={styles.emptyStateTitle}>
              {searchQuery ? "No plants found" : "Your collection is empty"}
            </Text>
            <Text style={styles.emptyStateSub}>
              {searchQuery ? "Try searching for a different plant name or location." : "Identify plants and tap save to build your garden! 🌿"}
            </Text>
          </View>
        ) : (
          filteredPlants.map((plant) => {
            const healthAnalysis = analyzePlantHealth({
              confidence: plant.confidence,
              lastScannedDate: plant.lastScannedDate,
              name: plant.name,
              botanicalName: plant.botanicalName,
              watering: plant.watering,
            });

            const waterCountdown = getWateringCountdown({
              lastWateredDate: plant.lastWateredDate || reminders.find((r: any) => r.plantName === plant.name)?.lastWatered,
              wateringIntervalDays: healthAnalysis.wateringDays,
              watering: plant.watering,
              name: plant.name,
            });

            return (
              <TouchableOpacity
                key={plant.id}
                style={[styles.plantCard, healthAnalysis.isOverdue10Days && styles.overdue10Card]}
                activeOpacity={0.9}
                onPress={() => router.push({
                  pathname: '/plant-details',
                  params: {
                    imageUri: plant.imageUri ? encodeURIComponent(plant.imageUri) : '',
                    commonName: plant.name,
                    scientificName: plant.botanicalName,
                    confidence: plant.confidence || '95',
                    plantResult: plant.plantResult,
                    fromGarden: 'true',
                    showHealthScoreDirectly: 'true',
                    healthScore: String(healthAnalysis.healthScore),
                    healthStatus: healthAnalysis.healthStatus,
                    lastScannedDate: String(plant.lastScannedDate || ''),
                    nextWatering: waterCountdown.label,
                  }
                })}
              >
                <Image
                  source={plant.imageUri ? { uri: plant.imageUri } : require('@/assets/images/leaf.png')}
                  style={styles.plantImg}
                />
                <View style={styles.plantDetails}>
                  <Text style={styles.plantName}>{plant.name}</Text>
                  <Text style={styles.plantBotanical}>{plant.botanicalName}</Text>
                  
                  {/* Dynamic Watering Countdown / Watered Today Pill */}
                  <View style={[styles.gardenCarePill, { backgroundColor: waterCountdown.badgeBg }]}>
                    <Ionicons 
                      name={waterCountdown.status === 'watered_today' ? "checkmark-circle" : "water"} 
                      size={12} 
                      color={waterCountdown.badgeTextColor} 
                    />
                    <Text style={[styles.gardenCarePillText, { color: waterCountdown.badgeTextColor }]}>
                      {waterCountdown.label}
                    </Text>
                  </View>

                  {/* Overdue >10 Days Badge or Weekly Scan Due Badge */}
                  {healthAnalysis.isOverdue10Days ? (
                    <View style={styles.overdue10Badge}>
                      <Text style={styles.overdue10BadgeText}>🚨 Scan Overdue (&gt;10 Days)</Text>
                    </View>
                  ) : healthAnalysis.isScanDue ? (
                    <View style={styles.scanDueBadge}>
                      <Text style={styles.scanDueBadgeText}>Weekly Scan Due 📸</Text>
                    </View>
                  ) : null}
                </View>
                
                <View style={styles.rightIndicatorContainer}>
                  <TouchableOpacity
                    style={styles.trashCircleBtn}
                    activeOpacity={0.7}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleRemovePlant(plant);
                    }}
                  >
                    <Ionicons name="trash-outline" size={14} color="#DC2626" />
                  </TouchableOpacity>
                  <CircularProgress
                    size={40}
                    strokeWidth={3.5}
                    percentage={healthAnalysis.healthScore}
                    color={healthAnalysis.isOverdue10Days ? "#DC2626" : (healthAnalysis.healthScore >= 90 ? "#1E6F2D" : "#D89E3A")}
                    bgColor={healthAnalysis.isOverdue10Days ? "#FEE2E2" : "#E2EBE0"}
                    textSize={10}
                  />
                  <Text style={styles.waterLabel}>
                    <Text>Health Score{'\n'}</Text>
                    <Text style={{ fontWeight: '700', color: healthAnalysis.isOverdue10Days ? '#DC2626' : (healthAnalysis.healthScore >= 90 ? '#1E6F2D' : '#D89E3A') }}>
                      {healthAnalysis.isOverdue10Days ? 'Urgent Scan' : healthAnalysis.healthStatus}
                    </Text>
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Sticky Add Plant Button above the tabs */}
      <View style={styles.stickyFooter}>
        <TouchableOpacity 
          style={styles.addPlantButton}
          activeOpacity={0.85}
          onPress={() => router.push('/camera')}
        >
          <Text style={styles.addPlantText}>+ Add Plant</Text>
        </TouchableOpacity>
      </View>

      {/* Custom Minimal Delete Confirmation Modal */}
      <Modal
        visible={!!plantToDelete}
        transparent
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdropTouch} activeOpacity={1} onPress={cancelDelete} />
          
          <View style={styles.deleteModalCard}>
            <View style={styles.deleteIconBg}>
              <Ionicons name="trash-outline" size={24} color="#DC2626" />
            </View>

            <Text style={styles.deleteModalTitle}>Remove Plant?</Text>
            <Text style={styles.deleteModalDesc}>
              Are you sure you want to remove <Text style={{ fontWeight: '800', color: '#1C3A27' }}>"{plantToDelete?.name}"</Text> from My Garden?
            </Text>

            <View style={styles.deleteModalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.8} onPress={cancelDelete}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.confirmDeleteBtn} activeOpacity={0.85} onPress={confirmDelete}>
                <Text style={styles.confirmDeleteBtnText}>Remove</Text>
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
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1C3A27',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F3F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F3F1',
    borderRadius: 14,
    height: 48,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchBarFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#4E8C44',
    transform: [{ translateY: -3 }],
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1C3A27',
    fontWeight: '500',
    padding: 0,
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F0F3F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 190,
  },
  plantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  plantImg: {
    width: 64,
    height: 64,
    borderRadius: 14,
    marginRight: 16,
  },
  plantDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  plantName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C3A27',
    marginBottom: 4,
  },
  plantBotanical: {
    fontSize: 13,
    color: '#718E7B',
    fontStyle: 'italic',
    fontWeight: '500',
    marginBottom: 4,
  },
  gardenCarePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 2,
    gap: 4,
  },
  gardenCarePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
  },
  scanDueBadge: {
    backgroundColor: '#FEF08A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  scanDueBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#854D0E',
  },
  overdue10Card: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1.5,
    shadowColor: '#EF4444',
    shadowOpacity: 0.12,
  },
  overdue10Badge: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  overdue10BadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#991B1B',
  },
  rightIndicatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 76,
  },
  trashCircleBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    alignSelf: 'flex-end',
  },
  deleteBtn: {
    padding: 4,
    marginBottom: 2,
    alignSelf: 'center',
  },
  progressCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 11,
    fontWeight: '800',
  },
  waterLabel: {
    fontSize: 10,
    color: '#718E7B',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 12,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 90 : 70,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240, 245, 239, 0.5)',
  },
  addPlantButton: {
    backgroundColor: '#1E5322', // Dark green matching the image button color
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E5322',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  addPlantText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F0F5EF',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  emptyStateIcon: {
    width: 60,
    height: 60,
    marginBottom: 12,
    opacity: 0.8,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C3A27',
  },
  emptyStateSub: {
    fontSize: 11,
    color: '#718E7B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  deleteModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#F0F5EF',
  },
  deleteIconBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
    marginTop: 10,
    marginBottom: 6,
  },
  deleteModalDesc: {
    fontSize: 13,
    color: '#718E7B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 22,
  },
  deleteModalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F0F5EF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C3A27',
  },
  confirmDeleteBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  confirmDeleteBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
