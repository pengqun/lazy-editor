use crate::knowledge::chunker;
use crate::knowledge::db::{ChunkContext, KBDocument, SearchResult};
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

    let chunk_contents: Vec<String> = chunks.iter().map(|c| c.content.clone()).collect();
    let token_counts: Vec<i64> = chunks.iter().map(|c| c.approx_tokens as i64).collect();

    // Atomic insert: document + chunks + embeddings in one transaction
    {
        let mut db = state.db.lock().await;
        db.insert_document_with_embeddings(
            &title,
            "file",
            Some(&path),
            &content,
            &chunk_contents,
            &token_counts,
            &embeddings,
        )
        .map_err(|e| format!("Failed to store knowledge: {}", e))?;
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

    let chunk_contents: Vec<String> = chunks.iter().map(|c| c.content.clone()).collect();
    let token_counts: Vec<i64> = chunks.iter().map(|c| c.approx_tokens as i64).collect();

    // Atomic insert: document + chunks + embeddings in one transaction
    {
        let mut db = state.db.lock().await;
        db.insert_document_with_embeddings(
            &title,
            "paste",
            None,
            &text,
            &chunk_contents,
            &token_counts,
            &embeddings,
        )
        .map_err(|e| format!("Failed to store knowledge: {}", e))?;
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

/// Retrieve a KB chunk with surrounding context for source recall.
#[tauri::command]
pub async fn get_kb_chunk(
    #[allow(non_snake_case)] chunkId: i64,
    state: State<'_, AppState>,
) -> Result<ChunkContext, String> {
    let db = state.db.lock().await;
    db.get_chunk_with_context(chunkId)
        .map_err(|e| format!("Failed to get chunk: {}", e))
}
