const OpenAI = require('openai');

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Writes a short gallery-style description from a title + the tags TensorFlow.js
 * extracted client-side. Falls back gracefully if no API key is configured
 * (e.g. local dev without billing set up).
 */
async function generateArtworkDescription({ title, category, tags = [] }) {
  if (!client) {
    return `${title} — a ${category.toLowerCase()} piece${tags.length ? ` featuring ${tags.slice(0, 3).join(', ')}` : ''}.`;
  }

  const prompt = `Write a warm, concise (max 30 words) gallery description for an artwork titled "${title}", category "${category}", with visual tags: ${tags.join(', ') || 'none provided'}. No hashtags, no marketing fluff.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 80,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

/**
 * Semantic search over artwork: embeds the query and asks the model to rank
 * candidate titles/descriptions/tags. For production scale, swap this for a
 * vector index (pgvector / Mongo Atlas Vector Search) using `embedText`.
 */
async function embedText(text) {
  if (!client) return null;
  const res = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Rank artworks by embedding similarity to the search query. */
async function semanticSearch(query, artworks) {
  if (!client) {
    // naive fallback: substring match on title/description/tags
    const q = query.toLowerCase();
    return artworks.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.getAiTags().some((t) => t.toLowerCase().includes(q))
    );
  }

  const queryEmbedding = await embedText(query);
  const scored = await Promise.all(
    artworks.map(async (a) => {
      const aiTags     = a.getAiTags();
      const embedding  = (a.metadata && a.metadata.style_embedding && a.metadata.style_embedding.length)
        ? a.metadata.style_embedding
        : await embedText(`${a.title} ${a.description} ${aiTags.join(' ')}`);
      return { artwork: a, score: cosineSimilarity(queryEmbedding, embedding) };
    })
  );

  return scored
    .sort((x, y) => y.score - x.score)
    .map((s) => s.artwork);
}

/** Simple "similar artz" recommendation: same category + overlapping tags. */
async function recommendSimilar(targetArtwork, candidatePool, limit = 8) {
  const targetTags = new Set(targetArtwork.getAiTags());
  return candidatePool
    .filter((a) => a.id !== targetArtwork.id)
    .map((a) => ({
      artwork: a,
      score:
        (a.category === targetArtwork.category ? 2 : 0) +
        a.getAiTags().filter((t) => targetTags.has(t)).length,
    }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((s) => s.artwork);
}

module.exports = { generateArtworkDescription, embedText, semanticSearch, recommendSimilar };
