use crate::knowledge::chunker;
use crate::knowledge::db::{ChunkContext, IntegrityScanSnapshot, KBDocument, SearchResult};
use crate::knowledge::search;
use crate::AppState;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter, State};

/// Maximum file size for KB ingestion: 10 MB.
const MAX_INGEST_BYTES: u64 = 10 * 1024 * 1024;

/// Maximum number of integrity scan snapshots to keep in history.
const MAX_SCAN_HISTORY: i64 = 20;

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
///
/// Returns structured error codes for frontend classification:
/// - `source-not-found:<documentId>` — source document no longer exists
/// - `chunk-not-found:<chunkId>` — no chunk with this ID exists
/// - `chunk-error:<details>` — unexpected database error
#[tauri::command]
pub async fn get_kb_chunk(
    #[allow(non_snake_case)] chunkId: i64,
    #[allow(non_snake_case)] documentId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<ChunkContext, String> {
    let db = state.db.lock().await;

    // If caller provided a documentId, check document existence first.
    // This distinguishes "source removed" from "chunk missing" even with CASCADE DELETE.
    if let Some(doc_id) = documentId {
        match db.document_exists(doc_id) {
            Ok(false) => return Err(format!("source-not-found:{}", doc_id)),
            Err(e) => return Err(format!("chunk-error:{}", e)),
            Ok(true) => {} // document exists, proceed to chunk lookup
        }
    }

    db.get_chunk_with_context(chunkId).map_err(|e| {
        let msg = e.to_string();
        if msg.contains("no rows") || msg.contains("No rows") || msg.contains("QueryReturnedNoRows") {
            format!("chunk-not-found:{}", chunkId)
        } else {
            format!("chunk-error:{}", msg)
        }
    })
}

// ── KB Integrity ──

#[derive(Debug, Serialize, Clone)]
pub struct IntegrityEntry {
    pub id: i64,
    pub title: String,
    #[serde(rename = "sourcePath")]
    pub source_path: String,
    pub status: String, // "healthy" | "missing" | "moved"
    /// Suggested new path if status is "moved"
    #[serde(rename = "movedCandidate")]
    pub moved_candidate: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct IntegrityReport {
    pub entries: Vec<IntegrityEntry>,
    pub healthy: usize,
    pub missing: usize,
    pub moved: usize,
}

fn file_content_hash(path: &Path) -> Option<String> {
    let content = fs::read(path).ok()?;
    let mut hasher = Sha256::new();
    hasher.update(&content);
    Some(format!("{:x}", hasher.finalize()))
}

/// Walk `dir` recursively and collect file paths (up to `limit`).
fn walk_files(dir: &Path, limit: usize) -> Vec<std::path::PathBuf> {
    let mut result = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let entries = match fs::read_dir(&d) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                // Skip hidden directories
                if p.file_name().map_or(false, |n| n.to_string_lossy().starts_with('.')) {
                    continue;
                }
                stack.push(p);
            } else {
                result.push(p);
                if result.len() >= limit {
                    return result;
                }
            }
        }
    }
    result
}

/// Scan all file-sourced KB documents and classify their source health.
/// Uses workspace path (if set) to search for moved-candidates by filename match or content hash.
#[tauri::command]
pub async fn check_kb_integrity(
    state: State<'_, AppState>,
) -> Result<IntegrityReport, String> {
    let db = state.db.lock().await;
    let file_docs = db
        .get_file_documents()
        .map_err(|e| format!("Failed to read documents: {}", e))?;

    let workspace = state.workspace_path.lock().await.clone();

    // Pre-scan workspace files for move detection (only when there are stale docs)
    let workspace_files: Vec<std::path::PathBuf> = if let Some(ref ws) = workspace {
        walk_files(Path::new(ws), 10_000)
    } else {
        Vec::new()
    };

    let mut entries = Vec::new();
    let mut healthy = 0usize;
    let mut missing = 0usize;
    let mut moved = 0usize;

    for (id, title, source_path, content_hash) in &file_docs {
        let p = Path::new(source_path);
        if p.exists() {
            entries.push(IntegrityEntry {
                id: *id,
                title: title.clone(),
                source_path: source_path.clone(),
                status: "healthy".to_string(),
                moved_candidate: None,
            });
            healthy += 1;
            continue;
        }

        // File is missing — try to find a moved candidate
        let original_name = p.file_name().map(|n| n.to_string_lossy().to_string());
        let mut candidate: Option<String> = None;

        // Strategy 1: filename match in workspace
        if let Some(ref name) = original_name {
            for wf in &workspace_files {
                if wf.file_name().map(|n| n.to_string_lossy().to_string()).as_deref() == Some(name)
                    && wf.as_path() != p
                {
                    // If we have a content hash, verify it matches
                    if !content_hash.is_empty() {
                        if let Some(wf_hash) = file_content_hash(wf) {
                            if wf_hash == *content_hash {
                                candidate = Some(wf.to_string_lossy().to_string());
                                break;
                            }
                        }
                    } else {
                        // No hash to verify — accept filename match
                        candidate = Some(wf.to_string_lossy().to_string());
                        break;
                    }
                }
            }
        }

        // Strategy 2: content hash match across workspace (if no filename match found)
        if candidate.is_none() && !content_hash.is_empty() {
            for wf in &workspace_files {
                if let Some(wf_hash) = file_content_hash(wf) {
                    if wf_hash == *content_hash {
                        candidate = Some(wf.to_string_lossy().to_string());
                        break;
                    }
                }
            }
        }

        if candidate.is_some() {
            entries.push(IntegrityEntry {
                id: *id,
                title: title.clone(),
                source_path: source_path.clone(),
                status: "moved".to_string(),
                moved_candidate: candidate,
            });
            moved += 1;
        } else {
            entries.push(IntegrityEntry {
                id: *id,
                title: title.clone(),
                source_path: source_path.clone(),
                status: "missing".to_string(),
                moved_candidate: None,
            });
            missing += 1;
        }
    }

    // Persist scan snapshot for history tracking (best-effort, don't fail the scan)
    let _ = db.save_integrity_scan(
        (healthy + missing + moved) as i64,
        healthy as i64,
        missing as i64,
        moved as i64,
        None,
        MAX_SCAN_HISTORY,
    );

    Ok(IntegrityReport {
        entries,
        healthy,
        missing,
        moved,
    })
}

/// Update the source_path for a KB document (relink after file move/rename).
#[tauri::command]
pub async fn relink_kb_document(
    id: i64,
    #[allow(non_snake_case)] newPath: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Verify the new path actually exists
    if !Path::new(&newPath).exists() {
        return Err(format!("Target path does not exist: {}", newPath));
    }
    let db = state.db.lock().await;
    db.update_document_source_path(id, &newPath)
        .map_err(|e| format!("Failed to relink document: {}", e))
}

/// Retrieve recent integrity scan history snapshots.
#[tauri::command]
pub async fn get_integrity_history(
    state: State<'_, AppState>,
) -> Result<Vec<IntegrityScanSnapshot>, String> {
    let db = state.db.lock().await;
    db.get_integrity_history(MAX_SCAN_HISTORY)
        .map_err(|e| format!("Failed to load integrity history: {}", e))
}
