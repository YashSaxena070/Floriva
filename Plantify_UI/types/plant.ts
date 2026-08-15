export interface PerenualPlantListResponse {
  data: PerenualPlantListItem[];
  to: number;
  per_page: number;
  current_page: number;
  from: number;
  last_page: number;
  total: number;
}

export interface PerenualPlantListItem {
  id: number;
  common_name: string;
  scientific_name: string[];
  other_name?: string[];
  cycle: string;
  watering: string;
  sunlight: string[];
  default_image: {
    original_url: string;
    regular_url: string;
    medium_url: string;
    small_url: string;
    thumbnail: string;
  } | null;
}

export interface PerenualPlantDetailsResponse extends PerenualPlantListItem {
  family: string | null;
  genus: string | null;
  indoor: boolean | null;
  poisonous_to_humans: number | null;
  poisonous_to_pets: number | null;
  care_level: string | null;
  growth_rate: string | null;
  drought_tolerant: boolean | null;
  salt_tolerant: boolean | null;
  medicinal: boolean | null;
  edible: boolean | null;
  description: string | null;
}

export interface SQLitePlant {
  id: number;
  common_name: string;
  scientific_name: string;
  family: string;
  genus: string;
  cycle: string;
  watering: string;
  sunlight: string; // JSON string
  indoor: number; // 0 or 1
  poisonous_to_humans: number; // 0 or 1
  poisonous_to_pets: number; // 0 or 1
  care_level: string;
  growth_rate: string;
  drought_tolerant: number; // 0 or 1
  salt_tolerant: number; // 0 or 1
  medicinal: number; // 0 or 1
  edible: number; // 0 or 1
  description: string;
  image_url: string;
  thumbnail_url: string;
}

export interface Category {
  id: number;
  category_name: string;
}
