export interface HealthAnalysisResult {
  healthScore: number;
  healthStatus: 'Excellent' | 'Good' | 'Needs Attention';
  issueTitle: string;
  issueDescription: string;
  wateringDays: number;
  wateringScheduleText: string;
  isScanDue: boolean;
  isOverdue10Days: boolean;
  daysSinceLastScan: number;
}

/**
 * Calculates dynamic health score, plant issue, and watering schedule
 * based on PlantNet score, plant metadata, and last scan timestamp.
 */
export function analyzePlantHealth(plant: {
  confidence?: string | number;
  lastScannedDate?: number;
  name?: string;
  botanicalName?: string;
  watering?: string;
}): HealthAnalysisResult {
  const now = Date.now();
  const lastScan = plant.lastScannedDate || (now - 2 * 24 * 60 * 60 * 1000); // default to 2 days ago
  const daysSinceLastScan = Math.max(0, Math.floor((now - lastScan) / (1000 * 60 * 60 * 24)));
  const isScanDue = daysSinceLastScan >= 7;
  const isOverdue10Days = daysSinceLastScan > 10;

  // Confidence / identification score from PlantNet
  const rawScore = typeof plant.confidence === 'number' ? plant.confidence : parseFloat(plant.confidence || '92');
  const baseScore = isNaN(rawScore) ? 90 : (rawScore > 1 ? rawScore : rawScore * 100);

  // Deduct 2 points for every day over 7 days without a health rescan
  const decay = isScanDue ? Math.min(15, (daysSinceLastScan - 7) * 2) : 0;
  const healthScore = Math.max(65, Math.min(99, Math.round(baseScore - decay)));

  let healthStatus: 'Excellent' | 'Good' | 'Needs Attention' = 'Excellent';
  if (healthScore < 80) {
    healthStatus = 'Needs Attention';
  } else if (healthScore < 90) {
    healthStatus = 'Good';
  }

  // Calculate watering interval based on plant name / watering preference
  const nameLower = (plant.name || '').toLowerCase();
  const waterLower = (plant.watering || '').toLowerCase();

  let wateringDays = 3;
  if (nameLower.includes('cactus') || nameLower.includes('succulent') || nameLower.includes('aloe') || nameLower.includes('snake')) {
    wateringDays = 7;
  } else if (nameLower.includes('fern') || nameLower.includes('calathea') || waterLower.includes('frequent')) {
    wateringDays = 2;
  } else if (waterLower.includes('minimum') || waterLower.includes('low')) {
    wateringDays = 5;
  } else {
    wateringDays = 3; // Default 3 days as requested
  }

  const wateringScheduleText = `Water every ${wateringDays} days`;

  // Determine plant issue diagnosis
  let issueTitle = 'Optimal Health';
  let issueDescription = `Plant shows vibrant foliage with no major disease symptoms. ${wateringScheduleText}.`;

  if (healthScore >= 90) {
    issueTitle = 'Healthy Growth & Moisture';
    issueDescription = `Nutrient and hydration levels are optimal. Continue schedule: ${wateringScheduleText}.`;
  } else if (healthScore >= 80) {
    issueTitle = 'Minor Leaf Dryness';
    issueDescription = `Slight soil dryout detected. Replenish moisture: ${wateringScheduleText}.`;
  } else {
    issueTitle = 'Moisture & Lighting Stress';
    issueDescription = `Foliage shows slight wilting or discoloration. Move to indirect sun and ${wateringScheduleText.toLowerCase()}.`;
  }

  return {
    healthScore,
    healthStatus,
    issueTitle,
    issueDescription,
    wateringDays,
    wateringScheduleText,
    isScanDue,
    isOverdue10Days,
    daysSinceLastScan,
  };
}

export interface WateringCountdownResult {
  status: 'watered_today' | 'due_today' | 'upcoming';
  label: string;
  badgeBg: string;
  badgeTextColor: string;
  daysRemaining: number;
}

/**
 * Calculates dynamic watering countdown, "Watered Today" state,
 * or remaining days for next watering.
 */
export function getWateringCountdown(plant: {
  lastWateredDate?: number;
  wateringIntervalDays?: number;
  watering?: string;
  name?: string;
}): WateringCountdownResult {
  const now = Date.now();
  const lastWatered = plant.lastWateredDate;

  // Determine interval days if not explicitly set
  let interval = plant.wateringIntervalDays || 3;
  const nameLower = (plant.name || '').toLowerCase();
  const waterLower = (plant.watering || '').toLowerCase();

  if (nameLower.includes('cactus') || nameLower.includes('succulent') || nameLower.includes('aloe') || nameLower.includes('snake')) {
    interval = 7;
  } else if (nameLower.includes('fern') || nameLower.includes('calathea') || waterLower.includes('frequent')) {
    interval = 2;
  } else if (waterLower.includes('minimum') || waterLower.includes('low')) {
    interval = 5;
  } else {
    interval = 3;
  }

  // 1. Check if watered today (same calendar day)
  if (lastWatered) {
    const lastDate = new Date(lastWatered);
    const currentDate = new Date(now);
    const isSameDay =
      lastDate.getFullYear() === currentDate.getFullYear() &&
      lastDate.getMonth() === currentDate.getMonth() &&
      lastDate.getDate() === currentDate.getDate();

    if (isSameDay) {
      return {
        status: 'watered_today',
        label: 'Watered Today ✅',
        badgeBg: '#DCFCE7', // Soft light green
        badgeTextColor: '#15803D',
        daysRemaining: interval,
      };
    }
  }

  // 2. Calculate days elapsed since last watered
  const lastWateredTime = lastWatered || (now - interval * 24 * 60 * 60 * 1000); // Default to due today if not set
  const daysElapsed = Math.floor((now - lastWateredTime) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, interval - daysElapsed);

  if (daysRemaining === 0) {
    return {
      status: 'due_today',
      label: 'Water Today 💧',
      badgeBg: '#FEF3C7', // Soft warning yellow
      badgeTextColor: '#B45309',
      daysRemaining: 0,
    };
  }

  if (daysRemaining === 1) {
    return {
      status: 'upcoming',
      label: 'Water Tomorrow 💧',
      badgeBg: '#E0F2FE', // Soft sky blue
      badgeTextColor: '#0369A1',
      daysRemaining: 1,
    };
  }

  return {
    status: 'upcoming',
    label: `Water in ${daysRemaining} days`,
    badgeBg: '#E0F2FE', // Soft sky blue
    badgeTextColor: '#0369A1',
    daysRemaining,
  };
}

