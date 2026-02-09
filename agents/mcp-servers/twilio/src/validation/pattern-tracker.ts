// ABOUTME: Tracks recurring validation failure patterns across sessions.
// ABOUTME: Persists patterns to JSON file for cross-session learning and prioritization.

import * as fs from 'fs';
import * as path from 'path';
import type { Diagnosis, RootCauseCategory } from './diagnostic-bridge';


/**
 * History for a single pattern.
 */
export interface PatternHistory {
  /** Unique pattern identifier */
  patternId: string;

  /** Human-readable summary of the pattern */
  summary: string;

  /** Root cause category */
  category: RootCauseCategory;

  /** When this pattern was first seen */
  firstSeen: Date;

  /** When this pattern was last seen */
  lastSeen: Date;

  /** Total occurrences */
  occurrenceCount: number;

  /** Occurrences with timestamps and session IDs */
  occurrences: Array<{
    timestamp: Date;
    sessionId: string;
  }>;

  /** Fix attempts (which fixes were tried) */
  fixAttempts: Array<{
    timestamp: Date;
    fixDescription: string;
    success: boolean;
  }>;

  /** Whether this pattern has been resolved */
  resolved: boolean;

  /** The fix that worked (if resolved) */
  successfulFix?: string;

  /** Suggested documentation to update */
  promotionTarget?: string;
}

/**
 * Pattern database structure.
 */
export interface PatternDatabase {
  /** Version for schema migrations */
  version: number;

  /** Last updated timestamp */
  lastUpdated: Date;

  /** All tracked patterns */
  patterns: Record<string, PatternHistory>;
}

/**
 * Configuration for pattern tracker.
 */
export interface PatternTrackerConfig {
  /** Path to pattern database. Default determined by environment. */
  databasePath?: string;

  /** Maximum occurrences to track per pattern. Default: 100 */
  maxOccurrencesPerPattern?: number;

  /** Threshold for "frequent" pattern. Default: 3 */
  frequentThreshold?: number;
}

const DEFAULT_DATABASE: PatternDatabase = {
  version: 1,
  lastUpdated: new Date(),
  patterns: {},
};

/**
 * Determines the database path based on environment.
 */
function getDatabasePath(projectRoot: string): string {
  const metaPath = path.join(projectRoot, '.meta', 'pattern-db.json');
  const claudePath = path.join(projectRoot, '.claude', 'pattern-db.json');

  // Check if .meta directory exists
  if (fs.existsSync(path.join(projectRoot, '.meta'))) {
    return metaPath;
  }

  return claudePath;
}

/**
 * PatternTracker - Tracks recurring validation failure patterns.
 * Persists patterns to JSON for cross-session learning and prioritization.
 */
export class PatternTracker {
  private config: Required<PatternTrackerConfig>;
  private database: PatternDatabase;
  private dirty: boolean = false;

  constructor(projectRoot: string, config: PatternTrackerConfig = {}) {
    this.config = {
      databasePath: config.databasePath ?? getDatabasePath(projectRoot),
      maxOccurrencesPerPattern: config.maxOccurrencesPerPattern ?? 100,
      frequentThreshold: config.frequentThreshold ?? 3,
    };

    this.database = this.loadDatabase();
  }

  /**
   * Loads the pattern database from disk.
   */
  private loadDatabase(): PatternDatabase {
    try {
      if (fs.existsSync(this.config.databasePath)) {
        const content = fs.readFileSync(this.config.databasePath, 'utf-8');
        const data = JSON.parse(content) as PatternDatabase;

        // Convert date strings back to Date objects
        data.lastUpdated = new Date(data.lastUpdated);
        for (const pattern of Object.values(data.patterns)) {
          pattern.firstSeen = new Date(pattern.firstSeen);
          pattern.lastSeen = new Date(pattern.lastSeen);
          pattern.occurrences = pattern.occurrences.map(o => ({
            ...o,
            timestamp: new Date(o.timestamp),
          }));
          pattern.fixAttempts = pattern.fixAttempts.map(f => ({
            ...f,
            timestamp: new Date(f.timestamp),
          }));
        }

        return data;
      }
    } catch {
      // If load fails, start fresh
    }

    // IMPORTANT: Deep copy the default database to avoid shared state
    return { ...DEFAULT_DATABASE, patterns: {}, lastUpdated: new Date() };
  }

