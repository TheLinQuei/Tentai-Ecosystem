/**
 * Verification Domain Types
 */

export interface VerificationResult {
  verified?: boolean;
  passed?: boolean;
  confidence?: number; // 0.0 - 1.0
  violations?: string[];
  evidence?: Record<string, any>;
  errors?: string[];
  details?: Record<string, any>;
  [key: string]: any; // Allow additional properties
}

export interface Verifier {
  name: string;
  verify(data: any): Promise<VerificationResult>;
}
