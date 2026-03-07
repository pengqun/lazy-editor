use crate::knowledge::chunker;
use crate::knowledge::db::{KBDocument, SearchResult};
use crate::knowledge::search;
use crate::AppState;
use std::fs;
use tauri::{AppHandle, Emitter, State};

/// Maximum file size for KB ingestion: 10 MB.
const MAX_INGEST_BYTES: u64 = 10 * 1024 * 1024;

#[tauri::command]
pub async fn ingest_file(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let _ = app.emit("ingest-progress", "Reading file...");

    // File size guard
    let metadata =
        fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
    if metadata.len() > MAX_INGEST_BYTES {
        let size_mb = metadata.len() as f64 / (1024.0 * 1024.0);
        return Err(format!(
            "File too large ({:.1} MB). Maximum allowed size is 10 MB.",
            size_mb
        ));
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    // Dedup check: reject if identical content already exists
    {
        let db = state.db.lock().await;
        if let Ok(Some(existing_title)) = db.find_document_by_content_hash(&content) {
            return Err(format!(
                "Duplicate content: a document with identical content already exists (\"{}\")",
                existing_title
            ));
        }
    }

    let title = std::path::Path::new(&path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Untitled".to_string());

    let _ = app.emit("ingest-progress", "Chunking content...");

    let chunks = chunker::chunk_markdown(&content);

    let _ = app.emit(
        "ingest-progress",
        format!("Embedding {} chunks...", chunks.len()),
    );

    // Extract chunk texts for batch embedding
    let chunk_texts: Vec<String> = chunks.iter().map(|c| c.content.clone()).collect();

    // Generate embeddings — lock embedder only for the embed call
    let embeddings = {
        let embedder_guard = state.embedder.lock().await;
        let embedder = embedder_guard
            .as_ref()
            .ok_or("Embedder not available")?;
        embedder
            .embed_batch(&chunk_texts)
            .map_err(|e| format!("Failed to generate embeddings: {}", e))?
    };

    let _ = app.emit("ingest-progress", "Storing in knowledge base...");

    // Insert document — lock DB briefly
    let doc_id = {
        let db = state.db.lock().await;
        db.insert_document(&title, "file", Some(&path), &content)
            .map_err(|e| format!("Failed to insert document: {}", e))?
    };

    // Insert chunks and embeddings — lock DB per iteration to avoid long holds
    for (i, chunk) in chunks.iter().enumerate() {
        let db = state.db.lock().await;
        let chunk_id = db
            .insert_chunk(
                doc_id,
                &chunk.content,
                chunk.index as i64,
                Some(chunk.approx_tokens as i64),
            )
            .map_err(|e| format!("Failed to insert chunk: {}", e))?;

        db.insert_embedding(chunk_id, &embeddings[i])
            .map_err(|e| format!("Failed to insert embedding: {}", e))?;
    }

    let _ = app.emit("ingest-progress", "Done!");
    Ok(())
}

#[tauri::command]
pub async fn ingest_text(
    title: String,
    text: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Text size guard
    if text.len() as u64 > MAX_INGEST_BYTES {
        let size_mb = text.len() as f64 / (1024.0 * 1024.0);
        return Err(format!(
            "Text too large ({:.1} MB). Maximum allowed size is 10 MB.",
            size_mb
        ));
    }

    // Dedup check
    {
        let db = state.db.lock().await;
        if let Ok(Some(existing_title)) = db.find_document_by_content_hash(&text) {
            return Err(format!(
                "Duplicate content: a document with identical content already exists (\"{}\")",
                existing_title
            ));
        }
    }

    let _ = app.emit("ingest-progress", "Chunking content...");

    let chunks = chunker::chunk_markdown(&text);
    let chunk_texts: Vec<String> = chunks.iter().map(|c| c.content.clone()).collect();

    let _ = app.emit(
        "ingest-progress",
        format!("Embedding {} chunks...", chunks.len()),
    );

    // Generate embeddings — lock embedder only for the embed call
    let embeddings = {
        let embedder_guard = state.embedder.lock().await;
        let embedder = embedder_guard
            .as_ref()
            .ok_or("Embedder not available")?;
        embedder
            .embed_batch(&chunk_texts)
            .map_err(|e| format!("Failed to generate embeddings: {}", e))?
    };

    let _ = app.emit("ingest-progress", "Storing in knowledge base...");

    // Insert document — lock DB briefly
    let doc_id = {
        let db = state.db.lock().await;
        db.insert_document(&title, "paste", None, &text)
            .map_err(|e| format!("Failed to insert document: {}", e))?
    };

    // Insert chunks and embeddings — lock DB per iteration
    for (i, chunk) in chunks.iter().enumerate() {
        let db = state.db.lock().await;
        let chunk_id = db
            .insert_chunk(
                doc_id,
                &chunk.content,
                chunk.index as i64,
                Some(chunk.approx_tokens as i64),
            )
            .map_err(|e| format!("Failed to insert chunk: {}", e))?;

        db.insert_embedding(chunk_id, &embeddings[i])
            .map_err(|e| format!("Failed to insert embedding: {}", e))?;
    }

    let _ = app.emit("ingest-progress", "Done!");
    Ok(())
}

#[tauri::command]
pub async fn list_kb_documents(state: State<'_, AppState>) -> Result<Vec<KBDocument>, String> {
    let db = state.db.lock().await;
    db.list_documents()
        .map_err(|e| format!("Failed to list documents: {}", e))
}

#[tauri::command]
pub async fn search_knowledge_base(
    query: String,
    top_k: usize,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    // Embed the query — lock embedder only for embed call
    let query_embedding = {
        let embedder_guard = state.embedder.lock().await;
        let embedder = embedder_guard
            .as_ref()
            .ok_or("Embedder not available")?;
        embedder
            .embed_text(&query)
            .map_err(|e| format!("Failed to embed query: {}", e))?
    };

    // Search the DB — lock DB only for the search
    let db = state.db.lock().await;
    search::search_with_embedding(&db, &query_embedding, top_k)
        .map_err(|e| format!("Failed to search KB: {}", e))
}

#[tauri::command]
pub async fn remove_kb_document(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.remove_document(id)
        .map_err(|e| format!("Failed to remove document: {}", e))
}