  /**
   * Saves the pattern database to disk.
   */
  private saveDatabase(): void {
    if (!this.dirty) {return;}

    // Ensure directory exists
    const dir = path.dirname(this.config.databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.database.lastUpdated = new Date();
    fs.writeFileSync(
      this.config.databasePath,
      JSON.stringify(this.database, null, 2)
    );
    this.dirty = false;
  }

  /**
   * Records a new occurrence of a pattern from a diagnosis.
   */
  record(diagnosis: Diagnosis, sessionId: string): PatternHistory {
    const { patternId, summary, rootCause } = diagnosis;
    const now = new Date();

    let pattern = this.database.patterns[patternId];

    if (!pattern) {
      // New pattern
      pattern = {
        patternId,
        summary,
        category: rootCause.category,
        firstSeen: now,
        lastSeen: now,
        occurrenceCount: 0,
        occurrences: [],
        fixAttempts: [],
        resolved: false,
      };

      // Promotion target is handled by LearningCaptureEngine
      pattern.promotionTarget = undefined;
    }

    // Update pattern
    pattern.lastSeen = now;
    pattern.occurrenceCount++;
    pattern.occurrences.push({ timestamp: now, sessionId });

    // Trim occurrences if too many
    if (pattern.occurrences.length > this.config.maxOccurrencesPerPattern) {
      pattern.occurrences = pattern.occurrences.slice(-this.config.maxOccurrencesPerPattern);
    }

    // Save
    this.database.patterns[patternId] = pattern;
    this.dirty = true;
    this.saveDatabase();

    return pattern;
  }

  /**
   * Records a fix attempt for a pattern.
   */
  recordFixAttempt(patternId: string, fixDescription: string, success: boolean): void {
    const pattern = this.database.patterns[patternId];
    if (!pattern) {return;}

    pattern.fixAttempts.push({
      timestamp: new Date(),
      fixDescription,
      success,
    });

    if (success) {
      pattern.resolved = true;
      pattern.successfulFix = fixDescription;
    }

    this.dirty = true;
    this.saveDatabase();
  }

  /**
   * Marks a pattern as resolved.
   */
  markResolved(patternId: string, successfulFix: string): void {
    const pattern = this.database.patterns[patternId];
    if (!pattern) {return;}

    pattern.resolved = true;
    pattern.successfulFix = successfulFix;

    this.dirty = true;
    this.saveDatabase();
  }

  /**
   * Looks up a pattern by ID.
   */
  lookup(patternId: string): PatternHistory | undefined {
    return this.database.patterns[patternId];
  }

  /**
   * Checks if a pattern is known.
   */
  isKnown(patternId: string): boolean {
    return patternId in this.database.patterns;
  }

  /**
   * Gets the occurrence count for a pattern.
   */
  getOccurrenceCount(patternId: string): number {
    return this.database.patterns[patternId]?.occurrenceCount ?? 0;
  }

  /**
   * Gets all patterns sorted by frequency (most frequent first).
   */
  getAllPatterns(): PatternHistory[] {
    return Object.values(this.database.patterns)
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  }

  /**
   * Gets frequent patterns (occurrence count >= threshold).
   */
  getFrequentPatterns(): PatternHistory[] {
    return this.getAllPatterns()
      .filter(p => p.occurrenceCount >= this.config.frequentThreshold);
  }

  /**
   * Gets unresolved patterns sorted by frequency.
   */
  getUnresolvedPatterns(): PatternHistory[] {
    return this.getAllPatterns()
      .filter(p => !p.resolved);
  }

  /**
   * Gets patterns by category.
   */
  getPatternsByCategory(category: RootCauseCategory): PatternHistory[] {
    return this.getAllPatterns()
      .filter(p => p.category === category);
  }

  /**
   * Gets patterns seen in the last N days.
   */
  getRecentPatterns(days: number = 7): PatternHistory[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.getAllPatterns()
      .filter(p => p.lastSeen >= cutoff);
  }

  /**
   * Gets statistics about tracked patterns.
   */
  getStats(): {
    totalPatterns: number;
    unresolvedPatterns: number;
    frequentPatterns: number;
    resolvedPatterns: number;
    byCategory: Record<RootCauseCategory, number>;
    recentPatterns: number;
  } {
    const patterns = this.getAllPatterns();
    const byCategory: Record<RootCauseCategory, number> = {
      configuration: 0,
      environment: 0,
      timing: 0,
      external: 0,
      code: 0,
      unknown: 0,
    };

    for (const p of patterns) {
      byCategory[p.category]++;
    }

    return {
      totalPatterns: patterns.length,
      unresolvedPatterns: patterns.filter(p => !p.resolved).length,
      frequentPatterns: patterns.filter(p => p.occurrenceCount >= this.config.frequentThreshold).length,
      resolvedPatterns: patterns.filter(p => p.resolved).length,
      byCategory,
      recentPatterns: this.getRecentPatterns(7).length,
    };
  }

  /**
   * Clears all tracked patterns.
   */
  clear(): void {
    // IMPORTANT: Deep copy to avoid shared state
    this.database = { ...DEFAULT_DATABASE, patterns: {}, lastUpdated: new Date() };
    this.dirty = true;
    this.saveDatabase();
  }

  /**
   * Deletes a specific pattern.
   */
  deletePattern(patternId: string): boolean {
    if (patternId in this.database.patterns) {
      delete this.database.patterns[patternId];
      this.dirty = true;
      this.saveDatabase();
      return true;
    }
    return false;
  }

  /**
   * Gets the database path.
   */
  getDatabasePath(): string {
    return this.config.databasePath;
  }

  /**
   * Forces a save of the database.
   */
  save(): void {
    this.dirty = true;
    this.saveDatabase();
  }
}

/**
 * Creates a PatternTracker instance.
 */
export function createPatternTracker(
  projectRoot: string,
  config?: PatternTrackerConfig
): PatternTracker {
  return new PatternTracker(projectRoot, config);
}
