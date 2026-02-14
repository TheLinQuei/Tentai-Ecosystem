/**
 * PWA Installation Manager
 * Handles installation prompts and app updates
 */

class PWAInstallManager {
    constructor() {
        this.deferredPrompt = null;
        this.isInstalled = false;
        this.isStandalone = false;
        
        this.init();
    }

    init() {
        // Check if already installed
        this.checkInstallStatus();
        
        // Register service worker
        this.registerServiceWorker();
        
        // Listen for install prompt
        this.setupInstallPrompt();
        
        // Check for updates
        this.checkForUpdates();
        
        // Handle iOS specific install instructions
        this.setupIOSInstructions();
    }

    checkInstallStatus() {
        // Check if running as standalone app
        this.isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone
            || document.referrer.includes('android-app://');
        
        this.isInstalled = this.isStandalone;
        
        console.log('[PWA] Install status:', this.isInstalled ? 'Installed' : 'Not installed');
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js', {
                    scope: '/'
                });
                
                console.log('[PWA] Service Worker registered:', registration.scope);
                
                // Check for updates every hour
                setInterval(() => {
                    registration.update();
                }, 60 * 60 * 1000);
                
                // Listen for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.showUpdateNotification();
                        }
                    });
                });
                
            } catch (error) {
                console.error('[PWA] Service Worker registration failed:', error);
            }
        }
    }

    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('[PWA] Install prompt available');
            
            // Prevent default prompt
            e.preventDefault();
            
            // Save for later
            this.deferredPrompt = e;
            
            // Show custom install button
            this.showInstallButton();
        });

        // Track successful installs
        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App installed successfully');
            this.isInstalled = true;
            this.hideInstallButton();
            this.showInstalledMessage();
        });
    }

    showInstallButton() {
        // Skip if already installed
        if (this.isInstalled) return;
        
        // Create install banner
        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.className = 'pwa-install-banner';
        banner.innerHTML = `
            <div class="pwa-banner-content">
                <div class="pwa-banner-icon">📱</div>
                <div class="pwa-banner-text">
                    <strong>Install Sol Calendar</strong>
                    <p>Add to home screen for quick access</p>
                </div>
                <button id="pwa-install-btn" class="pwa-install-btn">Install</button>
                <button id="pwa-dismiss-btn" class="pwa-dismiss-btn">×</button>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Add styles
        this.addInstallStyles();
        
        // Setup event listeners
        document.getElementById('pwa-install-btn').addEventListener('click', () => {
            this.promptInstall();
        });
        
        document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
            banner.remove();
            localStorage.setItem('pwa-install-dismissed', Date.now());
        });
        
        // Auto-show after 10 seconds if not dismissed recently
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (!dismissed || Date.now() - dismissed > 7 * 24 * 60 * 60 * 1000) {
            setTimeout(() => {
                banner.classList.add('show');
            }, 10000);
        }
    }

    async promptInstall() {
        if (!this.deferredPrompt) {
            console.log('[PWA] No install prompt available');
            return;
        }

        // Show the prompt
        this.deferredPrompt.prompt();
        
        // Wait for user response
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log('[PWA] User response:', outcome);
        
        if (outcome === 'accepted') {
            console.log('[PWA] User accepted install');
        } else {
            console.log('[PWA] User dismissed install');
        }
        
        // Clear the prompt
        this.deferredPrompt = null;
        
        // Hide banner
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.remove();
    }

    setupIOSInstructions() {
        // Detect iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        if (!isIOS || this.isStandalone) return;
        
        // Show iOS-specific install instructions
        const showInstructions = () => {
            const modal = document.createElement('div');
            modal.id = 'ios-install-modal';
            modal.className = 'ios-install-modal';
            modal.innerHTML = `
                <div class="ios-modal-content">
                    <button class="ios-modal-close">×</button>
                    <h2>Install Sol Calendar</h2>
                    <div class="ios-instructions">
                        <div class="ios-step">
                            <div class="ios-step-icon">1️⃣</div>
                            <p>Tap the <strong>Share</strong> button 
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z"/>
                            </svg>
                            in Safari</p>
                        </div>
                        <div class="ios-step">
                            <div class="ios-step-icon">2️⃣</div>
                            <p>Scroll down and tap <strong>"Add to Home Screen"</strong></p>
                        </div>
                        <div class="ios-step">
                            <div class="ios-step-icon">3️⃣</div>
                            <p>Tap <strong>"Add"</strong> in the top right</p>
                        </div>
                        <div class="ios-step">
                            <div class="ios-step-icon">✅</div>
                            <p>Sol Calendar will appear on your home screen!</p>
                        </div>
                    </div>
                    <button class="ios-got-it">Got it!</button>
                </div>
            `;
            
            document.body.appendChild(modal);
            this.addIOSStyles();
            
            // Close handlers
            const close = () => {
                modal.remove();
                localStorage.setItem('ios-install-shown', Date.now());
            };
            
            modal.querySelector('.ios-modal-close').addEventListener('click', close);
            modal.querySelector('.ios-got-it').addEventListener('click', close);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) close();
            });
        };
        
        // Show on first visit or if not shown in 30 days
        const lastShown = localStorage.getItem('ios-install-shown');
        if (!lastShown || Date.now() - lastShown > 30 * 24 * 60 * 60 * 1000) {
            setTimeout(showInstructions, 5000);
        }
    }

    hideInstallButton() {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.remove();
    }

    showInstalledMessage() {
        const message = document.createElement('div');
        message.className = 'pwa-success-message';
        message.textContent = '✓ Sol Calendar installed successfully!';
        document.body.appendChild(message);
        
        setTimeout(() => message.remove(), 3000);
    }

    showUpdateNotification() {
        const notification = document.createElement('div');
        notification.className = 'pwa-update-notification';
        notification.innerHTML = `
            <p>New version available!</p>
            <button id="pwa-reload-btn">Update Now</button>
            <button id="pwa-later-btn">Later</button>
        `;
        
        document.body.appendChild(notification);
        
        document.getElementById('pwa-reload-btn').addEventListener('click', () => {
            window.location.reload();
        });
        
        document.getElementById('pwa-later-btn').addEventListener('click', () => {
            notification.remove();
        });
    }

    checkForUpdates() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((registration) => {
                registration.update();
            });
        }
    }

    addInstallStyles() {
        if (document.getElementById('pwa-install-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'pwa-install-styles';
        styles.textContent = `
            .pwa-install-banner {
                position: fixed;
                bottom: -100px;
                left: 0;
                right: 0;
                background: var(--bg-primary, #fff);
                box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
                padding: 1rem;
                z-index: 10000;
                transition: bottom 0.3s ease;
            }
            
            .pwa-install-banner.show {
                bottom: 0;
            }
            
            .pwa-banner-content {
                display: flex;
                align-items: center;
                gap: 1rem;
                max-width: 600px;
                margin: 0 auto;
            }
            
            .pwa-banner-icon {
                font-size: 2rem;
            }
            
            .pwa-banner-text {
                flex: 1;
            }
            
            .pwa-banner-text strong {
                display: block;
                font-size: 1rem;
                margin-bottom: 0.25rem;
            }
            
            .pwa-banner-text p {
                margin: 0;
                font-size: 0.875rem;
                opacity: 0.7;
            }
            
            .pwa-install-btn {
                background: var(--accent-color, #6c5ce7);
                color: white;
                border: none;
                padding: 0.75rem 1.5rem;
                border-radius: 8px;
                font-weight: bold;
                cursor: pointer;
            }
            
            .pwa-dismiss-btn {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                padding: 0.5rem;
                opacity: 0.5;
            }
            
            .pwa-success-message {
                position: fixed;
                top: 1rem;
                left: 50%;
                transform: translateX(-50%);
                background: #10b981;
                color: white;
                padding: 1rem 2rem;
                border-radius: 8px;
                z-index: 10001;
                animation: slideDown 0.3s ease;
            }
            
            @keyframes slideDown {
                from { transform: translateX(-50%) translateY(-100%); }
                to { transform: translateX(-50%) translateY(0); }
            }
            
            .pwa-update-notification {
                position: fixed;
                bottom: 1rem;
                right: 1rem;
                background: var(--bg-primary, #fff);
                padding: 1rem;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                display: flex;
                gap: 0.5rem;
                align-items: center;
            }
            
            .pwa-update-notification button {
                padding: 0.5rem 1rem;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: bold;
            }
            
            #pwa-reload-btn {
                background: var(--accent-color, #6c5ce7);
                color: white;
            }
            
            #pwa-later-btn {
                background: transparent;
                color: var(--text-primary);
            }
        `;
        
        document.head.appendChild(styles);
    }

    addIOSStyles() {
        if (document.getElementById('ios-install-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'ios-install-styles';
        styles.textContent = `
            .ios-install-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 1rem;
            }
            
            .ios-modal-content {
                background: var(--bg-primary, #fff);
                border-radius: 16px;
                padding: 2rem;
                max-width: 400px;
                position: relative;
            }
            
            .ios-modal-close {
                position: absolute;
                top: 1rem;
                right: 1rem;
                background: none;
                border: none;
                font-size: 2rem;
                cursor: pointer;
                opacity: 0.5;
            }
            
            .ios-modal-content h2 {
                margin: 0 0 1.5rem 0;
                text-align: center;
            }
            
            .ios-step {
                display: flex;
                gap: 1rem;
                margin-bottom: 1rem;
                align-items: start;
            }
            
            .ios-step-icon {
                font-size: 1.5rem;
            }
            
            .ios-step p {
                margin: 0;
                line-height: 1.6;
            }
            
            .ios-step svg {
                vertical-align: middle;
                margin: 0 0.25rem;
            }
            
            .ios-got-it {
                width: 100%;
                padding: 1rem;
                background: var(--accent-color, #6c5ce7);
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 1rem;
                cursor: pointer;
                margin-top: 1rem;
            }
        `;
        
        document.head.appendChild(styles);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pwaInstall = new PWAInstallManager();
    });
} else {
    window.pwaInstall = new PWAInstallManager();
}

export default PWAInstallManager;
