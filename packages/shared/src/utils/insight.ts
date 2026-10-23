export interface RupiahMention {
  raw: string;
  value: bigint;
  /** Selisih maksimum (rupiah) yang dianggap pembulatan. */
  tolerance: bigint;
}

const UNIT_VALUE: Record<string, bigint> = {
  ribu: 1_000n,
  rb: 1_000n,
  juta: 1_000_000n,
  jt: 1_000_000n,
  miliar: 1_000_000_000n,
};

/**
 * Cari semua penyebutan nominal Rupiah dalam teks: "Rp1.287.500", "Rp 1,3 juta", "350 ribu", "2jt",
 * dan angka bertitik ribuan tanpa "Rp" ("1.287.500"). Angka biasa ("3 bulan", "2026") diabaikan.
 */
export function extractRupiahAmounts(text: string): RupiahMention[] {
  const out: RupiahMention[] = [];
  const re = /(Rp\.?\s?)?(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)(?:\s?(juta|jt|ribu|rb|miliar)\b)?/gi;
  for (const m of text.matchAll(re)) {
    const hasRp = Boolean(m[1]);
    const number = m[2];
    const unit = m[3]?.toLowerCase();
    const grouped = /^\d{1,3}(?:\.\d{3})+$/.test(number);
    if (!hasRp && !unit && !grouped) continue;

    if (unit) {
      const [intPart, decPart = ''] = number.replace(/\./g, '').split(',');
      const unitValue = UNIT_VALUE[unit];
      const scale = 10n ** BigInt(decPart.length);
      const value = (BigInt(intPart + decPart) * unitValue) / scale;
      // Pembulatan ke digit terakhir yang ditampilkan: toleransi setengah satuan terakhir.
      out.push({ raw: m[0].trim(), value, tolerance: unitValue / scale / 2n });
    } else {
      const digits = number.split(',')[0].replace(/\./g, '');
      out.push({ raw: m[0].trim(), value: BigInt(digits), tolerance: 0n });
    }
  }
  return out;
}

/** Setiap nominal Rupiah di narasi harus ada (dengan toleransi pembulatan) di daftar angka statistik. */
export function validateNarrativeNumbers(texts: string[], allowed: bigint[]): { ok: boolean; unknown: string[] } {
  const unknown: string[] = [];
  for (const text of texts) {
    for (const mention of extractRupiahAmounts(text)) {
      const matches = allowed.some((a) => {
        const diff = a > mention.value ? a - mention.value : mention.value - a;
        return diff <= mention.tolerance;
      });
      if (!matches) unknown.push(mention.raw);
    }
  }
  return { ok: unknown.length === 0, unknown };
}
