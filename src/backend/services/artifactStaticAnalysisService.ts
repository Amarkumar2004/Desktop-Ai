import * as ts from 'typescript';

export interface ArtifactDiagnostic {
  file: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  line?: number;
  column?: number;
}

export interface ArtifactAnalysisResult {
  checked: number;
  passed: boolean;
  diagnostics: ArtifactDiagnostic[];
  summary: string;
}

/**
 * Deterministic, offline checks for generated artifacts. This is deliberately
 * not described as a full project build/type-check: artifacts are not installed
 * into the user's workspace and arbitrary shell commands are never executed.
 */
export function analyzeGeneratedArtifacts(
  artifacts: Array<{ filename: string; content: string; language?: string }>
): ArtifactAnalysisResult {
  const diagnostics: ArtifactDiagnostic[] = [];

  for (const artifact of artifacts) {
    const filename = artifact.filename || 'unnamed-artifact';
    const content = artifact.content || '';
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const language = (artifact.language || '').toLowerCase();

    if (!content.trim()) {
      diagnostics.push({ file: filename, severity: 'error', code: 'EMPTY_ARTIFACT', message: 'Artifact is empty.' });
      continue;
    }

    if (extension === 'json' || language === 'json') {
      try {
        JSON.parse(content);
      } catch (error) {
        diagnostics.push({
          file: filename,
          severity: 'error',
          code: 'INVALID_JSON',
          message: error instanceof Error ? error.message : 'Invalid JSON.',
        });
      }
      continue;
    }

    const isTypeScript = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(extension)
      || ['typescript', 'tsx', 'javascript', 'jsx', 'js'].includes(language);
    if (!isTypeScript) {
      diagnostics.push({ file: filename, severity: 'warning', code: 'UNSUPPORTED_ANALYSIS_LANGUAGE', message: 'This artifact language was not syntax-checked by the TypeScript parser.' });
    }

    if (isTypeScript) {
      const scriptKind = extension === 'tsx' || extension === 'jsx' || language === 'tsx' || language === 'jsx'
        ? ts.ScriptKind.TSX
        : extension === 'js' || extension === 'mjs' || extension === 'cjs' || language === 'javascript' || language === 'js'
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
      const source = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true, scriptKind);
      for (const diagnostic of source.parseDiagnostics) {
        const position = diagnostic.start ?? 0;
        const location = source.getLineAndCharacterOfPosition(position);
        diagnostics.push({
          file: filename,
          severity: 'error',
          code: 'SYNTAX_ERROR',
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
          line: location.line + 1,
          column: location.character + 1,
        });
      }
    }

    const unsafePatterns: Array<[RegExp, string, string]> = [
      [/\\beval\\s*\\(/, 'DYNAMIC_EVAL', 'Dynamic eval() can execute untrusted code.'],
      [/\\bnew\\s+Function\\s*\\(/, 'DYNAMIC_FUNCTION', 'The Function constructor can execute dynamically supplied code.'],
      [/\\bchild_process\\b|\\bexecSync\\s*\\(|\\bspawnSync\\s*\\(/, 'PROCESS_EXECUTION', 'Direct process execution requires a separately approved, contained execution path.'],
    ];
    for (const [pattern, code, message] of unsafePatterns) {
      if (pattern.test(content)) {
        diagnostics.push({ file: filename, severity: 'warning', code, message });
      }
    }
    if (/TODO|FIXME|IMPLEMENT_ME|YOUR_API_KEY/i.test(content)) {
      diagnostics.push({ file: filename, severity: 'warning', code: 'INCOMPLETE_MARKER', message: 'Artifact contains a TODO, FIXME, or placeholder marker.' });
    }
  }

  const errors = diagnostics.filter((item) => item.severity === 'error').length;
  const warnings = diagnostics.filter((item) => item.severity === 'warning').length;
  return {
    checked: artifacts.length,
    passed: errors === 0,
    diagnostics,
    summary: errors
      ? `Static artifact checks failed: ${errors} error(s), ${warnings} warning(s).`
      : `Static artifact checks passed for ${artifacts.length} artifact(s) with ${warnings} warning(s).`,
  };
}
