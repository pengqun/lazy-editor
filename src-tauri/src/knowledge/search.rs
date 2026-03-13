use crate::knowledge::db::{Database, SearchResult};
use crate::knowledge::embedder::Embedder;
use anyhow::Result;
use std::collections::HashMap;

/// Minimum cosine similarity to include a result (filters noise).
const SCORE_THRESHOLD: f64 = 0.25;

/// Perform semantic search over the knowledge base.
///
/// 1. Embed the query text
/// 2. Compute cosine similarity against all stored embeddings
/// 3. Return top-k results with chunk content and document metadata
#[allow(dead_code)]
pub fn search(
    db: &Database,
    embedder: &Embedder,
    query: &str,
    top_k: usize,
) -> Result<Vec<SearchResult>> {
    let query_embedding = embedder.embed_text(query)?;
    search_with_embedding(db, &query_embedding, top_k)
}

/// Search using a pre-computed query embedding. Allows callers to manage
/// embedder and DB locks independently.
pub fn search_with_embedding(
    db: &Database,
    query_embedding: &[f32],
    top_k: usize,
) -> Result<Vec<SearchResult>> {
    search_with_embedding_scoped(db, query_embedding, top_k, None)
}

/// Search using a pre-computed query embedding, optionally scoped to specific document IDs.
/// When `scope_doc_ids` is `Some`, only chunks from those documents are considered.
///
/// Results are filtered by a minimum relevance threshold and deduplicated so that
/// at most 2 chunks from the same document appear in the top-k, improving diversity.
pub fn search_with_embedding_scoped(
    db: &Database,
    query_embedding: &[f32],
    top_k: usize,
    scope_doc_ids: Option<&[i64]>,
) -> Result<Vec<SearchResult>> {
    // Get embeddings — filtered by scope if provided
    let all_embeddings = match scope_doc_ids {
        Some(ids) => db.get_embeddings_for_documents(ids)?,
        None => db.get_all_embeddings()?,
    };

    if all_embeddings.is_empty() {
        return Ok(vec![]);
    }

    // Compute cosine similarity for each
    let mut scored: Vec<(i64, f64)> = all_embeddings
        .iter()
        .map(|(chunk_id, embedding)| {
            let score = cosine_similarity(query_embedding, embedding);
            (*chunk_id, score)
        })
        .filter(|(_, score)| *score >= SCORE_THRESHOLD)
        .collect();

    // Sort by score descending
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Take top-k with document diversity: max 2 chunks per document
    let max_per_doc: usize = 2;
    let mut doc_counts: HashMap<i64, usize> = HashMap::new();
    let mut results = Vec::new();

    for (chunk_id, score) in scored {
        if results.len() >= top_k {
            break;
        }
        if let Ok((chunk_content, document_title, document_id, chunk_id, chunk_index)) =
            db.get_chunk_with_document(chunk_id)
        {
            let count = doc_counts.entry(document_id).or_insert(0);
            if *count >= max_per_doc {
                continue;
            }
            *count += 1;
            results.push(SearchResult {
                chunk_content,
                document_title,
                document_id,
                chunk_id,
                chunk_index,
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
    use std::path::PathBuf;

    fn test_db() -> Database {
        Database::new(&PathBuf::from(":memory:")).unwrap()
    }

    #[test]
    fn search_with_embedding_scoped_filters_by_document() {
        let db = test_db();
        let doc1 = db.insert_document("Doc1", "paste", None, "content1").unwrap();
        let doc2 = db.insert_document("Doc2", "paste", None, "content2").unwrap();

        let c1 = db.insert_chunk(doc1, "chunk from doc1", 0, None).unwrap();
        let c2 = db.insert_chunk(doc2, "chunk from doc2", 0, None).unwrap();

        // Use simple 2D embeddings: doc1 chunk near query, doc2 chunk far
        db.insert_embedding(c1, &[1.0, 0.0]).unwrap();
        db.insert_embedding(c2, &[0.0, 1.0]).unwrap();

        let query_emb = vec![1.0, 0.0]; // matches doc1

        // Unscoped: doc1 chunk matches, doc2 is orthogonal (score ≈ 0, below threshold)
        let results = search_with_embedding_scoped(&db, &query_emb, 10, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].document_title, "Doc1");

        // Scoped to doc1 only
        let results = search_with_embedding_scoped(&db, &query_emb, 10, Some(&[doc1])).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].document_title, "Doc1");

        // Scoped to doc2 only — no results above threshold
        let results = search_with_embedding_scoped(&db, &query_emb, 10, Some(&[doc2])).unwrap();
        assert!(results.is_empty());

        // Empty scope returns no results
        let results = search_with_embedding_scoped(&db, &query_emb, 10, Some(&[])).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn search_with_embedding_respects_top_k() {
        let db = test_db();
        let doc = db.insert_document("Doc", "paste", None, "content").unwrap();

        for i in 0..5 {
            let c = db.insert_chunk(doc, &format!("chunk {}", i), i, None).unwrap();
            // All embeddings point roughly in the same direction as query
            db.insert_embedding(c, &[1.0, 0.1 * i as f32]).unwrap();
        }

        let query = vec![1.0, 0.0];
        // Max 2 chunks per doc, so even with top_k=5 we get at most 2
        let results = search_with_embedding(&db, &query, 2).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn search_filters_low_relevance_results() {
        let db = test_db();
        let doc = db.insert_document("Doc", "paste", None, "content").unwrap();

        let c1 = db.insert_chunk(doc, "relevant chunk", 0, None).unwrap();
        let c2 = db.insert_chunk(doc, "irrelevant chunk", 1, None).unwrap();

        // c1 is nearly aligned with query, c2 is nearly orthogonal
        db.insert_embedding(c1, &[1.0, 0.1]).unwrap();
        db.insert_embedding(c2, &[0.1, 1.0]).unwrap();

        let query = vec![1.0, 0.0];
        let results = search_with_embedding(&db, &query, 10).unwrap();
        // Only the relevant chunk should pass the threshold
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].chunk_content, "relevant chunk");
    }

    #[test]
    fn search_limits_chunks_per_document() {
        let db = test_db();
        let doc1 = db.insert_document("Doc1", "paste", None, "content1").unwrap();
        let doc2 = db.insert_document("Doc2", "paste", None, "content2").unwrap();

        // 5 chunks from doc1, all highly relevant
        for i in 0..5 {
            let c = db.insert_chunk(doc1, &format!("doc1 chunk {}", i), i, None).unwrap();
            db.insert_embedding(c, &[1.0, 0.05 * i as f32]).unwrap();
        }
        // 1 chunk from doc2, also relevant
        let c = db.insert_chunk(doc2, "doc2 chunk", 0, None).unwrap();
        db.insert_embedding(c, &[0.9, 0.1]).unwrap();

        let query = vec![1.0, 0.0];
        let results = search_with_embedding(&db, &query, 10).unwrap();

        // Should have max 2 from doc1 + 1 from doc2 = 3
        let doc1_count = results.iter().filter(|r| r.document_id == doc1).count();
        let doc2_count = results.iter().filter(|r| r.document_id == doc2).count();
        assert!(doc1_count <= 2, "Expected max 2 from doc1, got {}", doc1_count);
        assert_eq!(doc2_count, 1);
    }

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
