use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ScanPhase {
    Walking,
    Indexing,
    Writing,
    Done,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub project_id: i64,
    pub phase: ScanPhase,
    pub done: u32,
    pub total: u32,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct AssetsChanged {
    pub project_id: i64,
    pub added: u32,
    pub updated: u32,
    pub removed: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BlendState {
    Idle,
    NoBlender,
    Queued,
    Running,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct BlendStatus {
    pub asset_id: i64,
    pub state: BlendState,
    pub message: Option<String>,
}
