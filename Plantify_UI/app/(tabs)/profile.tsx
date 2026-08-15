import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '../_layout';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop";

const MENU_ITEMS = [
  { id: '1', emoji: '⚙️', label: 'Account Settings' },
  { id: '2', emoji: '🔔', label: 'Reminders & Notifications' },
  { id: '5', emoji: '💬', label: 'Help & Support' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { userName, setUserName, userAvatar, setUserAvatar, userEmail, setUserEmail, scansCount } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(userName);
  const [tempEmail, setTempEmail] = useState(userEmail);
  const [isSupportExpanded, setIsSupportExpanded] = useState(false);

  // Dynamic Scans-Based Level progression (1 level per 5 scans)
  const xpGoal = 5;
  const level = Math.floor(scansCount / xpGoal) + 1;
  const currentXp = scansCount % xpGoal;
  const xpProgressPercent = `${Math.min((currentXp / xpGoal) * 100, 100)}%`;

  const handleStartEditing = () => {
    setTempName(userName);
    setTempEmail(userEmail);
    setIsEditing(true);
  };

  const handleSaveDetails = () => {
    if (tempName.trim()) {
      setUserName(tempName.trim());
    }
    if (tempEmail.trim()) {
      setUserEmail(tempEmail.trim());
    }
    setIsEditing(false);
  };

  const handleMenuPress = (itemId: string) => {
    switch (itemId) {
      case '1': // Account Settings
        setIsEditing(true);
        break;
      case '2': // Reminders & Notifications
        router.push({
          pathname: '/care-reminder',
          params: { plantName: 'General' }
        });
        break;
      case '3': // Privacy & Security
        Alert.alert(
          'Privacy & Security',
          'Your plant scan data, photos, and schedules are saved entirely offline on your device. We do not track, collect, or transmit your location or personal data.'
        );
        break;
      case '4': // Saved Articles & Tips
        Alert.alert(
          'Saved Articles & Tips',
          '💡 Top Care Tip: Make sure your pots have drainage holes to prevent root rot.\n\n💡 Sunlight Tip: Rotate your indoor plants every week so all sides get equal light.'
        );
        break;
      case '5': // Help & Support
        setIsSupportExpanded(!isSupportExpanded);
        break;
      default:
        break;
    }
  };

  const handlePickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissions Required',
          'Camera roll access is required to upload a profile picture. Please enable it in settings.'
        );
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setUserAvatar(result.assets[0].uri);
      }
    } catch (error) {
      console.warn("Failed to select profile image:", error);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* User Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity activeOpacity={0.85} onPress={handlePickAvatar} style={styles.avatarWrapper}>
            <Image
              source={{ uri: userAvatar || DEFAULT_AVATAR }}
              style={styles.avatar}
            />
            <View style={styles.avatarEditBadge}>
              <Text style={{ fontSize: 10 }}>📸</Text>
            </View>
          </TouchableOpacity>
          {isEditing ? (
            <View style={styles.editNameRow}>
              <TextInput
                style={styles.editNameInput}
                value={tempName}
                onChangeText={setTempName}
                autoFocus
                placeholder="Enter your name"
                placeholderTextColor="#8CA696"
              />
              <View style={styles.editActionsRow}>
                <TouchableOpacity style={[styles.editActionBtn, styles.saveBtn]} onPress={handleSaveDetails}>
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.editActionBtn, styles.cancelBtn]} onPress={() => setIsEditing(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{userName}</Text>
              <TouchableOpacity style={styles.editNameBtn} onPress={handleStartEditing}>
                <Text style={styles.editNameIcon}>✍️</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.xpProgressContainer}>
            <View style={styles.xpHeader}>
              <Text style={styles.xpLabel}>Level {level} Botanist</Text>
              <Text style={styles.xpValue}>{currentXp} / {xpGoal} scans</Text>
            </View>
            <View style={styles.xpBar}>
              <View style={[styles.xpProgress, { width: xpProgressPercent as any }]} />
            </View>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {MENU_ITEMS.map((item) => {
            const isSupport = item.id === '5';
            const showDropdown = isSupport && isSupportExpanded;
            
            return (
              <View key={item.id}>
                <TouchableOpacity 
                  style={styles.menuItem} 
                  onPress={() => handleMenuPress(item.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.menuIconBg}>
                    <Text style={{ fontSize: 16 }}>{item.emoji}</Text>
                  </View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Image
                    source={require('@/assets/images/next.png')}
                    style={[
                      { width: 14, height: 14 },
                      isSupport && {
                        transform: [{ rotate: isSupportExpanded ? '90deg' : '0deg' }]
                      }
                    ]}
                    tintColor="#8CA696"
                    contentFit="contain"
                  />
                </TouchableOpacity>

                {showDropdown && (
                  <View style={styles.supportDropdown}>
                    <Text style={styles.supportTitle}>Technical Support</Text>
                    <Text style={styles.supportText}>
                      For inquiries, technical queries, or feedback, contact our team:
                    </Text>
                    <TouchableOpacity 
                      onPress={() => Alert.alert('Support Email', 'Direct inquiries can be sent to tech@explified.com')}
                      style={styles.supportEmailRow}
                    >
                      <Text style={{ fontSize: 14, marginRight: 6 }}>✉️</Text>
                      <Text style={styles.supportEmailText}>tech@explified.com</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Pro Membership Banner Removed */}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 110,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#F0F5EF',
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: '#EBF4EA',
    marginBottom: 14,
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C3A27',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  editNameBtn: {
    padding: 4,
  },
  editNameIcon: {
    fontSize: 14,
  },
  editNameRow: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  editNameInput: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    borderColor: '#EBF2EA',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#1C3A27',
    fontWeight: '700',
    backgroundColor: '#F8FBF7',
    textAlign: 'center',
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  editActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  saveBtn: {
    backgroundColor: '#4E8C44',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  cancelBtn: {
    backgroundColor: '#F3F8F2',
  },
  cancelBtnText: {
    color: '#718E7B',
    fontSize: 11,
    fontWeight: '800',
  },
  userEmail: {
    fontSize: 13,
    color: '#718E7B',
    marginTop: 4,
    fontWeight: '500',
  },
  xpProgressContainer: {
    width: '100%',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F5EF',
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  xpLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C3A27',
  },
  xpValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#718E7B',
  },
  xpBar: {
    height: 8,
    backgroundColor: '#EBF4EA',
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpProgress: {
    width: '64%',
    height: '100%',
    backgroundColor: '#7DA676',
    borderRadius: 4,
  },
  menuContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 8,
    borderWidth: 1,
    borderColor: '#F0F5EF',
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FBF7',
  },
  menuIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EBF4EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#1C3A27',
  },
  proBanner: {
    backgroundColor: '#FFF9EB',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FFEFE0',
  },
  proInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  proText: {
    flex: 1,
    marginLeft: 14,
  },
  proTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B25E00',
  },
  proDescription: {
    fontSize: 12,
    color: '#845014',
    lineHeight: 16,
    marginTop: 4,
  },
  proButton: {
    backgroundColor: '#FD7E14',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: '#FD7E14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  proButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EBF2EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  supportDropdown: {
    backgroundColor: '#F8FBF7',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
    marginLeft: 16,
    marginRight: 16,
    marginBottom: 10,
    borderRadius: 12,
  },
  supportTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 4,
  },
  supportText: {
    fontSize: 11,
    color: '#718E7B',
    lineHeight: 15,
    fontWeight: '500',
  },
  supportEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EBF2EA',
  },
  supportEmailText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4E8C44',
  },
});
