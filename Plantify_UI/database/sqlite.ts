import * as SQLite from 'expo-sqlite';

let databaseInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Open and return the SQLite database instance asynchronously.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (databaseInstance) return databaseInstance;
  databaseInstance = await SQLite.openDatabaseAsync('plantify_plants.db');
  return databaseInstance;
}

/**
 * Set up the initial SQLite schemas and insert categories.
 */
export async function setupDatabase(): Promise<void> {
  const db = await getDatabase();

  // Create tables
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS Plants (
      id INTEGER PRIMARY KEY,
      common_name TEXT NOT NULL,
      scientific_name TEXT,
      family TEXT,
      genus TEXT,
      cycle TEXT,
      watering TEXT,
      sunlight TEXT,
      indoor INTEGER DEFAULT 0,
      poisonous_to_humans INTEGER DEFAULT 0,
      poisonous_to_pets INTEGER DEFAULT 0,
      care_level TEXT,
      growth_rate TEXT,
      drought_tolerant INTEGER DEFAULT 0,
      salt_tolerant INTEGER DEFAULT 0,
      medicinal INTEGER DEFAULT 0,
      edible INTEGER DEFAULT 0,
      description TEXT,
      image_url TEXT,
      thumbnail_url TEXT
    );

    CREATE TABLE IF NOT EXISTS Categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS PlantCategories (
      plant_id INTEGER,
      category_id INTEGER,
      PRIMARY KEY (plant_id, category_id),
      FOREIGN KEY (plant_id) REFERENCES Plants(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES Categories(id) ON DELETE CASCADE
    );
  `);

  // Insert default categories
  const categories = [
    'Featured Plants',
    'Indoor Plants',
    'Outdoor Plants',
    'Trees',
    'Flowers',
    'Succulents',
    'Medicinal Plants',
    'Popular Plants',
    'Air Purifying Plants',
    'Recently Added'
  ];

  for (const cat of categories) {
    try {
      await db.runAsync(
        'INSERT OR IGNORE INTO Categories (category_name) VALUES (?)',
        [cat]
      );
    } catch (err) {
      console.warn('Error inserting default category:', cat, err);
    }
  }

  const seedPlants = [
    {
      id: 990001,
      common_name: "Snake Plant",
      scientific_name: "Sansevieria trifasciata",
      family: "Asparagaceae",
      genus: "Sansevieria",
      cycle: "Perennial",
      watering: "Minimum",
      sunlight: JSON.stringify(["Part shade", "Low light"]),
      indoor: 1,
      poisonous_to_humans: 1,
      poisonous_to_pets: 1,
      care_level: "Easy",
      growth_rate: "Slow",
      drought_tolerant: 1,
      salt_tolerant: 0,
      medicinal: 0,
      edible: 0,
      description: "Sansevieria trifasciata is a species of flowering plant in the family Asparagaceae, native to tropical West Africa. It is most commonly known as the snake plant, mother-in-law's tongue, and viper's bowstring hemp.",
      image_url: "https://images.unsplash.com/photo-1596547609652-9cf5d8d76921?q=80&w=500&auto=format&fit=crop",
      thumbnail_url: "https://images.unsplash.com/photo-1596547609652-9cf5d8d76921?q=80&w=150&auto=format&fit=crop",
      categories: ["Featured Plants", "Indoor Plants", "Popular Plants", "Air Purifying Plants"]
    },
    {
      id: 990002,
      common_name: "Aloe Vera",
      scientific_name: "Aloe barbadensis miller",
      family: "Asphodelaceae",
      genus: "Aloe",
      cycle: "Perennial",
      watering: "Minimum",
      sunlight: JSON.stringify(["Full sun", "Part shade"]),
      indoor: 1,
      poisonous_to_humans: 0,
      poisonous_to_pets: 1,
      care_level: "Easy",
      growth_rate: "Regular",
      drought_tolerant: 1,
      salt_tolerant: 1,
      medicinal: 1,
      edible: 0,
      description: "Aloe vera is a succulent plant species of the genus Aloe. It is widely used in traditional herbal medicine, skincare, and cosmetics due to its soothing gel.",
      image_url: "https://images.unsplash.com/photo-1596547610051-fb1fbe7556f8?q=80&w=500&auto=format&fit=crop",
      thumbnail_url: "https://images.unsplash.com/photo-1596547610051-fb1fbe7556f8?q=80&w=150&auto=format&fit=crop",
      categories: ["Indoor Plants", "Succulents", "Medicinal Plants", "Popular Plants"]
    },
    {
      id: 990003,
      common_name: "Monstera Deliciosa",
      scientific_name: "Monstera deliciosa",
      family: "Araceae",
      genus: "Monstera",
      cycle: "Perennial",
      watering: "Average",
      sunlight: JSON.stringify(["Part shade", "Indirect light"]),
      indoor: 1,
      poisonous_to_humans: 1,
      poisonous_to_pets: 1,
      care_level: "Medium",
      growth_rate: "Regular",
      drought_tolerant: 0,
      salt_tolerant: 0,
      medicinal: 0,
      edible: 0,
      description: "Monstera deliciosa is a species of flowering plant native to tropical forests of southern Mexico. Famous for its iconic leaf fenestrations, it is a very popular houseplant.",
      image_url: "https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=500&auto=format&fit=crop",
      thumbnail_url: "https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=150&auto=format&fit=crop",
      categories: ["Featured Plants", "Indoor Plants", "Popular Plants", "Air Purifying Plants"]
    },
    {
      id: 990004,
      common_name: "Peace Lily",
      scientific_name: "Spathiphyllum wallisii",
      family: "Araceae",
      genus: "Spathiphyllum",
      cycle: "Perennial",
      watering: "Average",
      sunlight: JSON.stringify(["Part shade", "Low light"]),
      indoor: 1,
      poisonous_to_humans: 1,
      poisonous_to_pets: 1,
      care_level: "Easy",
      growth_rate: "Regular",
      drought_tolerant: 0,
      salt_tolerant: 0,
      medicinal: 0,
      edible: 0,
      description: "Spathiphyllum is a genus of monocotyledonous flowering plants. They are known for their beautiful white spathes and excellent air-purifying qualities.",
      image_url: "https://images.unsplash.com/photo-1616690710400-a16d55d908c5?q=80&w=500&auto=format&fit=crop",
      thumbnail_url: "https://images.unsplash.com/photo-1616690710400-a16d55d908c5?q=80&w=150&auto=format&fit=crop",
      categories: ["Indoor Plants", "Flowers", "Air Purifying Plants"]
    },
    {
      id: 990005,
      common_name: "Tulsi",
      scientific_name: "Ocimum tenuiflorum",
      family: "Lamiaceae",
      genus: "Ocimum",
      cycle: "Perennial",
      watering: "Average",
      sunlight: JSON.stringify(["Full sun"]),
      indoor: 1,
      poisonous_to_humans: 0,
      poisonous_to_pets: 0,
      care_level: "Medium",
      growth_rate: "Fast",
      drought_tolerant: 0,
      salt_tolerant: 0,
      medicinal: 1,
      edible: 1,
      description: "Ocimum tenuiflorum, commonly known as holy basil or tulsi, is an aromatic perennial plant in the family Lamiaceae. It is highly revered in India for medicinal and spiritual reasons.",
      image_url: "https://images.unsplash.com/photo-1578159812516-e5c6a1e80931?q=80&w=500&auto=format&fit=crop",
      thumbnail_url: "https://images.unsplash.com/photo-1578159812516-e5c6a1e80931?q=80&w=150&auto=format&fit=crop",
      categories: ["Indoor Plants", "Medicinal Plants", "Popular Plants"]
    },
    {
      id: 990006,
      common_name: "Zebra Cactus",
      scientific_name: "Haworthiopsis fasciata",
      family: "Asphodelaceae",
      genus: "Haworthiopsis",
      cycle: "Perennial",
      watering: "Minimum",
      sunlight: JSON.stringify(["Bright indirect", "Part shade"]),
      indoor: 1,
      poisonous_to_humans: 0,
      poisonous_to_pets: 0,
      care_level: "Easy",
      growth_rate: "Slow",
      drought_tolerant: 1,
      salt_tolerant: 0,
      medicinal: 0,
      edible: 0,
      description: "Zebra cactus is a small succulent plant native to South Africa. It has distinct white horizontal stripes on its leaves, resembling zebra patterns.",
      image_url: "https://images.unsplash.com/photo-1520302630591-fd1c66ed81dd?q=80&w=500&auto=format&fit=crop",
      thumbnail_url: "https://images.unsplash.com/photo-1520302630591-fd1c66ed81dd?q=80&w=150&auto=format&fit=crop",
      categories: ["Indoor Plants", "Succulents"]
    },
    {
      id: 990007,
      common_name: "Red Rose",
      scientific_name: "Rosa rubiginosa",
      family: "Rosaceae",
      genus: "Rosa",
      cycle: "Perennial",
      watering: "Average",
      sunlight: JSON.stringify(["Full sun"]),
      indoor: 0,
      poisonous_to_humans: 0,
      poisonous_to_pets: 0,
      care_level: "Medium",
      growth_rate: "Regular",
      drought_tolerant: 0,
      salt_tolerant: 0,
      medicinal: 0,
      edible: 0,
      description: "A beautiful garden rose known for its brilliant red blossoms and pleasant fragrance. Thrives in full sun and well-draining soil.",
      image_url: "https://images.unsplash.com/photo-1559863345-02eae058c2c2?q=80&w=500&auto=format&fit=crop",
      thumbnail_url: "https://images.unsplash.com/photo-1559863345-02eae058c2c2?q=80&w=150&auto=format&fit=crop",
      categories: ["Featured Plants", "Outdoor Plants", "Flowers"]
    },
    {
      id: 990008,
      common_name: "Japanese Maple",
      scientific_name: "Acer palmatum",
      family: "Sapindaceae",
      genus: "Acer",
      cycle: "Perennial",
      watering: "Average",
      sunlight: JSON.stringify(["Full sun", "Part shade"]),
      indoor: 0,
      poisonous_to_humans: 0,
      poisonous_to_pets: 0,
      care_level: "Medium",
      growth_rate: "Regular",
      drought_tolerant: 0,
      salt_tolerant: 0,
      medicinal: 0,
      edible: 0,
      description: "Acer palmatum is a species of woody plant native to Japan, China, and Korea. It is highly valued for its elegant leaf shape and brilliant autumn colors.",
      image_url: "https://images.unsplash.com/photo-1506084868230-bb9d95c24759?q=80&w=500&auto=format&fit=crop",
      thumbnail_url: "https://images.unsplash.com/photo-1506084868230-bb9d95c24759?q=80&w=150&auto=format&fit=crop",
      categories: ["Outdoor Plants", "Trees"]
    }
  ];

  for (const plant of seedPlants) {
    try {
      await db.runAsync(
        `INSERT OR IGNORE INTO Plants (
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
          plant.thumbnail_url
        ]
      );

      for (const catName of plant.categories) {
        const catRow = await db.getFirstAsync<{ id: number }>('SELECT id FROM Categories WHERE category_name = ?', [catName]);
        if (catRow) {
          await db.runAsync(
            'INSERT OR IGNORE INTO PlantCategories (plant_id, category_id) VALUES (?, ?)',
            [plant.id, catRow.id]
          );
        }
      }
    } catch (err) {
      console.warn('Error seeding plant:', plant.common_name, err);
    }
  }
}
