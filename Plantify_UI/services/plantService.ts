import AsyncStorage from '@react-native-async-storage/async-storage';
import { plantRepository } from '../repositories/plantRepository';
import { setupDatabase, getDatabase } from '../database/sqlite';
import { PerenualPlantListResponse, SQLitePlant } from '../types/plant';

const PERENUAL_API_KEY = process.env.EXPO_PUBLIC_PERENUAL_API_KEY || process.env.PERENUAL_API_KEY || '';
const DB_VERSION = '1.0.2';

/**
 * Fetch a URL with request retry logic (exponential backoff on rate limits).
 */
async function fetchWithRetry(url: string, retries = 4, delay = 1500): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
      
      if (response.status === 429) {
        const backoff = delay * Math.pow(2, i + 1);
        console.warn(`Rate limited (429). Retrying after ${backoff}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      } else {
        throw new Error(`HTTP error ${response.status}`);
      }
    } catch (err) {
      if (i === retries - 1) throw err;
      const backoff = delay * Math.pow(2, i);
      console.warn(`Fetch failed: ${url}. Retrying in ${backoff}ms... Error:`, err);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

export const plantService = {
  /**
   * Initialize SQLite tables, check sync state. If database is missing, starts sync.
   * Returns true if sync is needed, false if database is already fully cached.
   */
  async initializeDatabase(): Promise<boolean> {
    await setupDatabase();
    const lastSync = await AsyncStorage.getItem('@lastPlantSync');
    const cachedVersion = await AsyncStorage.getItem('@databaseVersion');

    if (!lastSync || cachedVersion !== DB_VERSION) {
      return true; // Synchronization required
    }
    return false;
  },

  /**
   * Fetch pages iteratively from Perenual API, save to database, and link categories.
   */
  async downloadAndSyncPlants(
    onProgress: (progress: number, statusText: string) => void
  ): Promise<void> {
    try {
      onProgress(0.1, 'Loading local plant database...');

      const db = await getDatabase();
      const plantsData = require('../assets/plants_dataset.json');

      const categoryIds = {
        featured: await plantRepository.getCategoryIdByName('Featured Plants'),
        indoor: await plantRepository.getCategoryIdByName('Indoor Plants'),
        outdoor: await plantRepository.getCategoryIdByName('Outdoor Plants'),
        trees: await plantRepository.getCategoryIdByName('Trees'),
        flowers: await plantRepository.getCategoryIdByName('Flowers'),
        succulents: await plantRepository.getCategoryIdByName('Succulents'),
        medicinal: await plantRepository.getCategoryIdByName('Medicinal Plants'),
        popular: await plantRepository.getCategoryIdByName('Popular Plants'),
        purifying: await plantRepository.getCategoryIdByName('Air Purifying Plants'),
        recent: await plantRepository.getCategoryIdByName('Recently Added'),
      };

      onProgress(0.3, `Importing ${plantsData.length} plants into SQLite...`);

      // Save records inside a fast database transaction
      await db.withTransactionAsync(async () => {
        for (const plant of plantsData) {
          await db.runAsync(
            `INSERT OR REPLACE INTO Plants (
              id, common_name, scientific_name, family, genus, cycle, watering, sunlight,
              indoor, poisonous_to_humans, poisonous_to_pets, care_level, growth_rate,
              drought_tolerant, salt_tolerant, medicinal, edible, description, image_url, thumbnail_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              plant.id,
              plant.common_name,
              plant.scientific_name,
              plant.family,
              plant.genus,
              plant.cycle,
              plant.watering,
              plant.sunlight,
              plant.indoor,
              plant.poisonous_to_humans,
              plant.poisonous_to_pets,
              plant.care_level,
              plant.growth_rate,
              plant.drought_tolerant,
              plant.salt_tolerant,
              plant.medicinal,
              plant.edible,
              plant.description,
              plant.image_url,
              plant.thumbnail_url,
            ]
          );

          // Category Junction linker helper
          const linkCategory = async (catId: number | null) => {
            if (catId) {
              await db.runAsync(
                'INSERT OR IGNORE INTO PlantCategories (plant_id, category_id) VALUES (?, ?)',
                [plant.id, catId]
              );
            }
          };

          // Link categories
          if (plant.categories && Array.isArray(plant.categories)) {
            for (const catName of plant.categories) {
              const catId = await plantRepository.getCategoryIdByName(catName);
              await linkCategory(catId);
            }
          }
        }
      });

      // Save sync states
      await AsyncStorage.setItem('@lastPlantSync', new Date().toISOString());
      await AsyncStorage.setItem('@databaseVersion', DB_VERSION);

      onProgress(1.0, `Offline Database Ready! ${plantsData.length} plants stored.`);
    } catch (err) {
      console.error('Offline plant database synchronization failed:', err);
      throw err;
    }
  },

  // Proxy getters mapping to Repository Layer queries
  async getAllPlants() {
    return plantRepository.getAllPlants();
  },

  async searchPlants(query: string) {
    return plantRepository.searchPlants(query);
  },

  async getPlantById(id: number) {
    return plantRepository.getPlantById(id);
  },

  async getPlantsByCategory(categoryName: string) {
    let dbCategoryName = categoryName;
    if (categoryName === 'Flowering') {
      dbCategoryName = 'Flowers';
    } else if (categoryName === 'Medicinal') {
      dbCategoryName = 'Medicinal Plants';
    }
    return plantRepository.getPlantsByCategory(dbCategoryName);
  },

  async getIndoorPlants() {
    return plantRepository.getIndoorPlants();
  },

  async getOutdoorPlants() {
    return plantRepository.getOutdoorPlants();
  },

  async getMedicinalPlants() {
    return plantRepository.getMedicinalPlants();
  },

  async getFloweringPlants() {
    return plantRepository.getFloweringPlants();
  },

  async getTrees() {
    return plantRepository.getTrees();
  },

  async getSucculents() {
    return plantRepository.getSucculents();
  },

  async getAirPurifyingPlants() {
    return plantRepository.getAirPurifyingPlants();
  }
};
