import fs from 'fs';
import path from 'path';

const PROJECTS_DIR = '/home/nmaldaner/projetos';

/**
 * Common phrases that indicate a project reference in a message.
 * Matches: "no projeto X", "projeto X", "in project X", "project X",
 * "no repo X", "no repositorio X", "na pasta X", "in folder X"
 */
const PROJECT_PATTERNS = [
  /(?:no|in|do|from|na|ao|pelo)\s+(?:projeto|project|repo|reposit[oó]rio|pasta|folder)\s+([a-zA-Z0-9._-]+)/i,
  /(?:projeto|project)\s+([a-zA-Z0-9._-]+)/i,
];

export interface ResolveResult {
  found: true;
  cwd: string;
  cleanedMessage: string;
}

export interface ResolveNotFound {
  found: false;
  name: string;
  suggestions: string[];
}

/**
 * Simple similarity score between two strings (case-insensitive).
 * Returns 0-1 where 1 is exact match.
 */
function similarity(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.8;

  // Count matching characters in order (subsequence match)
  let matches = 0;
  let bi = 0;
  for (let ai = 0; ai < la.length && bi < lb.length; ai++) {
    if (la[ai] === lb[bi]) {
      matches++;
      bi++;
    }
  }
  return matches / Math.max(la.length, lb.length);
}

/**
 * Try to extract a project name from the message and resolve it to a path.
 */
export function resolveProject(message: string): ResolveResult | ResolveNotFound | null {
  for (const pattern of PROJECT_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const name = match[1];
      const projectPath = path.join(PROJECTS_DIR, name);

      if (fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory()) {
        const cleanedMessage = message.replace(match[0], '').replace(/^\s*,?\s*/, '').trim();
        return { found: true, cwd: projectPath, cleanedMessage: cleanedMessage || message };
      }

      // Project name mentioned but not found — suggest similar names
      const suggestions = findSimilarProjects(name);
      return { found: false, name, suggestions };
    }
  }

  return null;
}

/**
 * Find projects with similar names (for typo correction).
 */
function findSimilarProjects(name: string, maxResults = 5): string[] {
  try {
    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const scored = dirs
      .map((d) => ({ name: d, score: similarity(name, d) }))
      .filter((s) => s.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return scored.map((s) => s.name);
  } catch {
    return [];
  }
}
