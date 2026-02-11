/**
 * Feature Flags Configuration
 * 
 * Controls experimental and staging features via environment variables.
 * No behavioral changes; only logging and telemetry verbosity.
 */

export interface FeatureFlags {
  // Staging & Validation
  stagingValidationMode: boolean;
  verboseLogging: boolean;

  // Core features (all production-ready)
  ambiguityGateEnabled: boolean;
  relationshipModelEnabled: boolean;
  identitySpineEnabled: boolean;
  continuityPackRequired: boolean;

  // Future features (not yet implemented)
  canonIntegrationEnabled: boolean;
  presenceLayerEnabled: boolean;
}

export class FeatureFlagManager {
  private flags: FeatureFlags;

  constructor() {
    this.flags = {
      // Staging & Validation
      stagingValidationMode: process.env.STAGING_VALIDATION_MODE === 'true',
      verboseLogging: process.env.LOG_LEVEL === 'debug' || process.env.STAGING_VALIDATION_MODE === 'true',

      // Core features (all enabled by default)
      ambiguityGateEnabled: process.env.DISABLE_AMBIGUITY_GATE !== 'true',
      relationshipModelEnabled: process.env.DISABLE_RELATIONSHIP_MODEL !== 'true',
      identitySpineEnabled: process.env.DISABLE_IDENTITY_SPINE !== 'true',
      continuityPackRequired: process.env.ALLOW_MISSING_CONTINUITY_PACK !== 'true',

      // Future features (disabled by default)
      canonIntegrationEnabled: process.env.ENABLE_CANON_INTEGRATION === 'true',
      presenceLayerEnabled: process.env.ENABLE_PRESENCE_LAYER === 'true',
    };

    // Log configuration on startup if in staging mode
    if (this.flags.stagingValidationMode) {
      console.log('[FeatureFlags] Staging validation mode enabled');
      console.log('[FeatureFlags] Active features:', this.getActiveFeatures());
    }
  }

  /**
   * Get all flags
   */
  getAll(): FeatureFlags {
    return { ...this.flags };
  }

  /**
   * Check if a specific flag is enabled
   */
  isEnabled(flagName: keyof FeatureFlags): boolean {
    return this.flags[flagName];
  }

  /**
   * List active features (those explicitly enabled)
   */
  getActiveFeatures(): string[] {
    return Object.entries(this.flags)
      .filter(([_, enabled]) => enabled)
      .map(([name]) => name);
  }

  /**
   * Check if critical features are enabled (should always be true in production)
   */
  validateCriticalFeatures(): boolean {
    const critical: (keyof FeatureFlags)[] = [
      'ambiguityGateEnabled',
      'relationshipModelEnabled',
      'identitySpineEnabled',
      'continuityPackRequired',
    ];

    for (const flag of critical) {
      if (!this.flags[flag]) {
        console.warn(`[FeatureFlags] CRITICAL: ${flag} is disabled`);
        return false;
      }
    }

    return true;
  }
}

// Singleton instance
export const featureFlags = new FeatureFlagManager();
