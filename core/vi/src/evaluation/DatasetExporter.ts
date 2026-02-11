/**
 * Dataset Exporter
 * 
 * Exports evaluation results to JSONL format for training and analysis
 */

import { ConversationEvaluation, EvaluationDatasetEntry, EvaluationMetrics } from '../domain/evaluation';
import { GoldenConversation } from '../domain/evaluation';

/**
 * JSONL dataset exporter
 */
export class DatasetExporter {
  /**
   * Export evaluation results to JSONL format
   */
  static evaluationsToJSONL(
    evaluations: ConversationEvaluation[],
    goldenMap: Map<string, GoldenConversation>
  ): string {
    return evaluations
      .map((evalItem) => {
        const golden = goldenMap.get(evalItem.goldenConversationId);
        if (!golden) return null;

        const entries: EvaluationDatasetEntry[] = evalItem.turnEvaluations.map((turn, idx) => ({
          id: `${evalItem.id}_turn_${idx}`,
          goldenConversationId: evalItem.goldenConversationId,
          goldenTitle: golden.title,
          userMessage: turn.userMessage,
          actualResponse: turn.actualResponse,
          goldenResponse: golden.goldenResponses[idx] || '',
          intent: golden.intent,
          stance: golden.primaryStance,
          scores: turn.scores,
          issues: turn.issues,
          evaluatedAt: evalItem.evaluatedAt,
          version: golden.version,
        }));

        return entries.map((entry) => JSON.stringify(entry)).join('\n');
      })
      .filter((line) => line !== null)
      .join('\n');
  }

  /**
   * Export evaluations to CSV format
   */
  static evaluationsToCSV(evaluations: ConversationEvaluation[]): string {
    const headers = [
      'evaluationId',
      'goldenConversationId',
      'actualConversationId',
      'overallScore',
      'identityScore',
      'memoryScore',
      'toolScore',
      'toneScore',
      'refusalScore',
      'totalTurns',
      'avgLatencyMs',
      'issueCount',
      'regressionStatus',
      'evaluatedAt',
    ];

    const rows = evaluations.map((evalItem) => [
      evalItem.id,
      evalItem.goldenConversationId,
      evalItem.actualConversationId,
      evalItem.overallScore.toFixed(3),
      evalItem.identityScore.toFixed(3),
      evalItem.memoryScore.toFixed(3),
      evalItem.toolScore.toFixed(3),
      evalItem.toneScore.toFixed(3),
      evalItem.refusalScore.toFixed(3),
      evalItem.stats.totalTurns,
      evalItem.stats.avgLatencyMs.toFixed(0),
      evalItem.stats.issueCount,
      evalItem.regressionStatus,
      evalItem.evaluatedAt.toISOString(),
    ]);

    const csv =
      headers.join(',') +
      '\n' +
      rows.map((row) => row.map((col) => `"${col}"`).join(',')).join('\n');

    return csv;
  }

  /**
   * Export metrics summary
   */
  static metricsToJSON(metrics: EvaluationMetrics): string {
    return JSON.stringify(metrics, null, 2);
  }

  /**
   * Create download-ready blob
   */
  static createBlob(content: string, format: 'jsonl' | 'csv' | 'json'): Blob {
    const mimeTypes: Record<string, string> = {
      jsonl: 'application/x-ndjson',
      csv: 'text/csv',
      json: 'application/json',
    };

    return new Blob([content], { type: mimeTypes[format] });
  }

  /**
   * Generate filename with timestamp
   */
  static generateFilename(prefix: string, format: 'jsonl' | 'csv' | 'json'): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `${prefix}_${timestamp}.${format}`;
  }

  /**
   * Parse JSONL dataset
   */
  static parseJSONL(content: string): EvaluationDatasetEntry[] {
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as EvaluationDatasetEntry;
        } catch (e) {
          console.error('Failed to parse JSONL line:', line);
          return null;
        }
      })
      .filter((entry): entry is EvaluationDatasetEntry => entry !== null);
  }

  /**
   * Convert CSV to structured data
   */
  static parseCSV(content: string): ConversationEvaluation[] {
    const lines = content.split('\n');
    const headers = lines[0].split(',');

    return lines
      .slice(1)
      .filter((line) => line.trim())
      .map((line) => {
        const values = this.parseCSVLine(line);
        return {
          id: values[0] || '',
          goldenConversationId: values[1] || '',
          actualConversationId: values[2] || '',
          overallScore: parseFloat(values[3]) || 0,
          identityScore: parseFloat(values[4]) || 0,
          memoryScore: parseFloat(values[5]) || 0,
          toolScore: parseFloat(values[6]) || 0,
          toneScore: parseFloat(values[7]) || 0,
          refusalScore: parseFloat(values[8]) || 0,
          turnEvaluations: [],
          stats: {
            totalTurns: parseInt(values[9]) || 0,
            avgLatencyMs: parseFloat(values[10]) || 0,
            totalTokens: 0,
            totalCost: 0,
            issueCount: parseInt(values[11]) || 0,
            criticalIssueCount: 0,
            passRate: 0,
          },
          regressionStatus: (values[12] || 'fail') as any,
          evaluatedAt: new Date(values[13] || new Date()),
        } as any;
      });
  }

  /**
   * Parse CSV line handling quoted values
   */
  private static parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  /**
   * Analyze dataset statistics
   */
  static analyzeDataset(entries: EvaluationDatasetEntry[]): {
    totalEntries: number;
    uniqueGolden: number;
    avgScores: Record<string, number>;
    scoreDistribution: Record<string, number>;
  } {
    const uniqueGolden = new Set(entries.map((e) => e.goldenConversationId)).size;

    const avgScores: Record<string, number> = {};
    const scoreDistribution: Record<string, number> = { excellent: 0, good: 0, fair: 0, poor: 0, failing: 0 };

    // Calculate averages (stub - would aggregate from scores)
    // This is placeholder - actual implementation would vary by dataset

    return {
      totalEntries: entries.length,
      uniqueGolden,
      avgScores,
      scoreDistribution,
    };
  }
}
