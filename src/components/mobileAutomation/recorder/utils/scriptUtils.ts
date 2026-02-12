/**
 * Utility: syntaxHighlightScript
 * Purpose: Produces lightweight HTML highlighting for rendered script preview.
 * Important: Keep token patterns stable to avoid visual regressions in script tab.
 */
export const syntaxHighlightScript = (code: string): string => {
  const escape = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escaped = escape(code || "");
  const keyword = /\b(const|let|var|function|async|await|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|class|extends|super|import|from|export|default)\b/g;
  const strings = /(".*?"|'.*?'|`.*?`)/g;
  const comments = /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm;
  return escaped
    .replace(comments, '<span class="text-zinc-500">$1</span>')
    .replace(strings, '<span class="text-amber-300">$1</span>')
    .replace(keyword, '<span class="text-sky-300">$1</span>');
};
