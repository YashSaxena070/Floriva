import { getDatabase } from '../database/sqlite';
import { SQLitePlant } from '../types/plant';

/**
 * Repository layer handling database queries to SQLite.
 */
export const plantRepository = {
  /**
   * Save or update a plant record in SQLite.
   */
  async savePlant(plant: SQLitePlant): Promise<void> {
    const db = await getDatabase();
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
  },

  /**
   * Insert junction table relation between a plant and a category.
   */
  async savePlantCategoryLink(plantId: number, categoryId: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'INSERT OR IGNORE INTO PlantCategories (plant_id, category_id) VALUES (?, ?)',
      [plantId, categoryId]
    );
  },

  /**
   * Retrieve category ID by its name.
   */
  async getCategoryIdByName(name: string): Promise<number | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM Categories WHERE category_name = ?',
      [name]
    );
    return row ? row.id : null;
  },

  /**
   * Fetch all plants in the database.
   */
  async getAllPlants(): Promise<SQLitePlant[]> {
    const db = await getDatabase();
    return db.getAllAsync<SQLitePlant>('SELECT * FROM Plants ORDER BY common_name ASC');
  },

  /**
   * Offline text search across Common Name, Scientific Name, Family, and Genus.
   */
  async searchPlants(query: string): Promise<SQLitePlant[]> {
    const db = await getDatabase();
    const wildCard = `%${query}%`;
    return db.getAllAsync<SQLitePlant>(
      `SELECT * FROM Plants 
       WHERE common_name LIKE ? 
          OR scientific_name LIKE ? 
          OR family LIKE ? 
          OR genus LIKE ? 
       ORDER BY common_name ASC`,
      [wildCard, wildCard, wildCard, wildCard]
    );
  },

  /**
   * Fetch a single plant record by its primary key ID.
   */
  async getPlantById(id: number): Promise<SQLitePlant | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SQLitePlant>(
      'SELECT * FROM Plants WHERE id = ?',
      [id]
    );
    return row || null;
  },

  /**
   * Fetch plants associated with a specific category name.
   */
  async getPlantsByCategory(categoryName: string): Promise<SQLitePlant[]> {
    const db = await getDatabase();
    return db.getAllAsync<SQLitePlant>(
      `SELECT P.* FROM Plants P
       INNER JOIN PlantCategories PC ON P.id = PC.plant_id
       INNER JOIN Categories C ON C.id = PC.category_id
       WHERE C.category_name = ?
       ORDER BY P.common_name ASC`,
      [categoryName]
    );
  },

  /**
   * Fetch indoor-compatible plants.
   */
  async getIndoorPlants(): Promise<SQLitePlant[]> {
    const db = await getDatabase();
    return db.getAllAsync<SQLitePlant>('SELECT * FROM Plants WHERE indoor = 1 ORDER BY common_name ASC');
  },

  /**
   * Fetch outdoor-compatible plants.
   */
  async getOutdoorPlants(): Promise<SQLitePlant[]> {
    const db = await getDatabase();
    return db.getAllAsync<SQLitePlant>('SELECT * FROM Plants WHERE indoor = 0 ORDER BY common_name ASC');
  },

  /**
   * Fetch medicinal plants.
   */
  async getMedicinalPlants(): Promise<SQLitePlant[]> {
    const db = await getDatabase();
    return db.getAllAsync<SQLitePlant>('SELECT * FROM Plants WHERE medicinal = 1 ORDER BY common_name ASC');
  },

  /**
   * Fetch plants under the Flowers category.
   */
  async getFloweringPlants(): Promise<SQLitePlant[]> {
    return this.getPlantsByCategory('Flowers');
  },

  /**
   * Fetch plants under the Trees category.
   */
  async getTrees(): Promise<SQLitePlant[]> {
    return this.getPlantsByCategory('Trees');
  },

  /**
   * Fetch plants under the Succulents category.
   */
  async getSucculents(): Promise<SQLitePlant[]> {
    return this.getPlantsByCategory('Succulents');
  },

  /**
   * Fetch plants under the Air Purifying category.
   */
  async getAirPurifyingPlants(): Promise<SQLitePlant[]> {
    return this.getPlantsByCategory('Air Purifying Plants');
  }
};
