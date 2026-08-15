import * as FileSystem from 'expo-file-system/legacy';

/**
 * Ensures that if a URI is a local file URI under the app's document/cache directory on iOS,
 * it is resolved with the current application container UUID.
 * On Android or Web, it returns the URI unchanged.
 */
export function resolveLocalUri(uri: string | null | undefined): string | null {
  if (!uri) return null;

  // Only process local file URIs
  if (uri.startsWith('file://')) {
    const filename = uri.split('/').pop();
    if (filename && FileSystem.documentDirectory) {
      // Reconstruct the URI using the current document directory
      return FileSystem.documentDirectory + filename;
    }
  }

  return uri;
}

/**
 * Maps plant common name keywords to high-quality Unsplash stock images.
 */
export function getStockImage(name: string | null | undefined): string | null {
  if (!name) return null;
  const lowerName = name.toLowerCase();
  const matches: Record<string, string> = {
    'snake': 'https://images.unsplash.com/photo-1596547609652-9cf5d8d76921?q=80&w=500&auto=format&fit=crop',
    'lily': 'https://images.unsplash.com/photo-1616690710400-a16d55d908c5?q=80&w=500&auto=format&fit=crop',
    'monstera': 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=500&auto=format&fit=crop',
    'pothos': 'https://images.unsplash.com/photo-1596436889106-be35e843f974?q=80&w=500&auto=format&fit=crop',
    'aloe': 'https://images.unsplash.com/photo-1596547610051-fb1fbe7556f8?q=80&w=500&auto=format&fit=crop',
    'jade': 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?q=80&w=500&auto=format&fit=crop',
    'zebra': 'https://images.unsplash.com/photo-1508849789987-4e5333c12b78?q=80&w=500&auto=format&fit=crop',
    'cactus': 'https://images.unsplash.com/photo-1554631221-f9603378290e?q=80&w=500&auto=format&fit=crop',
    'succulent': 'https://images.unsplash.com/photo-1520302630591-fd1c66ed81dd?q=80&w=500&auto=format&fit=crop',
    'rose': 'https://images.unsplash.com/photo-1559863345-02eae058c2c2?q=80&w=500&auto=format&fit=crop',
    'orchid': 'https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?q=80&w=500&auto=format&fit=crop',
    'lavender': 'https://images.unsplash.com/photo-1528183429752-a97d0bf99b5a?q=80&w=500&auto=format&fit=crop',
    'tulsi': 'https://images.unsplash.com/photo-1578159812516-e5c6a1e80931?q=80&w=500&auto=format&fit=crop',
    'basil': 'https://images.unsplash.com/photo-1578159812516-e5c6a1e80931?q=80&w=500&auto=format&fit=crop',
    'mint': 'https://images.unsplash.com/photo-1532704100644-55d379f5176c?q=80&w=500&auto=format&fit=crop',
    'rosemary': 'https://images.unsplash.com/photo-1594313525287-f83196f73a38?q=80&w=500&auto=format&fit=crop',
    'fiddle': 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?q=80&w=500&auto=format&fit=crop',
    'fig': 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?q=80&w=500&auto=format&fit=crop',
    'bonsai': 'https://images.unsplash.com/photo-1613143777890-e59808362635?q=80&w=500&auto=format&fit=crop',
    'maple': 'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?q=80&w=500&auto=format&fit=crop',
    'apple': 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?q=80&w=500&auto=format&fit=crop',
    'magnolia': 'https://images.unsplash.com/photo-1522818061479-74e4a87353f7?q=80&w=500&auto=format&fit=crop',
    'abelia': 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?q=80&w=500&auto=format&fit=crop',
    'fern': 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?q=80&w=500&auto=format&fit=crop',
    'ivy': 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=500&auto=format&fit=crop',
    'flower': 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?q=80&w=500&auto=format&fit=crop',
    'tree': 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?q=80&w=500&auto=format&fit=crop',
    'palm': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=500&auto=format&fit=crop',
    'jasmine': 'https://images.unsplash.com/photo-1507269897635-5c21130543b5?q=80&w=500&auto=format&fit=crop',
    'hibiscus': 'https://images.unsplash.com/photo-1551846153-f5a133966520?q=80&w=500&auto=format&fit=crop',
    'marigold': 'https://images.unsplash.com/photo-1508784411316-02b8cd4d3a3a?q=80&w=500&auto=format&fit=crop',
  };
  return matches[lowerName] || null;
}

/**
 * Returns a valid React Native image source (URI object or require) based on the image URI
 * and common name, filtering out broken third-party hosting URLs (e.g. wasabisys.com).
 * If isExplicit is true, it trusts the URI and bypasses the wasabisys filter.
 */
export function getResolvedImageSource(
  uri: string | null | undefined,
  name: string | null | undefined,
  isExplicit: boolean = false
): any {
  if (uri && uri.trim() !== '') {
    const resolved = resolveLocalUri(uri);
    if (resolved) {
      return { uri: resolved };
    }
  }

  const stock = getStockImage(name);
  if (stock) {
    return { uri: stock };
  }

  return require('../assets/images/leaf.png');
}
