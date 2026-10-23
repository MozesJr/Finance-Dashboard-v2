/**
 * Gateway LLM mengirim respons non-streaming dengan content-type `text/event-stream`
 * dan body JSON diikuti `data: [DONE]`. SDK OpenAI akan memperlakukannya sebagai teks mentah.
 * Fetch ini membersihkan body dan mengembalikan content-type application/json.
 */
export function createNormalizingFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    const text = await response.text();
    const cleaned = text.replace(/\s*data:\s*\[DONE\]\s*$/i, '').trim();
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    if (cleaned.startsWith('{') || cleaned.startsWith('[')) headers.set('content-type', 'application/json');
    return new Response(cleaned, { status: response.status, statusText: response.statusText, headers });
  };
}
