import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Dimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';

const { width } = Dimensions.get('window');

const TIPS = [
  { id: '1', title: 'Focus on leaves', desc: 'Try to capture leaves clearly', icon: require('@/assets/images/leaf.png') },
  { id: '2', title: 'Include flowers', desc: 'If available, include flowers', icon: require('@/assets/images/flower.png') },
  { id: '3', title: 'Good lighting', desc: 'Natural light works best', icon: require('@/assets/images/sun.png') },
  { id: '4', title: 'Multiple angles', desc: 'Try different angles if possible', icon: require('@/assets/images/camera.png') },
];

export default function UploadPhotoScreen() {
  const router = useRouter();
  const { isRescan, targetPlantName } = useLocalSearchParams<{
    isRescan?: string;
    targetPlantName?: string;
  }>();

  const handleSelectPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Permission to access storage/gallery is required to select and upload photos.'
        );
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedUri = result.assets[0].uri;
        router.push({
          pathname: '/upload-progress',
          params: {
            imageUri: selectedUri,
            isRescan: isRescan || '',
            targetPlantName: targetPlantName || '',
          }
        });
      }
    } catch (error) {
      console.log('Error picking image:', error);
      Alert.alert('Error', 'An error occurred while opening your photo gallery.');
    }
  };

  const handleCameraPress = () => {
    router.push({
      pathname: '/camera',
      params: {
        isRescan: isRescan || '',
        targetPlantName: targetPlantName || '',
      }
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Decorative Background */}
      <View style={styles.bgDecoContainer} pointerEvents="none">
        <View style={styles.bgGradientTop} />
        <View style={styles.bgGradientBottom} />
        <Image
          source={require('@/assets/images/leaf1.png')}
          style={styles.bgLeafTopRight}
          contentFit="contain"
        />
        <Image
          source={require('@/assets/images/leaf.png')}
          style={styles.bgLeafBottomLeft}
          contentFit="contain"
        />
        <Image
          source={require('@/assets/images/leaf1.png')}
          style={styles.bgLeafMidLeft}
          contentFit="contain"
        />
        <View style={styles.bgBlobTopLeft} />
        <View style={styles.bgBlobCenter} />
        <View style={styles.bgBlobBottomRight} />
        <View style={styles.bgDottedRing} />
      </View>
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.replace('/(tabs)')}>
          <Image
            source={require('@/assets/images/next.png')}
            style={{ width: 20, height: 20, transform: [{ rotate: '180deg' }] }}
            tintColor="#1C3A27"
            contentFit="contain"
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isRescan === 'true' ? 'Rescan Plant Photo' : 'Upload Photo'}</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#1C3A27' }}>?</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.containerContent}>
        {/* Stepper progress indicator */}
        <View style={styles.stepperContainer}>
          <View style={styles.stepperRow}>
            <View style={[styles.stepItem, styles.stepItemActive]}>
              <View style={[styles.stepDot, styles.stepDotActive]}>
                <Image
                  source={require('@/assets/images/upload.png')}
                  style={{ width: 14, height: 14 }}
                  tintColor="#FFFFFF"
                  contentFit="contain"
                />
              </View>
              <Text style={[styles.stepLabel, styles.stepLabelActive]}>Upload</Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={styles.stepItem}>
              <View style={styles.stepDot}>
                <Image
                  source={require('@/assets/images/search.png')}
                  style={{ width: 14, height: 14 }}
                  tintColor="#8CA696"
                  contentFit="contain"
                />
              </View>
              <Text style={styles.stepLabel}>Identify</Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={styles.stepItem}>
              <View style={styles.stepDot}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#8CA696' }}>✓</Text>
              </View>
              <Text style={styles.stepLabel}>Results</Text>
            </View>
          </View>
        </View>

        {/* Tip Alert Banner */}
        <View style={styles.tipBanner}>
          <Text style={styles.tipBannerText}>
            For best results, make sure the plant, leaves, flowers or fruits are clearly visible. 🌿
          </Text>
        </View>

        {/* Big Drag and Drop/Tap Upload Area */}
        <TouchableOpacity 
          style={styles.uploadAreaCard} 
          activeOpacity={0.9}
          onPress={handleSelectPhoto}
        >
          <View style={styles.uploadIconCircle}>
            <Image
              source={require('@/assets/images/upload.png')}
              style={{ width: 32, height: 32 }}
              tintColor="#4E8C44"
              contentFit="contain"
            />
          </View>
          <Text style={styles.uploadAreaTitle}>Tap to upload a photo</Text>
          <Text style={styles.uploadAreaSub}>or drag and drop here</Text>
        </TouchableOpacity>

        {/* Divider separator */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Split Action Buttons */}
        <View style={styles.splitButtonsRow}>
          <TouchableOpacity 
            style={styles.splitButton} 
            activeOpacity={0.8}
            onPress={handleCameraPress}
          >
            <View style={styles.splitIconBg}>
              <Image
                source={require('@/assets/images/camera.png')}
                style={{ width: 24, height: 24 }}
                tintColor="#4E8C44"
                contentFit="contain"
              />
            </View>
            <Text style={styles.splitBtnTitle}>Take Photo</Text>
            <Text style={styles.splitBtnSub}>Use your camera</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.splitButton} 
            activeOpacity={0.8}
            onPress={handleSelectPhoto}
          >
            <View style={[styles.splitIconBg, styles.galleryIconBg]}>
              <Image
                source={require('@/assets/images/upload.png')}
                style={{ width: 24, height: 24 }}
                tintColor="#7DA676"
                contentFit="contain"
              />
            </View>
            <Text style={styles.splitBtnTitle}>Choose from Gallery</Text>
            <Text style={styles.splitBtnSub}>Select from your photos</Text>
          </TouchableOpacity>
        </View>

        {/* Photo Tips Grid */}
        <Text style={styles.tipsSectionTitle}>Photo tips for better identification</Text>
        <View style={styles.tipsGrid}>
          {TIPS.map((tip) => (
            <View key={tip.id} style={styles.tipGridItem}>
              <View style={styles.tipGridIconBg}>
                <Image
                  source={tip.icon}
                  style={{ width: 20, height: 20 }}
                  contentFit="contain"
                />
              </View>
              <View style={styles.tipGridText}>
                <Text style={styles.tipGridTitle}>{tip.title}</Text>
                <Text style={styles.tipGridDesc}>{tip.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Push Footer warning to the very bottom */}
        <View style={{ flex: 1 }} />

        {/* Footer Warning */}
        <View style={styles.footerWarning}>
          <Image
            source={require('@/assets/images/secure.png')}
            style={{ width: 16, height: 16, marginRight: 6 }}
            contentFit="contain"
          />
          <Text style={styles.footerWarningText}>
            Your photos are safe with us.{'\n'}We don't store or share your photos without permission.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  bgDecoContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
  },
  bgGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
    backgroundColor: '#EDF5EB',
    opacity: 0.6,
    borderBottomLeftRadius: 80,
    borderBottomRightRadius: 80,
  },
  bgGradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: '#E8F0E6',
    opacity: 0.4,
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
  },
  bgLeafTopRight: {
    position: 'absolute',
    top: -10,
    right: -25,
    width: 220,
    height: 220,
    opacity: 0.08,
    transform: [{ rotate: '30deg' }],
    tintColor: '#3D7A35',
  },
  bgLeafBottomLeft: {
    position: 'absolute',
    bottom: 20,
    left: -35,
    width: 240,
    height: 240,
    opacity: 0.07,
    transform: [{ rotate: '-20deg' }],
    tintColor: '#3D7A35',
  },
  bgLeafMidLeft: {
    position: 'absolute',
    top: '40%' as any,
    left: -60,
    width: 160,
    height: 160,
    opacity: 0.05,
    transform: [{ rotate: '50deg' }],
    tintColor: '#5A9E50',
  },
  bgBlobTopLeft: {
    position: 'absolute',
    top: 60,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#4E8C44',
    opacity: 0.04,
  },
  bgBlobCenter: {
    position: 'absolute',
    top: '45%' as any,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#7DA676',
    opacity: 0.05,
  },
  bgBlobBottomRight: {
    position: 'absolute',
    bottom: 60,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#4E8C44',
    opacity: 0.04,
  },
  bgDottedRing: {
    position: 'absolute',
    top: 160,
    right: 30,
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#4E8C44',
    borderStyle: 'dashed' as any,
    opacity: 0.06,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
  },
  containerContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  stepperContainer: {
    marginVertical: 12,
    alignItems: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '90%',
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
  },
  stepItemActive: {
    transform: [{ scale: 1.05 }],
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2EBE0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: {
    backgroundColor: '#4E8C44',
  },
  stepLabel: {
    fontSize: 10,
    color: '#8CA696',
    fontWeight: '700',
    marginTop: 6,
  },
  stepLabelActive: {
    color: '#4E8C44',
  },
  stepConnector: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2EBE0',
    marginHorizontal: -12,
    marginTop: -16, // align with dots
  },
  tipBanner: {
    backgroundColor: '#F0F5EE',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#7DA676',
  },
  tipBannerText: {
    fontSize: 12,
    color: '#2E4C38',
    lineHeight: 16,
    fontWeight: '500',
  },
  uploadAreaCard: {
    borderWidth: 2,
    borderColor: '#7DA676',
    borderStyle: 'dashed',
    borderRadius: 24,
    paddingVertical: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  uploadIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3F8F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadArrowBadge: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4E8C44',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadAreaTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4E8C44',
  },
  uploadAreaSub: {
    fontSize: 11,
    color: '#718E7B',
    marginTop: 2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2EBE0',
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 12,
    color: '#8CA696',
    fontWeight: '600',
  },
  splitButtonsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  splitButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EBF2EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  splitIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F3F8F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  galleryIconBg: {
    backgroundColor: '#F8FBF7',
  },
  splitBtnTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C3A27',
    textAlign: 'center',
  },
  splitBtnSub: {
    fontSize: 9,
    color: '#718E7B',
    marginTop: 2,
    textAlign: 'center',
  },
  tipsSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 14,
  },
  tipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  tipGridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: (width - 60) / 2, // 2 items per row
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F0F5EF',
  },
  tipGridIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F8F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  tipGridText: {
    flex: 1,
  },
  tipGridTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1C3A27',
  },
  tipGridDesc: {
    fontSize: 8,
    color: '#718E7B',
    marginTop: 1,
  },
  footerWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FBF7',
    borderRadius: 14,
    padding: 12,
  },
  footerIcon: {
    marginRight: 8,
  },
  footerWarningText: {
    fontSize: 10,
    color: '#718E7B',
    lineHeight: 14,
    fontWeight: '500',
  },
});
