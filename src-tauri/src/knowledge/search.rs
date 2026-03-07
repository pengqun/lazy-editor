use crate::knowledge::db::{Database, SearchResult};
use crate::knowledge::embedder::Embedder;
use anyhow::Result;

/// Perform semantic search over the knowledge base.
///
/// 1. Embed the query text
/// 2. Compute cosine similarity against all stored embeddings
/// 3. Return top-k results with chunk content and document metadata
pub fn search(
    db: &Database,
    embedder: &Embedder,
    query: &str,
    top_k: usize,
) -> Result<Vec<SearchResult>> {
    // Embed the query
    let query_embedding = embedder.embed_text(query)?;

    // Get all stored embeddings
    let all_embeddings = db.get_all_embeddings()?;

    if all_embeddings.is_empty() {
        return Ok(vec![]);
    }

    // Compute cosine similarity for each
    let mut scored: Vec<(i64, f64)> = all_embeddings
        .iter()
        .map(|(chunk_id, embedding)| {
            let score = cosine_similarity(&query_embedding, embedding);
            (*chunk_id, score)
        })
        .collect();

    // Sort by score descending
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Take top-k and resolve chunk content + document info
    let mut results = Vec::new();
    for (chunk_id, score) in scored.into_iter().take(top_k) {
        if let Ok((chunk_content, document_title, document_id)) =
            db.get_chunk_with_document(chunk_id)
        {
            results.push(SearchResult {
                chunk_content,
                document_title,
                document_id,
                score,
            });
        }
    }

    Ok(results)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    (dot / (norm_a * norm_b)) as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_vectors_have_similarity_one() {
        let v = vec![1.0, 2.0, 3.0];
        let sim = cosine_similarity(&v, &v);
        assert!((sim - 1.0).abs() < 1e-6, "Expected ~1.0, got {}", sim);
    }

    #[test]
    fn orthogonal_vectors_have_similarity_zero() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 1e-6, "Expected ~0.0, got {}", sim);
    }

    #[test]
    fn opposite_vectors_have_similarity_negative_one() {
        let a = vec![1.0, 0.0];
        let b = vec![-1.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim + 1.0).abs() < 1e-6, "Expected ~-1.0, got {}", sim);
    }

    #[test]
    fn zero_vector_returns_zero() {
        let a = vec![0.0, 0.0, 0.0];
        let b = vec![1.0, 2.0, 3.0];
        assert_eq!(cosine_similarity(&a, &b), 0.0);
        assert_eq!(cosine_similarity(&b, &a), 0.0);
    }

    #[test]
    fn cosine_similarity_is_commutative() {
        let a = vec![1.0, 3.0, -5.0];
        let b = vec![4.0, -2.0, 1.0];
        let ab = cosine_similarity(&a, &b);
        let ba = cosine_similarity(&b, &a);
        assert!((ab - ba).abs() < 1e-9);
    }
}
