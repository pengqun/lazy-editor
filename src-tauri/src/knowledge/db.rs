use anyhow::{bail, Result};
use rusqlite::{params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::Path;

pub struct Database {
    conn: Connection,
}

#[derive(Debug, Serialize, Clone)]
pub struct KBDocument {
    pub id: i64,
    pub title: String,
    #[serde(rename = "sourceType")]
    pub source_type: String,
    #[serde(rename = "sourcePath")]
    pub source_path: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "chunkCount")]
    pub chunk_count: i64,
}

#[derive(Debug, Serialize, Clone)]
///
/// Note: kept intentionally for future features (e.g. listing chunks, debug views, editing KB).
#[allow(dead_code)]
pub struct Chunk {
    pub id: i64,
    pub document_id: i64,
    pub content: String,
    pub chunk_index: i64,
    pub token_count: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    #[serde(rename = "chunkContent")]
    pub chunk_content: String,
    #[serde(rename = "documentTitle")]
    pub document_title: String,
    #[serde(rename = "documentId")]
    pub document_id: i64,
    #[serde(rename = "chunkId")]
    pub chunk_id: i64,
    #[serde(rename = "chunkIndex")]
    pub chunk_index: i64,
    pub score: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ChunkContext {
    #[serde(rename = "chunkContent")]
    pub chunk_content: String,
    #[serde(rename = "documentTitle")]
    pub document_title: String,
    #[serde(rename = "documentId")]
    pub document_id: i64,
    #[serde(rename = "chunkId")]
    pub chunk_id: i64,
    #[serde(rename = "chunkIndex")]
    pub chunk_index: i64,
    #[serde(rename = "totalChunks")]
    pub total_chunks: i64,
    #[serde(rename = "prevChunk")]
    pub prev_chunk: Option<String>,
    #[serde(rename = "nextChunk")]
    pub next_chunk: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Snapshot {
    pub id: i64,
    #[serde(rename = "filePath")]
    pub file_path: String,
    pub preview: String,
    #[serde(rename = "contentLength")]
    pub content_length: usize,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

impl Database {
    pub fn new(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;

        // Enable WAL mode for better concurrent access
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_path TEXT,
                content TEXT NOT NULL,
                content_hash TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                token_count INTEGER
            );

            CREATE TABLE IF NOT EXISTS chunk_embeddings (
                chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
                embedding BLOB NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash);

            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL,
                content TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_snapshots_file_path ON snapshots(file_path);
            CREATE INDEX IF NOT EXISTS idx_snapshots_file_path_created ON snapshots(file_path, created_at DESC);
            ",
        )?;

        // Migration: add content_hash column if missing (existing databases)
        let has_content_hash: bool = conn
            .prepare("SELECT COUNT(*) FROM pragma_table_info('documents') WHERE name='content_hash'")?
            .query_row([], |row| row.get::<_, i64>(0))
            .map(|c| c > 0)
            .unwrap_or(false);
        if !has_content_hash {
            conn.execute_batch("ALTER TABLE documents ADD COLUMN content_hash TEXT")?;
            conn.execute_batch(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash)",
            )?;
        }

        Ok(Database { conn })
    }

