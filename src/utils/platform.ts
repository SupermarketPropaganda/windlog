/**
 * Platform Detection and Native Mobile Shell Integration
 * Safely abstracts Capacitor 6 native plugins with zero-overhead fallbacks on Web.
 */

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as CapApp } from '@capacitor/app';

export type PlatformType = 'ios' | 'android' | 'web';

/**
 * Returns whether the app is executing inside a native iOS or Android Capacitor container
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Returns the current platform name: 'ios', 'android', or 'web'
 */
export function getPlatform(): PlatformType {
  const p = Capacitor.getPlatform();
  if (p === 'ios') return 'ios';
  if (p === 'android') return 'android';
  return 'web';
}

export function isIOS(): boolean {
  return getPlatform() === 'ios';
}

export function isAndroid(): boolean {
  return getPlatform() === 'android';
}

/**
 * Configures native mobile device status bar and splash screen on startup
 */
export async function initializeNativeShell(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    // Configure dark immersive cockpit status bar
    await StatusBar.setStyle({ style: Style.Dark });
    if (isAndroid()) {
      await StatusBar.setBackgroundColor({ color: '#090d16' });
    }
  } catch (err) {
    console.warn('[Platform] StatusBar configuration warning:', err);
  }

  try {
    // Hide splash screen smoothly once the web view is rendered
    await SplashScreen.hide();
  } catch (err) {
    console.warn('[Platform] SplashScreen warning:', err);
  }

  try {
    // Handle Android hardware back button
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        CapApp.exitApp();
      }
    });
  } catch (err) {
    console.warn('[Platform] App backButton listener warning:', err);
  }
}
