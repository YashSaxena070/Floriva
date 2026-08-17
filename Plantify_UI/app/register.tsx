import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import GoogleIcon from '@/components/GoogleIcon';
import { api } from '@/services/api';
import { promptGoogleAuth } from '@/services/googleAuthService';
import { useUser } from './_layout';

const { width } = Dimensions.get('window');

export default function RegisterScreen() {
  const router = useRouter();
  const { action } = useLocalSearchParams<{ action?: string }>();
  const { setUserName, setUserEmail, refreshUserData } = useUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const navigateToLocationPermission = () => {
    router.replace({
      pathname: '/location-permission' as any,
      params: { action: action || 'scan' },
    });
  };

  const handleRegister = async () => {
    setErrorMessage(null);
    const cleanEmail = email.trim();
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const fullName = cleanLastName ? `${cleanFirstName} ${cleanLastName}` : cleanFirstName;

    if (!cleanEmail) {
      setErrorMessage('Please enter your email address');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }
    if (!cleanFirstName) {
      setErrorMessage('Please enter your first name');
      return;
    }
    if (!agreeTerms) {
      setErrorMessage('Please agree to the Terms of Use and Privacy Policy');
      return;
    }

    setIsLoading(true);
    try {
      const authData = await api.register(fullName, cleanEmail, password);
      if (authData?.user) {
        setUserName(authData.user.name);
        setUserEmail(authData.user.email);
      }
      await refreshUserData();
      // New user registered -> ask for location permission next
      navigateToLocationPermission();
    } catch (err: any) {
      console.warn('Backend registration failed, using local session fallback:', err);
      setUserName(fullName);
      setUserEmail(cleanEmail);
      await refreshUserData();
      navigateToLocationPermission();
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const authData = await promptGoogleAuth();
      if (authData?.user) {
        setUserName(authData.user.name || 'Alina Smith');
        setUserEmail(authData.user.email || 'alina.smith@gmail.com');
      }
      navigateToLocationPermission();
    } catch (err: any) {
      if (err.message && err.message.includes('cancelled')) {
        // User cancelled, do nothing
      } else {
        setErrorMessage('Google Sign-Up failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const showTermsModal = () => {
    Alert.alert(
      'Terms & Privacy',
      'By using Plantify, your scan data is processed locally on your device or securely transmitted to provide plant care insights. We never sell your personal information.',
      [{ text: 'I Understand' }]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Decorative Botanical Corner Leaves */}
      <View style={styles.topDecoLeft} pointerEvents="none">
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=300&auto=format&fit=crop' }}
          style={styles.decoImage}
          contentFit="cover"
        />
      </View>
      <View style={styles.topDecoRight} pointerEvents="none">
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?q=80&w=200&auto=format&fit=crop' }}
          style={styles.decoImage}
          contentFit="cover"
        />
      </View>

      <View style={styles.bottomDecoLeft} pointerEvents="none">
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1545241047-6083a3684587?q=80&w=200&auto=format&fit=crop' }}
          style={styles.decoImage}
          contentFit="cover"
        />
      </View>
      <View style={styles.bottomDecoRight} pointerEvents="none">
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=200&auto=format&fit=crop' }}
          style={styles.decoImage}
          contentFit="cover"
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Navigation */}
          <View style={styles.navHeader}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={24} color="#1C3A27" />
            </TouchableOpacity>
          </View>

          {/* Brand & Heading Section */}
          <View style={styles.brandSection}>
            <Image
              source={require('@/assets/images/leaf1.png')}
              style={styles.brandLogo}
              contentFit="contain"
            />
            <Text style={styles.brandTitle}>Plantify</Text>
            <Text style={styles.pageHeading}>Create your account</Text>
            <Text style={styles.brandSubtitle}>
              Join Plantify and start your plant care journey.
            </Text>
          </View>

          {/* Social Sign-Up Button */}
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignUp}
            activeOpacity={0.85}
          >
            <View style={styles.googleIconWrapper}>
              <GoogleIcon size={20} />
            </View>
            <Text style={styles.googleButtonText}>Sign up with Google</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Error Message */}
          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color="#D32F2F" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Form Fields */}
          <View style={styles.formContainer}>
            {/* Email Field */}
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#7DA676" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Email address"
                placeholderTextColor="#8CA696"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (errorMessage) setErrorMessage(null);
                }}
              />
            </View>

            {/* Password Field */}
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#7DA676" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Create password"
                placeholderTextColor="#8CA696"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (errorMessage) setErrorMessage(null);
                }}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color="#7DA676"
                />
              </TouchableOpacity>
            </View>

            {/* First Name & Last Name (Side by Side) */}
            <View style={styles.rowInputsContainer}>
              <View style={[styles.inputWrapper, styles.halfInput]}>
                <Ionicons name="person-outline" size={18} color="#7DA676" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="First name"
                  placeholderTextColor="#8CA696"
                  autoCapitalize="words"
                  value={firstName}
                  onChangeText={(t) => {
                    setFirstName(t);
                    if (errorMessage) setErrorMessage(null);
                  }}
                />
              </View>

              <View style={[styles.inputWrapper, styles.halfInput]}>
                <Ionicons name="person-outline" size={18} color="#7DA676" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Last name"
                  placeholderTextColor="#8CA696"
                  autoCapitalize="words"
                  value={lastName}
                  onChangeText={(t) => {
                    setLastName(t);
                    if (errorMessage) setErrorMessage(null);
                  }}
                />
              </View>
            </View>

            {/* Phone Number (Optional) */}
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={20} color="#7DA676" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Phone number (optional)"
                placeholderTextColor="#8CA696"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>

            {/* Terms of Use & Privacy Policy Checkbox */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setAgreeTerms(!agreeTerms)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}>
                {agreeTerms && (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                )}
              </View>
              <View style={styles.checkboxLabelWrapper}>
                <Text style={styles.checkboxText}>
                  I agree to the{' '}
                  <Text style={styles.termsLink} onPress={showTermsModal}>
                    Terms of Use
                  </Text>{' '}
                  and{' '}
                  <Text style={styles.termsLink} onPress={showTermsModal}>
                    Privacy Policy
                  </Text>
                </Text>
              </View>
            </TouchableOpacity>

            {/* Sign Up Button */}
            <TouchableOpacity
              style={[styles.signUpButton, isLoading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={isLoading}
              activeOpacity={0.9}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.signUpButtonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            {/* Log In Link */}
            <View style={styles.switchAuthRow}>
              <Text style={styles.switchAuthText}>Already have an account? </Text>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/login' as any,
                    params: { action: action || '' },
                  })
                }
                activeOpacity={0.7}
              >
                <Text style={styles.switchAuthLink}>Log in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  topDecoLeft: {
    position: 'absolute',
    left: -15,
    top: -15,
    width: 130,
    height: 160,
    opacity: 0.35,
  },
  topDecoRight: {
    position: 'absolute',
    right: -15,
    top: -10,
    width: 110,
    height: 140,
    opacity: 0.35,
    transform: [{ rotate: '10deg' }],
  },
  bottomDecoLeft: {
    position: 'absolute',
    left: -20,
    bottom: -10,
    width: 110,
    height: 140,
    opacity: 0.35,
  },
  bottomDecoRight: {
    position: 'absolute',
    right: -20,
    bottom: -15,
    width: 120,
    height: 150,
    opacity: 0.35,
  },
  decoImage: {
    width: '100%',
    height: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    alignItems: 'center',
  },
  navHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  backButton: {
    padding: 6,
    borderRadius: 12,
  },
  brandSection: {
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 20,
  },
  brandLogo: {
    width: 54,
    height: 54,
    marginBottom: 2,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1C3A27',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  pageHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C3A27',
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#557560',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    fontWeight: '500',
  },
  googleButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2EAE0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 16,
  },
  googleIconWrapper: {
    marginRight: 10,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3B2F',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2EAE0',
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#8CA696',
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    width: '100%',
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  formContainer: {
    width: '100%',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE7DA',
    borderRadius: 16,
    height: 50,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  rowInputsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#1C3A27',
    fontWeight: '500',
    height: '100%',
  },
  eyeIcon: {
    padding: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 18,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#7DA676',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#74A45B',
    borderColor: '#74A45B',
  },
  checkboxLabelWrapper: {
    flex: 1,
  },
  checkboxText: {
    fontSize: 12.5,
    color: '#557560',
    lineHeight: 18,
  },
  termsLink: {
    color: '#4E8C44',
    fontWeight: '700',
  },
  signUpButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#74A45B',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4E8C44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  signUpButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  switchAuthRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 12,
  },
  switchAuthText: {
    fontSize: 14,
    color: '#718E7B',
  },
  switchAuthLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4E8C44',
  },
});
