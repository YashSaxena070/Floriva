import { plantService } from '@/services/plantService';
import { getResolvedImageSource } from '@/services/uriHelper';
import { SQLitePlant as Plant } from '@/types/plant';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Image as RNImage, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

function formatSunlight(sunlight: string | null | undefined): string {
  if (!sunlight) return 'Sunlight';
  try {
    if (sunlight.trim().startsWith('[')) {
      const arr = JSON.parse(sunlight);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr[0];
      }
    }
  } catch (e) {
    // Ignore error
  }
  let cleaned = sunlight.replace(/[\[\]\"']/g, '').trim();
  if (cleaned.includes(',')) {
    cleaned = cleaned.split(',')[0].trim();
  }
  return cleaned || 'Sunlight';
}

function formatWatering(watering: string | null | undefined): string {
  if (!watering) return 'Moderate';
  let cleaned = watering.replace(/[\[\]\"']/g, '').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

interface LocationInfo {
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
}

export default function NearbyPlantsScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [climateZone, setClimateZone] = useState('');
  const [climateDesc, setClimateDesc] = useState('');
  const [recommendedPlants, setRecommendedPlants] = useState<Plant[]>([]);
  const [allPlants, setAllPlants] = useState<Plant[]>([]);

  // Default fallback location (New Delhi)
  const defaultLocation: LocationInfo = {
    city: 'New Delhi',
    region: 'Delhi',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.2090,
  };

  useEffect(() => {
    initInstantPlants();
    fetchLocationAndPlants();
  }, []);

  const initInstantPlants = async () => {
    try {
      const plants = await plantService.getAllPlants();
      setAllPlants(plants);
      if (plants && plants.length > 0) {
        setRecommendedPlants(plants.slice(0, 8));
        setLoading(false);
      }
    } catch (e) {
      console.warn('Instant plants load error:', e);
      setLoading(false);
    }
  };

  const fetchLocationAndPlants = async () => {
    setLocationError(null);
    let coords = { latitude: defaultLocation.latitude, longitude: defaultLocation.longitude };
    let locDetails: LocationInfo = defaultLocation;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        // Fast check for last known position first (returns in <5ms)
        let lastLoc = await Location.getLastKnownPositionAsync().catch(() => null);
        
        if (!lastLoc) {
          // Timeout race so user is never kept waiting
          const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200));
          const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
          const res = await Promise.race([locationPromise, timeoutPromise]);
          if (res) lastLoc = res;
        }

        if (lastLoc) {
          coords = {
            latitude: lastLoc.coords.latitude,
            longitude: lastLoc.coords.longitude,
          };
        }

        // Reverse Geocode non-blockingly
        const geocode = await Location.reverseGeocodeAsync({
          latitude: coords.latitude,
          longitude: coords.longitude,
        }).catch(() => null);

        if (geocode && geocode.length > 0) {
          const first = geocode[0];
          locDetails = {
            city: first.city || first.district || 'Your Area',
            region: first.region || first.subregion || '',
            country: first.country || '',
            latitude: coords.latitude,
            longitude: coords.longitude,
          };
        } else {
          locDetails = {
            city: 'My Location',
            region: '',
            country: '',
            latitude: coords.latitude,
            longitude: coords.longitude,
          };
        }
      } else {
        setLocationError('Permission denied. Showing default recommendations.');
      }
    } catch (err: any) {
      console.warn('Failed to retrieve location:', err);
      setLocationError('Could not fetch location. Showing default recommendations.');
    } finally {
      setLocationInfo(locDetails);
      determineClimateAndRecommend(locDetails, coords.latitude);
    }
  };

  const determineClimateAndRecommend = async (loc: LocationInfo, lat: number) => {
    const normCountry = (loc.country || '').toLowerCase();
    const normRegion = (loc.region || '').toLowerCase();
    const absLat = Math.abs(lat);

    let zoneName = '';
    let zoneRange = '';
    let zoneDesc = '';

    // Detailed USDA Hardiness Zone Mapping based on state/country or fallback to latitude
    if (normCountry.includes('india')) {
      if (normRegion.includes('kerala') || normRegion.includes('tamil nadu') || normRegion.includes('karnataka') || normRegion.includes('goa') || normRegion.includes('andhra') || normRegion.includes('telangana') || normRegion.includes('maharashtra') || normRegion.includes('odisha') || normRegion.includes('bengal') || normRegion.includes('puducherry') || normRegion.includes('lakshadweep') || normRegion.includes('andaman')) {
        zoneName = 'USDA Zone 11-12 (Tropical)';
        zoneRange = 'Min Temp: > 4.4°C (40°F)';
        zoneDesc = 'Hot, humid tropical climate all year. Best for tropical house plants, outdoor palms, and warm-loving species.';
      } else if (normRegion.includes('jammu') || normRegion.includes('himachal') || normRegion.includes('uttarakhand') || normRegion.includes('sikkim') || normRegion.includes('ladakh') || normRegion.includes('arunachal')) {
        zoneName = 'USDA Zone 7-8 (Temperate / Alpine)';
        zoneRange = 'Min Temp: -17.8°C to -6.7°C (0°F to 20°F)';
        zoneDesc = 'Temperate mountain climate with cold winters. Ideal for deciduous conifers, oaks, maples, and hardy outdoor shrubs.';
      } else {
        zoneName = 'USDA Zone 9-10 (Subtropical)';
        zoneRange = 'Min Temp: -6.7°C to 4.4°C (20°F to 40°F)';
        zoneDesc = 'Warm subtropical climate with mild winters. Excellent for succulents, cacti, and many flowering ornamentals.';
      }
    } else if (normCountry.includes('united states') || normCountry.includes('usa') || normCountry.includes('us')) {
      if (normRegion.includes('florida') || normRegion.includes('hawaii') || normRegion.includes('texas') || normRegion.includes('california')) {
        zoneName = 'USDA Zone 9-11 (Warm / Subtropical)';
        zoneRange = 'Min Temp: -6.7°C to >4.4°C (20°F to 40°F)';
        zoneDesc = 'Warm subtropical/tropical climate. Excellent for succulents, cacti, palms, and tropical house plants.';
      } else if (normRegion.includes('alaska') || normRegion.includes('minnesota') || normRegion.includes('dakota') || normRegion.includes('montana') || normRegion.includes('wyoming') || normRegion.includes('maine') || normRegion.includes('vermont')) {
        zoneName = 'USDA Zone 3-4 (Boreal / Cold)';
        zoneRange = 'Min Temp: -40°C to -28.9°C (-40°F to -20°F)';
        zoneDesc = 'Severely cold winters. Recommended only for extremely cold-hardy local conifers, birches, and deciduous plants.';
      } else {
        zoneName = 'USDA Zone 5-8 (Temperate)';
        zoneRange = 'Min Temp: -28.9°C to -6.7°C (-20°F to 20°F)';
        zoneDesc = 'Temperate climate with distinct seasonal variation. Suitable for maple trees, ivy, boxwoods, and deciduous shrubs.';
      }
    } else {
      // Fallback based on latitude
      if (absLat < 15) {
        zoneName = 'USDA Zone 12-13 (Equatorial / Tropical)';
        zoneRange = 'Min Temp: > 10°C (50°F)';
        zoneDesc = 'Constantly hot and humid equatorial zone. Best for tropical houseplants, orchids, and rain forest flora.';
      } else if (absLat >= 15 && absLat < 25) {
        zoneName = 'USDA Zone 10-11 (Tropical Savanna)';
        zoneRange = 'Min Temp: -1.1°C to 4.4°C (30°F to 40°F)';
        zoneDesc = 'Warm climate with dry seasons. Perfect for drought-tolerant succulents, cacti, and flowering shrubs.';
      } else if (absLat >= 25 && absLat < 38) {
        zoneName = 'USDA Zone 8-9 (Warm Temperate / Subtropical)';
        zoneRange = 'Min Temp: -12.2°C to -1.1°C (10°F to 30°F)';
        zoneDesc = 'Mild winters and hot summers. Great for citrus, palms, ivy, and common house plants.';
      } else if (absLat >= 38 && absLat < 50) {
        zoneName = 'USDA Zone 6-7 (Temperate)';
        zoneRange = 'Min Temp: -23.3°C to -12.2°C (-10°F to 10°F)';
        zoneDesc = 'Four distinct seasons with snowy winters. Recommended for deciduous trees, conifers, and cold-hardy bushes.';
      } else {
        zoneName = 'USDA Zone 3-5 (Boreal / Polar)';
        zoneRange = 'Min Temp: < -23.3°C (-10°F)';
        zoneDesc = 'Long, harsh winters. Only native, cold-hardy conifers and winter-dormant trees will survive outdoors.';
      }
    }

    let regionName = '';
    if (zoneName.includes('Tropical')) {
      regionName = 'Tropical Region';
    } else if (zoneName.includes('Subtropical')) {
      regionName = 'Subtropical Region';
    } else if (zoneName.includes('Temperate')) {
      regionName = 'Temperate Region';
    } else if (zoneName.includes('Cold') || zoneName.includes('Boreal') || zoneName.includes('Polar')) {
      regionName = 'Cold Region';
    } else {
      regionName = 'Temperate Region';
    }

    setClimateZone(regionName);
    setClimateDesc(zoneDesc);

    try {
      // Fetch all plants from SQLite
      const plants = await plantService.getAllPlants();
      setAllPlants(plants);

      // Score and sort plants based on current climate zone
      const scored = plants.map((plant) => {
        let score = 0;
        const lowName = (plant.common_name || '').toLowerCase();
        const lowFamily = (plant.family || '').toLowerCase();
        const cycle = (plant.cycle || '').toLowerCase();
        const sunlight = (plant.sunlight || '').toLowerCase();

        // 1. Tropical Zone (Zone 11-13)
        if (zoneName.includes('11') || zoneName.includes('12') || zoneName.includes('13')) {
          if (plant.indoor === 1) score += 3; // indoor / houseplants thrive in tropical heat
          if (plant.drought_tolerant === 1) score += 4; // savannah plants
          if (cycle.includes('perennial')) score += 2;
          if (lowName.includes('cactus') || lowName.includes('succulent') || lowName.includes('palm') || lowName.includes('aloe') || lowName.includes('monstera') || lowName.includes('snake')) score += 5;
        }
        // 2. Subtropical Zone (Zone 8-10)
        else if (zoneName.includes('8') || zoneName.includes('9') || zoneName.includes('10')) {
          if (sunlight.includes('full sun') || sunlight.includes('part shade')) score += 3;
          if (cycle.includes('perennial')) score += 2;
          if (plant.drought_tolerant === 1) score += 2;
          if (lowName.includes('lily') || lowName.includes('rose') || lowName.includes('jasmine') || lowName.includes('tulsi') || lowName.includes('hibiscus')) score += 5;
        }
        // 3. Cold/Temperate Zone (Zone 3-7)
        else {
          if (plant.indoor === 0) score += 5; // outdoor preferred
          if (lowFamily.includes('sapindaceae') || lowName.includes('tree') || lowName.includes('maple') || lowName.includes('oak') || lowName.includes('ivy') || lowName.includes('pine') || lowName.includes('willow')) score += 5;
          if (cycle.includes('annual') || cycle.includes('perennial')) score += 2;
        }

        return { plant, score };
      });

      // Filter and take top 6-8 matching plants
      const sorted = scored
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.plant)
        .slice(0, 8);

      // Fallback in case sorted list is empty
      setRecommendedPlants(sorted.length > 0 ? sorted : plants.slice(0, 6));
    } catch (dbErr) {
      console.warn('Database fetch failed, loading fallback local recommendations:', dbErr);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)')}>
          <RNImage
            source={require('../assets/images/next.png')}
            style={[styles.backIcon, { tintColor: '#1C3A27' }]}
            resizeMode="contain"
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nearby Plants</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchLocationAndPlants} disabled={loading}>
          <RNImage
            source={require('../assets/images/flip.png')}
            style={styles.backIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4E8C44" />
          <Text style={styles.loadingText}>Analyzing your local climate...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Location details card */}
          <View style={styles.locationCard}>
            {/* Map background image overlay */}
            <RNImage
              source={require('../assets/images/map.png')}
              style={styles.locationCardBgMap}
              resizeMode="cover"
            />
            <View style={styles.locationDetails}>
              <View style={styles.pinRow}>
                <RNImage
                  source={require('../assets/images/location.png')}
                  style={styles.locationPinIcon}
                  resizeMode="contain"
                />
                <View>
                  <Text style={styles.cityText}>{locationInfo?.city}</Text>
                  <Text style={styles.regionText}>
                    {locationInfo?.region ? `${locationInfo.region}, ` : ''}{locationInfo?.country}
                  </Text>
                </View>
              </View>
              {locationError && (
                <View style={styles.errorBadge}>
                  <Text style={styles.errorText}>{locationError}</Text>
                </View>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.climateInfo}>
              <View style={styles.climateBadge}>
                <Text style={styles.climateBadgeText}>{climateZone}</Text>
              </View>
              <Text style={styles.climateDescText}>{climateDesc}</Text>
            </View>
          </View>

          {/* Intro Section */}
          <View style={styles.introSection}>
            <Text style={styles.introHeading}>Grow Guide for Your Region</Text>
            <View style={styles.tipCard}>
              <RNImage
                source={require('../assets/images/photo-tip.png')}
                style={styles.tipIcon}
                resizeMode="contain"
              />
              <Text style={styles.tipText}>
                Based on your region's latitude ({locationInfo?.latitude.toFixed(2)}°), plants matching these profiles will require less maintenance and have higher survival rates in your outdoor garden or indoor spaces.
              </Text>
            </View>
          </View>

          {/* Plant Recommendations Grid */}
          <View style={styles.recommendationsContainer}>
            <Text style={styles.sectionTitle}>Suitable Local Plants</Text>

            <View style={styles.gridContainer}>
              {recommendedPlants.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.plantCard}
                  activeOpacity={0.9}
                  onPress={() => {
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
                  <Image
                    source={getResolvedImageSource(item.image_url, item.common_name)}
                    style={styles.plantImage}
                    contentFit="cover"
                  />
                  <View style={styles.plantInfo}>
                    <Text style={styles.plantName} numberOfLines={1}>{item.common_name}</Text>
                    <Text style={styles.plantBotanical} numberOfLines={1}>{item.scientific_name}</Text>

                    <View style={styles.metaRow}>
                      <View style={styles.metaBadge}>
                        <RNImage
                          source={require('../assets/images/sun.png')}
                          style={{ width: 12, height: 12 }}
                          resizeMode="contain"
                        />
                        <Text style={styles.metaText} numberOfLines={1}>
                          {formatSunlight(item.sunlight)}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.metaRow, { marginTop: 4 }]}>
                      <View style={styles.metaBadge}>
                        <RNImage
                          source={require('../assets/images/water.png')}
                          style={{ width: 12, height: 12 }}
                          resizeMode="contain"
                        />
                        <Text style={styles.metaText} numberOfLines={1}>
                          {formatWatering(item.watering)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.growingBadge}>
                      <Text style={styles.growingBadgeText}>Recommended</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FAFDFB',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF4EE',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F8F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    width: 18,
    height: 18,
    transform: [{ rotate: '180deg' }],
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F8F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 14,
    color: '#718E7B',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
  },
  locationCard: {
    backgroundColor: '#4E8C44',
    borderRadius: 24,
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8,
  },
  locationCardBgMap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.08,
  },
  locationDetails: {
    marginBottom: 16,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinIcon: {
    marginRight: 12,
  },
  cityText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
  },
  regionText: {
    fontSize: 13,
    color: '#D2ECE3',
    fontWeight: '500',
    marginTop: 2,
  },
  errorBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  errorText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 16,
  },
  climateInfo: {
    gap: 8,
  },
  climateBadge: {
    backgroundColor: '#FFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  climateBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4E8C44',
  },
  climateDescText: {
    fontSize: 12,
    color: '#FFF',
    lineHeight: 18,
    fontWeight: '500',
  },
  introSection: {
    marginTop: 24,
  },
  introHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 12,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF9EE',
    borderWidth: 1,
    borderColor: '#FBE8C5',
    borderRadius: 16,
    padding: 16,
  },
  tipIcon: {
    width: 20,
    height: 20,
    marginRight: 12,
    marginTop: 2,
  },
  locationPinIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
    tintColor: '#FFF',
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: '#7B623B',
    lineHeight: 18,
    fontWeight: '500',
  },
  recommendationsContainer: {
    marginTop: 28,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  plantCard: {
    width: (width - 56) / 2,
    backgroundColor: '#FFF',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EDF4EE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  plantImage: {
    width: '100%',
    height: 120,
    backgroundColor: '#F3F8F2',
  },
  plantInfo: {
    padding: 12,
  },
  plantName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C3A27',
  },
  plantBotanical: {
    fontSize: 10,
    color: '#718E7B',
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F8F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
    maxWidth: '100%',
  },
  metaText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1C3A27',
  },
  growingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F8F2',
    paddingTop: 8,
  },
  growingBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4E8C44',
  },
});
