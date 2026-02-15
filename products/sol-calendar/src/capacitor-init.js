// Capacitor initialization and native API integration
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as CapApp } from '@capacitor/app';

// Check if running in Capacitor
const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform(); // 'ios', 'android', or 'web'

console.log(`Running on: ${platform} (native: ${isNative})`);

// Initialize native features if available
if (isNative) {
  // Configure status bar
  StatusBar.setStyle({ style: Style.Dark });
  StatusBar.setBackgroundColor({ color: '#0f0f0f' });
  
  // Hide splash screen after app loads
  window.addEventListener('load', () => {
    setTimeout(() => {
      SplashScreen.hide();
    }, 500);
  });
  
  // Handle back button (Android)
  if (platform === 'android') {
    CapApp.addListener('backButton', ({ canGoBack }) => {
      // Custom back button handling
      const modal = document.getElementById('modal');
      if (modal && modal.innerHTML) {
        // Close modal if open
        modal.innerHTML = '';
        modal.style.display = 'none';
      } else if (canGoBack) {
        window.history.back();
      } else {
        // Exit app
        CapApp.exitApp();
      }
    });
  }
  
  // Handle app state changes
  CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      console.log('App resumed - syncing data...');
      // Trigger sync when app comes to foreground
      if (window.currentUser && window.Sync) {
        window.Sync.syncAppState(window.currentUser.id, window.appState);
      }
    }
  });
}

// Export for use in app.js
window.capacitor = {
  isNative,
  platform,
  
  // File operations using Capacitor Filesystem
  async saveFile(filename, content) {
    if (!isNative) {
      // Web fallback - use download
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true };
    }
    
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      
      await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Documents,
        encoding: 'utf8'
      });
      
      return { success: true };
    } catch (error) {
      console.error('Save file error:', error);
      return { success: false, error: error.message };
    }
  },
  
  async loadFile() {
    if (!isNative) {
      // Web fallback - use file input
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              resolve({ success: true, content: e.target.result });
            };
            reader.onerror = () => {
              resolve({ success: false });
            };
            reader.readAsText(file);
          } else {
            resolve({ success: false });
          }
        };
        input.click();
      });
    }
    
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { FilePicker } = await import('@capawesome/capacitor-file-picker');
      
      const result = await FilePicker.pickFiles({
        types: ['application/json'],
        multiple: false
      });
      
      if (result.files && result.files.length > 0) {
        const file = result.files[0];
        const content = await Filesystem.readFile({
          path: file.path
        });
        
        return { success: true, content: content.data };
      }
      
      return { success: false };
    } catch (error) {
      console.error('Load file error:', error);
      return { success: false, error: error.message };
    }
  },
  
  // Share functionality
  async share(text, title) {
    if (!isNative) {
      // Web fallback - copy to clipboard
      if (navigator.share) {
        try {
          await navigator.share({ text, title });
          return { success: true };
        } catch (error) {
          // User cancelled
          return { success: false };
        }
      } else {
        await navigator.clipboard.writeText(text);
        return { success: true, method: 'clipboard' };
      }
    }
    
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        text,
        title,
        dialogTitle: title
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

console.log('Capacitor initialized');
