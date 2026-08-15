import * as Location from 'expo-location';

export interface WeatherRecommendation {
  badgeText: string;
  badgeBg: string;
  badgeTextColor: string;
  title: string;
  description: string;
  action: 'water' | 'skip' | 'moderate';
}

export interface WeatherData {
  city: string;
  temp: number;
  condition: string;
  humidity: number;
  iconName: string;
  iconColor: string;
  recommendation: WeatherRecommendation;
}

const DEFAULT_WEATHER: WeatherData = {
  city: 'New Delhi',
  temp: 32,
  condition: 'Partly Cloudy',
  humidity: 70,
  iconName: 'cloudy',
  iconColor: '#5B9BD5',
  recommendation: {
    badgeText: '🌱 Light Watering',
    badgeBg: '#D8EEFA',
    badgeTextColor: '#105B8C',
    title: 'Moisture Stable',
    description: '70% humidity keeps soil moist. Water lightly if topsoil is dry.',
    action: 'moderate',
  },
};

const WEATHER_API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY || '';

function getConditionIcon(conditionText: string, code: number): { iconName: string; iconColor: string } {
  const text = conditionText.toLowerCase();

  if (text.includes('sunny') || text.includes('clear')) {
    return { iconName: 'sunny', iconColor: '#E6A100' };
  }
  if (text.includes('partly cloudy')) {
    return { iconName: 'partly-sunny', iconColor: '#4A90E2' };
  }
  if (text.includes('cloud') || text.includes('overcast')) {
    return { iconName: 'cloudy', iconColor: '#6C7A89' };
  }
  if (text.includes('rain') || text.includes('drizzle') || text.includes('shower')) {
    return { iconName: 'rainy', iconColor: '#2B6CB0' };
  }
  if (text.includes('thunder')) {
    return { iconName: 'thunderstorm', iconColor: '#4C51BF' };
  }
  if (text.includes('snow') || text.includes('ice') || text.includes('blizzard')) {
    return { iconName: 'snow', iconColor: '#718096' };
  }
  if (text.includes('fog') || text.includes('mist')) {
    return { iconName: 'cloud-outline', iconColor: '#8E9AAF' };
  }
  return { iconName: 'partly-sunny', iconColor: '#4A90E2' };
}

function calculateRecommendation(temp: number, humidity: number, conditionText: string): WeatherRecommendation {
  const text = conditionText.toLowerCase();
  const isRaining = text.includes('rain') || text.includes('drizzle') || text.includes('thunder') || text.includes('shower') || text.includes('snow');

  if (isRaining || humidity >= 80) {
    return {
      badgeText: '🌧️ Skip Watering',
      badgeBg: '#D6EAF8',
      badgeTextColor: '#1B4F72',
      title: 'No Water Needed',
      description: 'Rain & high moisture in the air. Soil will stay hydrated naturally.',
      action: 'skip',
    };
  }

  if (temp >= 32 && humidity < 50) {
    return {
      badgeText: '💧 Water Today',
      badgeBg: '#D4E6F1',
      badgeTextColor: '#154360',
      title: 'Hydration Needed',
      description: 'Hot & dry weather! Your plants require extra water today.',
      action: 'water',
    };
  }

  if (temp < 18) {
    return {
      badgeText: '⏳ Hold Off',
      badgeBg: '#E5E8E8',
      badgeTextColor: '#424949',
      title: 'Slow Uptake',
      description: 'Cool weather reduces evaporation. Water sparingly.',
      action: 'skip',
    };
  }

  if (humidity >= 65) {
    return {
      badgeText: '🌱 Light Watering',
      badgeBg: '#D8EEFA',
      badgeTextColor: '#105B8C',
      title: 'Moisture Stable',
      description: `Humidity is ${humidity}%. Water lightly if topsoil feels dry.`,
      action: 'moderate',
    };
  }

  return {
    badgeText: '💧 Water Recommended',
    badgeBg: '#D4E6F1',
    badgeTextColor: '#154360',
    title: 'Good Time to Water',
    description: 'Optimal weather for regular plant watering schedule.',
    action: 'water',
  };
}

export async function fetchCurrentWeather(): Promise<WeatherData> {
  try {
    let queryLocation = 'New Delhi';

    // 1. Try to get lat,lon from Location permissions
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') {
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        queryLocation = `${location.coords.latitude},${location.coords.longitude}`;
      } catch (locErr) {
        console.warn('Could not retrieve current position:', locErr);
      }
    }

    // 2. Fetch weather using WeatherAPI key from process.env.EXPO_PUBLIC_WEATHER_API_KEY
    const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(queryLocation)}&aqi=no`;
    const res = await fetch(url);

    if (res.ok) {
      const data = await res.json();
      if (data && data.current && data.location) {
        const cityName = data.location.name || 'Your Location';
        const temp = Math.round(data.current.temp_c);
        const humidity = Math.round(data.current.humidity);
        const conditionText = data.current.condition?.text || 'Partly Cloudy';
        const conditionCode = data.current.condition?.code || 1003;

        const { iconName, iconColor } = getConditionIcon(conditionText, conditionCode);
        const recommendation = calculateRecommendation(temp, humidity, conditionText);

        return {
          city: cityName,
          temp,
          condition: conditionText,
          humidity,
          iconName,
          iconColor,
          recommendation,
        };
      }
    } else {
      console.warn('WeatherAPI call returned non-200 status:', res.status);
    }
  } catch (err) {
    console.warn('Failed to fetch weather from WeatherAPI:', err);
  }

  return DEFAULT_WEATHER;
}
