use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use ignore::{WalkBuilder, WalkState};

use super::classify;

pub struct WalkResult {
    pub files: Vec<PathBuf>,
    /// Every `.json` file seen, used to pair spritesheets with their frame data.
    pub json: HashSet<PathBuf>,
}

pub fn is_excluded_name(name: &str, excludes: &HashSet<String>) -> bool {
    excludes.contains(&name.to_ascii_lowercase())
}

pub fn exclude_set(excludes: &[String]) -> HashSet<String> {
    excludes
        .iter()
        .map(|s| s.trim().trim_matches('/').to_ascii_lowercase())
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn walk(root: &Path, excludes: &[String], respect_gitignore: bool) -> WalkResult {
    let excludes = exclude_set(excludes);
    let files = Mutex::new(Vec::new());
    let json = Mutex::new(HashSet::new());

    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(true)
        .parents(false)
        .follow_links(false)
        .require_git(false)
        .git_global(false)
        .git_ignore(respect_gitignore)
        .git_exclude(respect_gitignore)
        .ignore(respect_gitignore)
        .filter_entry(move |e| {
            if e.depth() == 0 || !e.file_type().is_some_and(|t| t.is_dir()) {
                return true;
            }
            !is_excluded_name(&e.file_name().to_string_lossy(), &excludes)
        });

    builder.build_parallel().run(|| {
        Box::new(|entry| {
            let Ok(entry) = entry else {
                return WalkState::Continue;
            };
            if !entry.file_type().is_some_and(|t| t.is_file()) {
                return WalkState::Continue;
            }
            let path = entry.path();
            match classify::ext_of(path).as_deref() {
                Some("json") => {
                    json.lock().unwrap().insert(path.to_path_buf());
                }
                Some(_) if classify::is_supported(path) => {
                    files.lock().unwrap().push(path.to_path_buf());
                }
                _ => {}
            }
            WalkState::Continue
        })
    });

    WalkResult {
        files: files.into_inner().unwrap(),
        json: json.into_inner().unwrap(),
    }
}
