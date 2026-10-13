mod commands;
mod error;
mod events;
mod formats;
mod index;
mod protocol;
mod scanner;
mod settings;
mod state;
mod thumbs;
mod watcher;

use std::collections::HashMap;
use std::sync::{Mutex, RwLock};

use tauri::http::{Response, StatusCode};
use tauri::Manager;
use tauri_specta::{collect_commands, collect_events, Builder, ErrorHandlingMode};

use crate::commands::{assets, projects, settings as settings_cmd, viewer};
use crate::formats::blend::BlendQueue;
use crate::index::Db;
use crate::settings::Settings;
use crate::state::AppState;

pub fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            projects::list_projects,
            projects::add_project,
            projects::remove_project,
            projects::update_project,
            projects::rescan_project,
            projects::set_project_cover,
            projects::scanning_projects,
            assets::query_assets,
            assets::get_asset,
            assets::list_folders,
            assets::kind_counts,
            assets::list_tags,
            assets::set_favorite,
            assets::add_tag,
            assets::remove_tag,
            assets::reveal_asset,
            assets::open_asset,
            assets::copy_image,
            viewer::aseprite_info,
            viewer::sheet_info,
            viewer::save_sheet,
            viewer::clear_sheet,
            viewer::save_model_thumb,
            viewer::blend_status,
            viewer::request_blend_export,
            settings_cmd::get_settings,
            settings_cmd::save_settings,
            settings_cmd::blender_info,
            settings_cmd::cache_info,
            settings_cmd::clear_cache,
        ])
        .events(collect_events![
            events::ScanProgress,
            events::AssetsChanged,
            events::BlendStatus
        ])
        .error_handling(ErrorHandlingMode::Throw)
        // Asset ids, byte sizes and millisecond timestamps all fit well inside 2^53.
        .dangerously_cast_bigints_to_number()
}

pub fn export_bindings(builder: &Builder<tauri::Wry>) {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/bindings.ts");
    builder
        .export(
            specta_typescript::Typescript::default().header("// @ts-nocheck\n/* eslint-disable */"),
            path,
        )
        .expect("failed to export TypeScript bindings");
}

pub fn run() {
    let builder = specta_builder();
    if std::env::args().any(|a| a == "--export-bindings") {
        export_bindings(&builder);
        return;
    }
    #[cfg(debug_assertions)]
    export_bindings(&builder);

    tauri::Builder::default()
        // Must be registered first: a second launch would share the index, watchers and Blender queue.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(builder.invoke_handler())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            if app.try_state::<AppState>().is_none() {
                let resp = Response::builder()
                    .status(StatusCode::SERVICE_UNAVAILABLE)
                    .body(Vec::new())
                    .expect("valid response");
                responder.respond(resp);
                return;
            }
            if protocol::is_heavy(&request) {
                let worker = app.clone();
                app.state::<AppState>()
                    .thumb_pool
                    .spawn(move || responder.respond(protocol::handle(&worker, &request)));
            } else {
                tauri::async_runtime::spawn_blocking(move || {
                    responder.respond(protocol::handle(&app, &request))
                });
            }
        })
        .setup(move |app| {
            builder.mount_events(app);
            let handle = app.handle().clone();
            let data_dir = app.path().app_data_dir()?;
            let cache_dir = app.path().app_cache_dir()?;
            std::fs::create_dir_all(&cache_dir)?;

            let threads = std::thread::available_parallelism()
                .map(|n| n.get().saturating_sub(1))
                .unwrap_or(4)
                .max(2);
            let thumb_pool = rayon::ThreadPoolBuilder::new()
                .num_threads(threads)
                .thread_name(|i| format!("thumb-{i}"))
                .build()?;

            let db = Db::open(&data_dir.join("index.sqlite"))?;
            thumbs::cache::invalidate_stale_renders(&*db.get()?, &cache_dir)?;

            app.manage(AppState {
                db,
                cache_dir,
                settings: RwLock::new(Settings::load(&handle)),
                scans: Mutex::new(HashMap::new()),
                thumb_pool,
                blend: BlendQueue::new(),
                watcher: Mutex::new(None),
            });
            commands::sync_watcher(&handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ArtDirector");
}
