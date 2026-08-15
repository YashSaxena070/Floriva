import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchCurrentWeather, WeatherData } from '@/services/weatherService';

export default function WeatherCareCard() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWeather();
  }, []);

  const loadWeather = async () => {
    setLoading(true);
    const data = await fetchCurrentWeather();
    setWeather(data);
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.cardContainer}>
        <View style={styles.loadingInner}>
          <ActivityIndicator size="small" color="#3B82F6" />
          <Text style={styles.loadingText}>Fetching local weather care data...</Text>
        </View>
      </View>
    );
  }

  if (!weather) return null;

  return (
    <TouchableOpacity
      style={styles.cardContainer}
      activeOpacity={0.9}
      onPress={loadWeather}
    >
      {/* Container Header Banner / City Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleBadge}>
          <Ionicons name="sunny-outline" size={14} color="#0284C7" />
          <Text style={styles.titleBadgeText}>Weather Care</Text>
        </View>
        <View style={styles.locationContainer}>
          <Ionicons name="location" size={13} color="#0284C7" />
          <Text style={styles.locationCityText} numberOfLines={1}>{weather.city}</Text>
        </View>
      </View>

      {/* Main Content Layout: Left Weather Info | Separator Line | Right Recommendation */}
      <View style={styles.contentRow}>
        {/* Left Side: Weather Info (Matches image design) */}
        <View style={styles.weatherLeftSection}>
          <View style={styles.weatherIconTempRow}>
            <View style={styles.weatherIconWrapper}>
              <Ionicons name={weather.iconName as any} size={36} color={weather.iconColor || "#4A90E2"} />
            </View>
            <View style={styles.tempColumn}>
              <Text style={styles.tempText}>{weather.temp}°C</Text>
              <Text style={styles.conditionText} numberOfLines={2}>{weather.condition}</Text>
            </View>
          </View>
          <Text style={styles.humidityText}>Humidity {weather.humidity}%</Text>
        </View>

        {/* Vertical Line Separator */}
        <View style={styles.verticalDivider} />

        {/* Right Side: Watering Recommendation */}
        <View style={styles.recommendationRightSection}>
          <View style={styles.recHeaderRow}>
            <Text style={styles.recLabel}>Watering Advice</Text>
          </View>

          <View style={[styles.badgePill, { backgroundColor: weather.recommendation.badgeBg }]}>
            <Text style={[styles.badgeText, { color: weather.recommendation.badgeTextColor }]}>
              {weather.recommendation.badgeText}
            </Text>
          </View>

          <Text style={styles.recDescription} numberOfLines={3}>
            {weather.recommendation.description}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#E6F3FB', // Sky blue background color
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#C6E2F7',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  loadingInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D0E8F8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  titleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: '50%',
  },
  locationCityText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherLeftSection: {
    flex: 1.1,
    justifyContent: 'center',
  },
  weatherIconTempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  weatherIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  tempColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  tempText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C3A27',
    lineHeight: 26,
  },
  conditionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#335C67',
    marginTop: 1,
    flexShrink: 1,
  },
  humidityText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#52788D',
    marginTop: 6,
  },
  verticalDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#BDDDF4',
    marginHorizontal: 12,
    marginVertical: 4,
  },
  recommendationRightSection: {
    flex: 1.3,
    justifyContent: 'center',
  },
  recHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  recLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#335C67',
  },
  badgePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  recDescription: {
    fontSize: 11,
    fontWeight: '500',
    color: '#2C4A5E',
    lineHeight: 15,
    marginTop: 2,
  },
});
