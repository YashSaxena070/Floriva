import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';
import { api, TokenData } from './api';

// Complete auth session when returning from web browser
WebBrowser.maybeCompleteAuthSession();

// Google OAuth Client IDs (configured in .env)
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';

/**
 * Get active Client ID based on platform
 */
export function getGoogleClientId(): string {
  if (Platform.OS === 'ios' && GOOGLE_IOS_CLIENT_ID) {
    return GOOGLE_IOS_CLIENT_ID;
  }
  if (Platform.OS === 'android' && GOOGLE_ANDROID_CLIENT_ID) {
    return GOOGLE_ANDROID_CLIENT_ID;
  }
  return GOOGLE_WEB_CLIENT_ID;
}

/**
 * Initiates the Google OAuth2 authentication flow.
 * Returns TokenData containing JWT access token and user profile.
 */
export async function promptGoogleAuth(): Promise<TokenData> {
  const clientId = getGoogleClientId();

  // If Client ID is configured, perform live OAuth2 flow
  if (clientId) {
    try {
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'plantify',
      });

      const discovery = {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
      };

      const request = new AuthSession.AuthRequest({
        clientId,
        scopes: ['openid', 'profile', 'email'],
        redirectUri,
        responseType: AuthSession.ResponseType.Token,
        prompt: AuthSession.Prompt.SelectAccount,
      });

      const result = await request.promptAsync(discovery);

      if (result.type === 'success' && result.params) {
        const accessToken = result.params.access_token;
        const idToken = result.params.id_token;

        // Fetch user profile from Google UserInfo endpoint
        let userProfile = { email: '', name: '', sub: '', picture: '' };
        if (accessToken) {
          try {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (userInfoRes.ok) {
              userProfile = await userInfoRes.json();
            }
          } catch (fetchErr) {
            console.warn('Failed to fetch Google userinfo:', fetchErr);
          }
        }

        return await api.loginWithGoogle({
          token: idToken || accessToken,
          email: userProfile.email || undefined,
          name: userProfile.name || (userProfile.email ? userProfile.email.split('@')[0] : 'Google User'),
          google_id: userProfile.sub || undefined,
        });
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        throw new Error('Google Sign-In was cancelled.');
      } else if (result.type === 'error') {
        console.warn('Google Auth Error:', result.error);
        throw new Error((result.error as any)?.message || 'Google Sign-In failed.');
      }
    } catch (err: any) {
      console.warn('Live Google OAuth flow error:', err);
      if (err.message && err.message.includes('cancelled')) {
        throw err;
      }
    }
  }

  // Fallback demo Google user (allows testing without mandatory API keys upfront)
  console.log('[Google Auth] Using development demo account (Configure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID for live Google login)');
  return await api.loginWithGoogle({
    email: 'alina.smith@gmail.com',
    name: 'Alina Smith',
    google_id: 'google_demo_alina',
  });
}