    pub fn insert_document(
        &self,
        title: &str,
        source_type: &str,
        source_path: Option<&str>,
        content: &str,
    ) -> Result<i64> {
        let hash = content_hash(content);
        self.conn.execute(
            "INSERT INTO documents (title, source_type, source_path, content, content_hash) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![title, source_type, source_path, content, hash],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Returns `Some(title)` if a document with the same content hash exists.
    pub fn find_document_by_content_hash(&self, content: &str) -> Result<Option<String>> {
        let hash = content_hash(content);
        let mut stmt = self
            .conn
            .prepare("SELECT title FROM documents WHERE content_hash = ?1")?;
        let title = stmt
            .query_row(params![hash], |row| row.get::<_, String>(0))
            .ok();
        Ok(title)
    }

    pub fn insert_chunk(
        &self,
        document_id: i64,
        content: &str,
        chunk_index: i64,
        token_count: Option<i64>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO chunks (document_id, content, chunk_index, token_count) VALUES (?1, ?2, ?3, ?4)",
            params![document_id, content, chunk_index, token_count],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn insert_embedding(&self, chunk_id: i64, embedding: &[f32]) -> Result<()> {
        let blob = embedding_to_blob(embedding);
        self.conn.execute(
            "INSERT INTO chunk_embeddings (chunk_id, embedding) VALUES (?1, ?2)",
            params![chunk_id, blob],
        )?;
        Ok(())
    }

    pub fn insert_document_with_embeddings(
        &mut self,
        title: &str,
        source_type: &str,
        source_path: Option<&str>,
        content: &str,
        chunks: &[String],
        token_counts: &[i64],
        embeddings: &[Vec<f32>],
    ) -> Result<i64> {
        if chunks.len() != embeddings.len() || chunks.len() != token_counts.len() {
            bail!("chunks/embeddings/token_counts length mismatch");
        }

        let tx = self.conn.transaction()?;
        let hash = content_hash(content);
        tx.execute(
            "INSERT INTO documents (title, source_type, source_path, content, content_hash) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![title, source_type, source_path, content, hash],
        )?;
        let doc_id = tx.last_insert_rowid();

        for (index, chunk) in chunks.iter().enumerate() {
            tx.execute(
                "INSERT INTO chunks (document_id, content, chunk_index, token_count) VALUES (?1, ?2, ?3, ?4)",
                params![doc_id, chunk, index as i64, Some(token_counts[index])],
            )?;
            let chunk_id = tx.last_insert_rowid();
            let blob = embedding_to_blob(&embeddings[index]);
            tx.execute(
                "INSERT INTO chunk_embeddings (chunk_id, embedding) VALUES (?1, ?2)",
                params![chunk_id, blob],
            )?;
        }

        tx.commit()?;
        Ok(doc_id)
    }

    pub fn list_documents(&self) -> Result<Vec<KBDocument>> {
        let mut stmt = self.conn.prepare(
            "SELECT d.id, d.title, d.source_type, d.source_path, d.created_at,
                    (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) as chunk_count
             FROM documents d
             ORDER BY d.created_at DESC",
        )?;

        let docs = stmt
            .query_map([], |row| {
                Ok(KBDocument {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    source_type: row.get(2)?,
                    source_path: row.get(3)?,
                    created_at: row.get(4)?,
                    chunk_count: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(docs)
    }

    pub fn remove_document(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM documents WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_all_embeddings(&self) -> Result<Vec<(i64, Vec<f32>)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT chunk_id, embedding FROM chunk_embeddings")?;

        let results = stmt
            .query_map([], |row| {
                let chunk_id: i64 = row.get(0)?;
                let blob: Vec<u8> = row.get(1)?;
                let embedding = blob_to_embedding(&blob);
                Ok((chunk_id, embedding))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(results)
    }

    /// Get embeddings only for chunks belonging to the given document IDs.
    pub fn get_embeddings_for_documents(&self, doc_ids: &[i64]) -> Result<Vec<(i64, Vec<f32>)>> {
        if doc_ids.is_empty() {
            return Ok(vec![]);
        }
        // Build a WHERE IN clause with positional parameters
        let placeholders: Vec<String> = (1..=doc_ids.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "SELECT ce.chunk_id, ce.embedding
             FROM chunk_embeddings ce
             JOIN chunks c ON c.id = ce.chunk_id
             WHERE c.document_id IN ({})",
            placeholders.join(", ")
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::types::ToSql> =
            doc_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
        let results = stmt
            .query_map(params.as_slice(), |row| {
                let chunk_id: i64 = row.get(0)?;
                let blob: Vec<u8> = row.get(1)?;
                let embedding = blob_to_embedding(&blob);
                Ok((chunk_id, embedding))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(results)
    }

    pub fn get_chunk_with_document(
        &self,
        chunk_id: i64,
    ) -> Result<(String, String, i64, i64, i64)> {
        let mut stmt = self.conn.prepare(
            "SELECT c.content, d.title, d.id, c.id, c.chunk_index
             FROM chunks c
             JOIN documents d ON c.document_id = d.id
             WHERE c.id = ?1",
        )?;

        let result = stmt.query_row(params![chunk_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?;

        Ok(result)
    }

    /// Retrieve a chunk with its surrounding context (adjacent chunks from the same document).
    /// Returns the target chunk content, its neighbours, and document metadata.
    pub fn get_chunk_with_context(
        &self,
        chunk_id: i64,
    ) -> Result<ChunkContext> {
        // First, get the target chunk info
        let (content, doc_title, doc_id, _, chunk_index) =
            self.get_chunk_with_document(chunk_id)?;

        // Get the total number of chunks in this document
        let total_chunks: i64 = self
            .conn
            .prepare("SELECT COUNT(*) FROM chunks WHERE document_id = ?1")?
            .query_row(params![doc_id], |row| row.get(0))?;

        // Get adjacent chunks (previous + next) for surrounding context
        let mut stmt = self.conn.prepare(
            "SELECT content, chunk_index FROM chunks
             WHERE document_id = ?1 AND chunk_index IN (?2, ?3)
             ORDER BY chunk_index ASC",
        )?;
        let prev_index = chunk_index - 1;
        let next_index = chunk_index + 1;
        let neighbours: Vec<(String, i64)> = stmt
            .query_map(params![doc_id, prev_index, next_index], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let prev_chunk = neighbours
            .iter()
            .find(|(_, idx)| *idx == prev_index)
            .map(|(c, _)| c.clone());
        let next_chunk = neighbours
            .iter()
            .find(|(_, idx)| *idx == next_index)
            .map(|(c, _)| c.clone());

        Ok(ChunkContext {
            chunk_content: content,
            document_title: doc_title,
            document_id: doc_id,
            chunk_id,
            chunk_index,
            total_chunks,
            prev_chunk,
            next_chunk,
        })
    }

    // ── Snapshot methods ──

    /// Create a snapshot if content differs from the latest one for this file.
    /// Returns `Some(id)` if created, `None` if skipped (content unchanged).
    /// Prunes oldest snapshots beyond `max_per_file`.
    pub fn create_snapshot(
        &self,
        file_path: &str,
        content: &str,
        max_per_file: i64,
    ) -> Result<Option<i64>> {
        let hash = content_hash(content);

        // Check if latest snapshot has the same content hash
        let latest_hash: Option<String> = self
            .conn
            .prepare(
                "SELECT content_hash FROM snapshots WHERE file_path = ?1 ORDER BY created_at DESC LIMIT 1",
            )?
            .query_row(params![file_path], |row| row.get(0))
            .ok();

        if latest_hash.as_deref() == Some(&hash) {
            return Ok(None);
        }

        self.conn.execute(
            "INSERT INTO snapshots (file_path, content, content_hash) VALUES (?1, ?2, ?3)",
            params![file_path, content, hash],
        )?;
        let id = self.conn.last_insert_rowid();

        // Prune oldest beyond cap
        self.conn.execute(
            "DELETE FROM snapshots WHERE file_path = ?1 AND id NOT IN (
                SELECT id FROM snapshots WHERE file_path = ?1 ORDER BY created_at DESC LIMIT ?2
            )",
            params![file_path, max_per_file],
        )?;

        Ok(Some(id))
    }

    pub fn list_snapshots(&self, file_path: &str, limit: i64) -> Result<Vec<Snapshot>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, file_path, content, created_at FROM snapshots
             WHERE file_path = ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )?;

        let snapshots = stmt
            .query_map(params![file_path, limit], |row| {
                let content: String = row.get(2)?;
                let preview = if content.len() > 200 {
                    format!("{}...", &content[..200])
                } else {
                    content.clone()
                };
                Ok(Snapshot {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    preview,
                    content_length: content.len(),
                    created_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(snapshots)
    }

    pub fn get_snapshot_content(&self, id: i64) -> Result<String> {
        let content = self
            .conn
            .prepare("SELECT content FROM snapshots WHERE id = ?1")?
            .query_row(params![id], |row| row.get::<_, String>(0))?;
        Ok(content)
    }

    pub fn delete_snapshot(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM snapshots WHERE id = ?1", params![id])?;
        Ok(())
    }
}

fn content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn embedding_to_blob(embedding: &[f32]) -> Vec<u8> {
    embedding
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect()
}

fn blob_to_embedding(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|chunk| {
            let bytes: [u8; 4] = chunk.try_into().unwrap();
            f32::from_le_bytes(bytes)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_db() -> Database {
        // Use in-memory SQLite for tests
        Database::new(&PathBuf::from(":memory:")).unwrap()
    }

    #[test]
    fn create_database_succeeds() {
        let db = test_db();
        let docs = db.list_documents().unwrap();
        assert!(docs.is_empty());
    }

    #[test]
    fn insert_and_list_document() {
        let db = test_db();
        let id = db
            .insert_document("Test Doc", "paste", None, "Hello world")
            .unwrap();
        assert!(id > 0);

        let docs = db.list_documents().unwrap();
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].title, "Test Doc");
        assert_eq!(docs[0].source_type, "paste");
        assert!(docs[0].source_path.is_none());
        assert_eq!(docs[0].chunk_count, 0); // No chunks inserted yet
    }

    #[test]
    fn insert_document_with_source_path() {
        let db = test_db();
        db.insert_document("File Doc", "file", Some("/path/to/file.md"), "content")
            .unwrap();

        let docs = db.list_documents().unwrap();
        assert_eq!(docs[0].source_path.as_deref(), Some("/path/to/file.md"));
    }

    #[test]
    fn chunk_count_reflects_inserted_chunks() {
        let db = test_db();
        let doc_id = db
            .insert_document("Doc", "paste", None, "content")
            .unwrap();
        db.insert_chunk(doc_id, "chunk 0", 0, Some(10)).unwrap();
        db.insert_chunk(doc_id, "chunk 1", 1, Some(15)).unwrap();

        let docs = db.list_documents().unwrap();
        assert_eq!(docs[0].chunk_count, 2);
    }

    #[test]
    fn remove_document_cascades() {
        let db = test_db();
        let doc_id = db.insert_document("D", "paste", None, "c").unwrap();
        let chunk_id = db.insert_chunk(doc_id, "chunk text", 0, None).unwrap();
        db.insert_embedding(chunk_id, &[1.0, 2.0, 3.0]).unwrap();

        db.remove_document(doc_id).unwrap();

        assert!(db.list_documents().unwrap().is_empty());
        assert!(db.get_all_embeddings().unwrap().is_empty());
        assert!(db.get_chunk_with_document(chunk_id).is_err());
    }

    #[test]
    fn get_chunk_with_document_returns_correct_data() {
        let db = test_db();
        let doc_id = db
            .insert_document("My Doc", "file", None, "full content")
            .unwrap();
        let chunk_id = db.insert_chunk(doc_id, "chunk content", 0, Some(5)).unwrap();

        let (content, title, returned_doc_id, returned_chunk_id, returned_chunk_index) =
            db.get_chunk_with_document(chunk_id).unwrap();
        assert_eq!(content, "chunk content");
        assert_eq!(title, "My Doc");
        assert_eq!(returned_doc_id, doc_id);
        assert_eq!(returned_chunk_id, chunk_id);
        assert_eq!(returned_chunk_index, 0);
    }

    #[test]
    fn embedding_blob_roundtrip() {
        let original: Vec<f32> = vec![1.0, -0.5, 0.0, 3.14, f32::MIN, f32::MAX];
        let blob = embedding_to_blob(&original);
        let recovered = blob_to_embedding(&blob);
        assert_eq!(original, recovered);
    }

    #[test]
    fn embedding_blob_empty() {
        let empty: Vec<f32> = vec![];
        let blob = embedding_to_blob(&empty);
        assert!(blob.is_empty());
        let recovered = blob_to_embedding(&blob);
        assert!(recovered.is_empty());
    }

    #[test]
    fn insert_and_retrieve_embedding() {
        let db = test_db();
        let doc_id = db.insert_document("D", "paste", None, "c").unwrap();
        let chunk_id = db.insert_chunk(doc_id, "text", 0, None).unwrap();

        let embedding = vec![0.1, 0.2, 0.3, 0.4];
        db.insert_embedding(chunk_id, &embedding).unwrap();

        let all = db.get_all_embeddings().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].0, chunk_id);
        assert_eq!(all[0].1, embedding);
    }

    #[test]
    fn multiple_documents_list_order() {
        let db = test_db();
        db.insert_document("First", "paste", None, "a").unwrap();
        db.insert_document("Second", "paste", None, "b").unwrap();

        let docs = db.list_documents().unwrap();
        assert_eq!(docs.len(), 2);
        // Ordered by created_at DESC — both created at same time,
        // but IDs should differ
        assert_ne!(docs[0].id, docs[1].id);
    }

    #[test]
    fn find_document_by_content_hash_returns_none_when_empty() {
        let db = test_db();
        assert!(db
            .find_document_by_content_hash("anything")
            .unwrap()
            .is_none());
    }

    #[test]
    fn find_document_by_content_hash_finds_existing() {
        let db = test_db();
        db.insert_document("My Doc", "paste", None, "hello world")
            .unwrap();
        let found = db.find_document_by_content_hash("hello world").unwrap();
        assert_eq!(found, Some("My Doc".to_string()));
    }

    #[test]
    fn find_document_by_content_hash_no_match_for_different_content() {
        let db = test_db();
        db.insert_document("My Doc", "paste", None, "hello world")
            .unwrap();
        assert!(db
            .find_document_by_content_hash("different content")
            .unwrap()
            .is_none());
    }

    #[test]
    fn duplicate_content_hash_rejected_by_unique_index() {
        let db = test_db();
        db.insert_document("First", "paste", None, "same content")
            .unwrap();
        let result = db.insert_document("Second", "paste", None, "same content");
        assert!(result.is_err());
    }

    #[test]
    fn content_hash_deterministic() {
        let hash1 = content_hash("test content");
        let hash2 = content_hash("test content");
        assert_eq!(hash1, hash2);
        assert_ne!(hash1, content_hash("different content"));
    }

    // ── Snapshot tests ──

    #[test]
    fn create_snapshot_returns_id() {
        let db = test_db();
        let id = db.create_snapshot("/workspace/doc.md", "# Hello", 50).unwrap();
        assert!(id.is_some());
        assert!(id.unwrap() > 0);
    }

    #[test]
    fn create_snapshot_deduplicates_unchanged_content() {
        let db = test_db();
        let first = db.create_snapshot("/workspace/doc.md", "content", 50).unwrap();
        assert!(first.is_some());
        let second = db.create_snapshot("/workspace/doc.md", "content", 50).unwrap();
        assert!(second.is_none());
    }

    #[test]
    fn create_snapshot_allows_different_content() {
        let db = test_db();
        let first = db.create_snapshot("/workspace/doc.md", "v1", 50).unwrap();
        let second = db.create_snapshot("/workspace/doc.md", "v2", 50).unwrap();
        assert!(first.is_some());
        assert!(second.is_some());
        assert_ne!(first.unwrap(), second.unwrap());
    }

    #[test]
    fn create_snapshot_prunes_oldest_when_cap_exceeded() {
        let db = test_db();
        for i in 0..5 {
            db.create_snapshot("/workspace/doc.md", &format!("content-{}", i), 3).unwrap();
        }
        let snapshots = db.list_snapshots("/workspace/doc.md", 50).unwrap();
        assert_eq!(snapshots.len(), 3);
    }

    #[test]
    fn list_snapshots_only_returns_matching_file() {
        let db = test_db();
        db.create_snapshot("/workspace/a.md", "content a", 50).unwrap();
        db.create_snapshot("/workspace/b.md", "content b", 50).unwrap();
        let snaps_a = db.list_snapshots("/workspace/a.md", 50).unwrap();
        assert_eq!(snaps_a.len(), 1);
    }

    #[test]
    fn get_snapshot_content_returns_full_content() {
        let db = test_db();
        let long_content = "x".repeat(1000);
        let id = db.create_snapshot("/workspace/doc.md", &long_content, 50).unwrap().unwrap();
        let content = db.get_snapshot_content(id).unwrap();
        assert_eq!(content, long_content);
    }

    #[test]
    fn get_snapshot_content_errors_on_missing_id() {
        let db = test_db();
        assert!(db.get_snapshot_content(9999).is_err());
    }

    #[test]
    fn delete_snapshot_removes_entry() {
        let db = test_db();
        let id = db.create_snapshot("/workspace/doc.md", "to delete", 50).unwrap().unwrap();
        db.delete_snapshot(id).unwrap();
        let snaps = db.list_snapshots("/workspace/doc.md", 50).unwrap();
        assert!(snaps.is_empty());
    }

    #[test]
    fn snapshot_preview_truncated() {
        let db = test_db();
        let long = "a".repeat(500);
        db.create_snapshot("/workspace/doc.md", &long, 50).unwrap();
        let snaps = db.list_snapshots("/workspace/doc.md", 50).unwrap();
        assert!(snaps[0].preview.len() <= 203); // 200 + "..."
    }

    #[test]
    fn snapshot_content_length_correct() {
        let db = test_db();
        let content = "hello world";
        db.create_snapshot("/workspace/doc.md", content, 50).unwrap();
        let snaps = db.list_snapshots("/workspace/doc.md", 50).unwrap();
        assert_eq!(snaps[0].content_length, content.len());
    }

    #[test]
    fn get_embeddings_for_documents_filters_correctly() {
        let db = test_db();
        let doc1 = db.insert_document("Doc1", "paste", None, "content1").unwrap();
        let doc2 = db.insert_document("Doc2", "paste", None, "content2").unwrap();

        let c1 = db.insert_chunk(doc1, "chunk1", 0, None).unwrap();
        let c2 = db.insert_chunk(doc1, "chunk2", 1, None).unwrap();
        let c3 = db.insert_chunk(doc2, "chunk3", 0, None).unwrap();

        db.insert_embedding(c1, &[1.0, 0.0]).unwrap();
        db.insert_embedding(c2, &[0.0, 1.0]).unwrap();
        db.insert_embedding(c3, &[1.0, 1.0]).unwrap();

        // Filter to doc1 only
        let results = db.get_embeddings_for_documents(&[doc1]).unwrap();
        assert_eq!(results.len(), 2);
        let chunk_ids: Vec<i64> = results.iter().map(|(id, _)| *id).collect();
        assert!(chunk_ids.contains(&c1));
        assert!(chunk_ids.contains(&c2));
        assert!(!chunk_ids.contains(&c3));

        // Filter to doc2 only
        let results = db.get_embeddings_for_documents(&[doc2]).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, c3);

        // Filter to both
        let results = db.get_embeddings_for_documents(&[doc1, doc2]).unwrap();
        assert_eq!(results.len(), 3);

        // Empty filter
        let results = db.get_embeddings_for_documents(&[]).unwrap();
        assert_eq!(results.len(), 0);
    }

    // ── ChunkContext tests ──

    #[test]
    fn get_chunk_with_context_returns_neighbours() {
        let db = test_db();
        let doc_id = db.insert_document("Doc", "paste", None, "full content").unwrap();
        let c0 = db.insert_chunk(doc_id, "chunk zero", 0, None).unwrap();
        let c1 = db.insert_chunk(doc_id, "chunk one", 1, None).unwrap();
        let c2 = db.insert_chunk(doc_id, "chunk two", 2, None).unwrap();

        let ctx = db.get_chunk_with_context(c1).unwrap();
        assert_eq!(ctx.chunk_content, "chunk one");
        assert_eq!(ctx.document_title, "Doc");
        assert_eq!(ctx.chunk_index, 1);
        assert_eq!(ctx.total_chunks, 3);
        assert_eq!(ctx.prev_chunk.as_deref(), Some("chunk zero"));
        assert_eq!(ctx.next_chunk.as_deref(), Some("chunk two"));

        // First chunk has no previous
        let ctx = db.get_chunk_with_context(c0).unwrap();
        assert!(ctx.prev_chunk.is_none());
        assert_eq!(ctx.next_chunk.as_deref(), Some("chunk one"));

        // Last chunk has no next
        let ctx = db.get_chunk_with_context(c2).unwrap();
        assert_eq!(ctx.prev_chunk.as_deref(), Some("chunk one"));
        assert!(ctx.next_chunk.is_none());
    }

    #[test]
    fn get_chunk_with_context_single_chunk_document() {
        let db = test_db();
        let doc_id = db.insert_document("Solo", "paste", None, "content").unwrap();
        let c = db.insert_chunk(doc_id, "only chunk", 0, None).unwrap();

        let ctx = db.get_chunk_with_context(c).unwrap();
        assert_eq!(ctx.total_chunks, 1);
        assert!(ctx.prev_chunk.is_none());
        assert!(ctx.next_chunk.is_none());
    }
}
