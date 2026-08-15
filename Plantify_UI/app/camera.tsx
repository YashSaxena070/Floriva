import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';

const { width, height } = Dimensions.get('window');

const MODES = ['Plant', 'Flower', 'Fruit'];

export default function CameraScreen() {
  const router = useRouter();
  const { isRescan, targetPlantName } = useLocalSearchParams<{ isRescan?: string; targetPlantName?: string }>();
  const [activeMode, setActiveMode] = useState('Plant');
  const [flashOn, setFlashOn] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const flashAnim = useState(new Animated.Value(0))[0];
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const handleCapture = () => {
    if (!cameraRef.current) return;

    // Trigger shutter flash animation
    Animated.sequence([
      Animated.timing(flashAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(async () => {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.85,
          skipProcessing: false,
        });
        if (photo && photo.uri) {
          router.push({
            pathname: '/upload-progress',
            params: { 
              imageUri: photo.uri,
              isRescan: isRescan || '',
              targetPlantName: targetPlantName || '',
            }
          });
        }
      } catch (err) {
        console.warn("Failed to capture photo:", err);
      }
    });
  };

  const toggleFlash = () => {
    setFlashOn(!flashOn);
  };

  const toggleFacing = () => {
    setFacing(prev => prev === 'back' ? 'front' : 'back');
  };

  if (!permission) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1E2C22', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4E8C44" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1E2C22', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <StatusBar style="light" />
        <Text style={{ fontSize: 20, color: '#FFFFFF', fontWeight: '800', textAlign: 'center', marginBottom: 12 }}>
          Camera Permission Required
        </Text>
        <Text style={{ fontSize: 13, color: '#8CA696', textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 20 }}>
          We need access to your camera so you can take photos of plants and identify them instantly.
        </Text>
        <TouchableOpacity 
          style={{ backgroundColor: '#7DA676', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 }}
          onPress={requestPermission}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Grant Camera Access</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={{ fontSize: 18, color: '#FFFFFF', fontWeight: 'bold' }}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Take a Photo</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Text style={{ fontSize: 18, color: '#FFFFFF', fontWeight: 'bold' }}>?</Text>
        </TouchableOpacity>
      </View>

      {/* Top Banner Alert */}
      <View style={styles.tipBanner}>
        <Image
          source={require('@/assets/images/photo-tip.png')}
          style={{ width: 18, height: 18, marginRight: 8 }}
          contentFit="contain"
        />
        <Text style={styles.tipText}>
          For best results, make sure the plant, leaves, flowers or fruits are clearly visible. 🌿
        </Text>
      </View>

      {/* Viewfinder Simulator */}
      <View style={styles.viewfinderContainer}>
        {/* Plant Camera Image Simulator replaced with real CameraView */}
        <CameraView
          ref={cameraRef}
          facing={facing}
          flash={flashOn ? 'on' : 'off'}
          style={styles.cameraFeed}
        />

        {/* Viewfinder Target Guide */}
        <View style={styles.guideBox}>
          <View style={styles.cornerTL} />
          <View style={styles.cornerTR} />
          <View style={styles.cornerBL} />
          <View style={styles.cornerBR} />
        </View>

        {/* Focus Guide Text Badge */}
        <View style={styles.focusBadge}>
          <View style={styles.focusPulseDot} />
          <Text style={styles.focusText}>Center the plant in the frame</Text>
        </View>

        {/* Flash Toggle Button */}
        <TouchableOpacity
          style={[styles.flashBtn, flashOn && styles.flashBtnActive]}
          onPress={toggleFlash}
        >
          <Image
            source={require('@/assets/images/sun.png')}
            style={{ width: 22, height: 22 }}
            tintColor={flashOn ? "#FFD43B" : "#FFFFFF"}
            contentFit="contain"
          />
        </TouchableOpacity>

        {/* White Shutter Flash Effect Overlay */}
        <Animated.View style={[styles.flashOverlay, { opacity: flashAnim }]} pointerEvents="none" />
      </View>

      {/* Camera Mode Selector */}
      <View style={styles.modesContainer}>
        {MODES.map((mode) => (
          <TouchableOpacity
            key={mode}
            style={styles.modeItem}
            activeOpacity={0.8}
            onPress={() => setActiveMode(mode)}
          >
            <Text style={[styles.modeText, activeMode === mode && styles.modeTextActive]}>
              {mode}
            </Text>
            {activeMode === mode && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Shutter Capture Bar */}
      <View style={styles.shutterBar}>
        {/* Gallery Button */}
        <TouchableOpacity
          style={styles.controlBtn}
          activeOpacity={0.7}
          onPress={() => router.push({
            pathname: '/upload-photo',
            params: {
              isRescan: isRescan || '',
              targetPlantName: targetPlantName || '',
            }
          })}
        >
          <View style={styles.controlIconBg}>
            <Image
              source={require('@/assets/images/upload.png')}
              style={{ width: 22, height: 22 }}
              tintColor="#FFFFFF"
              contentFit="contain"
            />
          </View>
          <Text style={styles.controlText}>Gallery</Text>
        </TouchableOpacity>

        {/* Main Capture Button */}
        <View style={styles.captureBtnContainer}>
          <TouchableOpacity
            style={styles.captureBtnOuter}
            activeOpacity={0.85}
            onPress={handleCapture}
          >
            <View style={styles.captureBtnInner}>
              <Image
                source={require('@/assets/images/camera.png')}
                style={{ width: 26, height: 26 }}
                tintColor="#4E8C44"
                contentFit="contain"
              />
            </View>
          </TouchableOpacity>
          <Text style={styles.captureLabel}>Tap to capture</Text>
        </View>

        {/* Camera Flip Button */}
        <TouchableOpacity 
          style={styles.controlBtn} 
          activeOpacity={0.7}
          onPress={toggleFacing}
        >
          <View style={styles.controlIconBg}>
            <Image
              source={require('@/assets/images/flip.png')}
              style={{ width: 22, height: 22 }}
              tintColor="#FFFFFF"
              contentFit="contain"
            />
          </View>
          <Text style={styles.controlText}>Flip</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E2C22',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
  },
  tipIcon: {
    marginRight: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 11,
    color: '#E8F3E6',
    lineHeight: 14,
    fontWeight: '500',
  },
  viewfinderContainer: {
    flex: 1,
    marginHorizontal: 20,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000000',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cameraFeed: {
    width: '100%',
    height: '100%',
  },
  guideBox: {
    position: 'absolute',
    left: '10%',
    top: '12%',
    width: '80%',
    height: '76%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  // Corners
  cornerTL: {
    position: 'absolute',
    left: -2,
    top: -2,
    width: 20,
    height: 20,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderColor: '#FFFFFF',
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 20,
    height: 20,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderColor: '#FFFFFF',
    borderTopRightRadius: 8,
  },
  cornerBL: {
    position: 'absolute',
    left: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderColor: '#FFFFFF',
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderColor: '#FFFFFF',
    borderBottomRightRadius: 8,
  },
  focusBadge: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  focusPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#7DA676',
    marginRight: 8,
  },
  focusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  flashBtn: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flashBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  modesContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginVertical: 20,
  },
  modeItem: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  modeText: {
    fontSize: 14,
    color: '#8CA696',
    fontWeight: '700',
  },
  modeTextActive: {
    color: '#FFFFFF',
  },
  activeIndicator: {
    width: 16,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#7DA676',
    marginTop: 6,
  },
  shutterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    marginBottom: 20,
  },
  controlBtn: {
    alignItems: 'center',
    width: 60,
  },
  controlIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  controlText: {
    color: '#8CA696',
    fontSize: 10,
    fontWeight: '700',
  },
  captureBtnContainer: {
    alignItems: 'center',
  },
  captureBtnOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  captureBtnInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureLabel: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: 0.5,
  },
});
