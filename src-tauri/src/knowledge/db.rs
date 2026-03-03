use anyhow::Result;
use rusqlite::{params, Connection};
use serde::Serialize;
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
            ",
        )?;

        Ok(Database { conn })
    }

    pub fn insert_document(
        &self,
        title: &str,
        source_type: &str,
        source_path: Option<&str>,
        content: &str,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO documents (title, source_type, source_path, content) VALUES (?1, ?2, ?3, ?4)",
            params![title, source_type, source_path, content],
        )?;
        Ok(self.conn.last_insert_rowid())
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
