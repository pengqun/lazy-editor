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
        .collect();

    // Sort by score descending
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Take top-k and resolve chunk content + document info
    let mut results = Vec::new();
    for (chunk_id, score) in scored.into_iter().take(top_k) {
        if let Ok((chunk_content, document_title, document_id, chunk_id, chunk_index)) =
            db.get_chunk_with_document(chunk_id)
        {
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

        // Unscoped: both results
        let results = search_with_embedding_scoped(&db, &query_emb, 10, None).unwrap();
        assert_eq!(results.len(), 2);

        // Scoped to doc1 only
        let results = search_with_embedding_scoped(&db, &query_emb, 10, Some(&[doc1])).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].document_title, "Doc1");

        // Scoped to doc2 only
        let results = search_with_embedding_scoped(&db, &query_emb, 10, Some(&[doc2])).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].document_title, "Doc2");

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
            db.insert_embedding(c, &[1.0, i as f32]).unwrap();
        }

        let query = vec![1.0, 0.0];
        let results = search_with_embedding(&db, &query, 2).unwrap();
        assert_eq!(results.len(), 2);
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
