use anyhow::Result;
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
    pub score: f64,
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

    pub fn get_chunk_with_document(&self, chunk_id: i64) -> Result<(String, String, i64)> {
        let mut stmt = self.conn.prepare(
            "SELECT c.content, d.title, d.id
             FROM chunks c
             JOIN documents d ON c.document_id = d.id
             WHERE c.id = ?1",
        )?;

        let result = stmt.query_row(params![chunk_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;

        Ok(result)
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

        let (content, title, returned_doc_id) = db.get_chunk_with_document(chunk_id).unwrap();
        assert_eq!(content, "chunk content");
        assert_eq!(title, "My Doc");
        assert_eq!(returned_doc_id, doc_id);
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
}
