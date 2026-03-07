use crate::knowledge::chunker;
use crate::knowledge::db::{KBDocument, SearchResult};
use crate::knowledge::search;
use crate::AppState;
use std::fs;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn ingest_file(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let _ = app.emit("ingest-progress", "Reading file...");

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;

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

    // Generate embeddings
    let embedder_guard = state.embedder.lock().await;
    let embedder = embedder_guard
        .as_ref()
        .ok_or("Embedder not available")?;
    let embeddings = embedder
        .embed_batch(&chunk_texts)
        .map_err(|e| format!("Failed to generate embeddings: {}", e))?;
    drop(embedder_guard);

    let _ = app.emit("ingest-progress", "Storing in knowledge base...");

    // Store in database
    let db = state.db.lock().await;

    let doc_id = db
        .insert_document(&title, "file", Some(&path), &content)
        .map_err(|e| format!("Failed to insert document: {}", e))?;

    for (i, chunk) in chunks.iter().enumerate() {
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
    let _ = app.emit("ingest-progress", "Chunking content...");

    let chunks = chunker::chunk_markdown(&text);
    let chunk_texts: Vec<String> = chunks.iter().map(|c| c.content.clone()).collect();

    let _ = app.emit(
        "ingest-progress",
        format!("Embedding {} chunks...", chunks.len()),
    );

    let embedder_guard = state.embedder.lock().await;
    let embedder = embedder_guard
        .as_ref()
        .ok_or("Embedder not available")?;
    let embeddings = embedder
        .embed_batch(&chunk_texts)
        .map_err(|e| format!("Failed to generate embeddings: {}", e))?;
    drop(embedder_guard);

    let _ = app.emit("ingest-progress", "Storing in knowledge base...");

    let db = state.db.lock().await;

    let doc_id = db
        .insert_document(&title, "paste", None, &text)
        .map_err(|e| format!("Failed to insert document: {}", e))?;

    for (i, chunk) in chunks.iter().enumerate() {
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
    let db = state.db.lock().await;
    let embedder_guard = state.embedder.lock().await;
    let embedder = embedder_guard
        .as_ref()
        .ok_or("Embedder not available")?;

    search::search(&db, embedder, &query, top_k)
        .map_err(|e| format!("Failed to search KB: {}", e))
}

#[tauri::command]
pub async fn remove_kb_document(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.remove_document(id)
        .map_err(|e| format!("Failed to remove document: {}", e))
}
