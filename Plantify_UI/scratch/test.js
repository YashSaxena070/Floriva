const FileSystem = require('expo-file-system');
console.log('expo-file-system keys:', Object.keys(FileSystem));

try {
  const FileSystemLegacy = require('expo-file-system/legacy');
  console.log('expo-file-system/legacy keys:', Object.keys(FileSystemLegacy));
} catch (e) {
  console.log('expo-file-system/legacy failed to import:', e.message);
}
