/**
 * Verifier Implementations
 * 
 * Concrete verifier implementations for common tool types
 */

import { Verifier, VerificationResult } from '../../domain/verification.js';

/**
 * Search Result Verifier
 * Validates that search returned expected result format
 */
export class SearchResultVerifier implements Verifier {
  readonly name = 'search-result';

  async verify(result: unknown, expected?: unknown): Promise<VerificationResult> {
    try {
      if (!result || typeof result !== 'object') {
        return {
          passed: false,
          errors: ['Search result must be an object'],
        };
      }

      const resultObj = result as Record<string, unknown>;

      // Check for required search result fields
      if (!('results' in resultObj) || !Array.isArray(resultObj.results)) {
        return {
          passed: false,
          errors: ['Search result must contain results array'],
        };
      }

      if (expected && typeof expected === 'object' && 'minResults' in expected) {
        const minResults = (expected as any).minResults as number;
        if (resultObj.results.length < minResults) {
          return {
            passed: false,
            errors: [
              `Expected at least ${minResults} results, got ${resultObj.results.length}`,
            ],
          };
        }
      }

      return { passed: true, details: { resultCount: resultObj.results.length } };
    } catch (error) {
      return {
        passed: false,
        errors: [`Search verification error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }
}

/**
 * Shell Command Verifier
 * Validates shell command execution results
 */
export class ShellCommandVerifier implements Verifier {
  readonly name = 'shell-command';

  async verify(result: unknown, expected?: unknown): Promise<VerificationResult> {
    try {
      if (!result || typeof result !== 'object') {
        return {
          passed: false,
          errors: ['Shell result must be an object'],
        };
      }

      const resultObj = result as Record<string, unknown>;

      // Check for required shell result fields
      if (!('exitCode' in resultObj)) {
        return {
          passed: false,
          errors: ['Shell result must contain exitCode'],
        };
      }

      const exitCode = resultObj.exitCode as number;

      // If expected criteria provided
      if (expected && typeof expected === 'object') {
        if ('successExitCode' in expected) {
          const successCode = (expected as any).successExitCode as number;
          if (exitCode !== successCode) {
            return {
              passed: false,
              errors: [`Expected exit code ${successCode}, got ${exitCode}`],
              details: { stderr: resultObj.stderr, stdout: resultObj.stdout },
            };
          }
        }

        if ('shouldMatch' in expected) {
          const pattern = (expected as any).shouldMatch as string;
          const stdout = String(resultObj.stdout || '');
          if (!stdout.includes(pattern)) {
            return {
              passed: false,
              errors: [`Output does not contain: ${pattern}`],
              details: { stdout },
            };
          }
        }
      }

      return {
        passed: exitCode === 0,
        details: { exitCode, hasOutput: !!resultObj.stdout, hasError: !!resultObj.stderr },
      };
    } catch (error) {
      return {
        passed: false,
        errors: [`Shell verification error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }
}

/**
 * HTTP Request Verifier
 * Validates HTTP request execution results
 */
export class HttpRequestVerifier implements Verifier {
  readonly name = 'http-request';

  async verify(result: unknown, expected?: unknown): Promise<VerificationResult> {
    try {
      if (!result || typeof result !== 'object') {
        return {
          passed: false,
          errors: ['HTTP result must be an object'],
        };
      }

      const resultObj = result as Record<string, unknown>;

      // Check for required HTTP result fields
      if (!('statusCode' in resultObj)) {
        return {
          passed: false,
          errors: ['HTTP result must contain statusCode'],
        };
      }

      const statusCode = resultObj.statusCode as number;

      // Validate status code
      if (expected && typeof expected === 'object' && 'expectedStatusCode' in expected) {
        const expectedCode = (expected as any).expectedStatusCode as number;
        if (statusCode !== expectedCode) {
          return {
            passed: false,
            errors: [`Expected status ${expectedCode}, got ${statusCode}`],
            details: { body: resultObj.body },
          };
        }
      }

      // Success: 2xx status code
      const isSuccess = statusCode >= 200 && statusCode < 300;

      if (!isSuccess && !expected) {
        return {
          passed: false,
          errors: [`HTTP request failed with status ${statusCode}`],
          details: { body: resultObj.body },
        };
      }

      return {
        passed: isSuccess,
        details: { statusCode, hasHeaders: !!resultObj.headers, hasBody: !!resultObj.body },
      };
    } catch (error) {
      return {
        passed: false,
        errors: [`HTTP verification error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }
}

/**
 * Database Query Verifier
 * Validates database query execution results
 */
export class DatabaseQueryVerifier implements Verifier {
  readonly name = 'database-query';

  async verify(result: unknown, expected?: unknown): Promise<VerificationResult> {
    try {
      if (!result || typeof result !== 'object') {
        return {
          passed: false,
          errors: ['Query result must be an object'],
        };
      }

      const resultObj = result as Record<string, unknown>;

      // Check for rows array
      if (!('rows' in resultObj) || !Array.isArray(resultObj.rows)) {
        return {
          passed: false,
          errors: ['Query result must contain rows array'],
        };
      }

      if (expected && typeof expected === 'object') {
        if ('minRows' in expected) {
          const minRows = (expected as any).minRows as number;
          if (resultObj.rows.length < minRows) {
            return {
              passed: false,
              errors: [
                `Expected at least ${minRows} rows, got ${resultObj.rows.length}`,
              ],
            };
          }
        }

        if ('maxRows' in expected) {
          const maxRows = (expected as any).maxRows as number;
          if (resultObj.rows.length > maxRows) {
            return {
              passed: false,
              errors: [
                `Expected at most ${maxRows} rows, got ${resultObj.rows.length}`,
              ],
            };
          }
        }
      }

      return {
        passed: true,
        details: { rowCount: resultObj.rows.length },
      };
    } catch (error) {
      return {
        passed: false,
        errors: [`Database verification error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }
}

/**
 * File System Verifier
 * Validates file operations
 */
export class FileSystemVerifier implements Verifier {
  readonly name = 'file-system';

  async verify(result: unknown, expected?: unknown): Promise<VerificationResult> {
    try {
      if (!result || typeof result !== 'object') {
        return {
          passed: false,
          errors: ['File result must be an object'],
        };
      }

      const resultObj = result as Record<string, unknown>;

      // Check for success indicator
      if ('success' in resultObj) {
        const success = resultObj.success as boolean;
        if (!success) {
          return {
            passed: false,
            errors: [String(resultObj.error) || 'File operation failed'],
          };
        }
      }

      // Validate file properties if expected
      if (expected && typeof expected === 'object' && 'shouldExist' in expected) {
        const exists = resultObj.exists as boolean;
        const shouldExist = (expected as any).shouldExist as boolean;
        if (exists !== shouldExist) {
          return {
            passed: false,
            errors: [
              `Expected file to ${shouldExist ? 'exist' : 'not exist'}, but it ${exists ? 'does' : 'does not'}`,
            ],
          };
        }
      }

      return {
        passed: true,
        details: { path: resultObj.path, exists: resultObj.exists },
      };
    } catch (error) {
      return {
        passed: false,
        errors: [`File verification error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }
}
