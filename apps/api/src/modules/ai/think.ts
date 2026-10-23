/** Buang blok <think>…</think> (keluarga Qwen3). Juga menangani penutup tanpa pembuka. */
export function stripThink(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const closeIdx = out.toLowerCase().lastIndexOf('</think>');
  if (closeIdx !== -1) out = out.slice(closeIdx + '</think>'.length);
  // Pembuka tanpa penutup (output terpotong): buang sisanya.
  const openIdx = out.toLowerCase().indexOf('<think>');
  if (openIdx !== -1) out = out.slice(0, openIdx);
  return out.trim();
}

/** Ambil teks JSON dari balasan model (pagar kode ```json dan teks pembuka/penutup ditoleransi). */
export function extractJson(text: string): string {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (cleaned.startsWith('{') || cleaned.startsWith('[')) return cleaned;
  const start = cleaned.search(/[{[]/);
  if (start === -1) return cleaned;
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  const end = cleaned.lastIndexOf(close);
  return end > start ? cleaned.slice(start, end + 1) : cleaned;
}
