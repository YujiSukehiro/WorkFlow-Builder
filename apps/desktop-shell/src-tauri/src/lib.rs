use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct SidecarState(Mutex<Option<CommandChild>>);

fn is_engine_listening() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:8420".parse().expect("valid socket addr"),
        Duration::from_millis(250),
    )
    .is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            if !is_engine_listening() {
                if let Ok(sidecar_cmd) = app.shell().sidecar("flowpulse-host-engine") {
                    let cmd = sidecar_cmd
                        .env("OLLAMA_FLASH_ATTENTION", "1")
                        .env("OLLAMA_KEEP_ALIVE", "-1")
                        .env("FLOWPULSE_OLLAMA_MODEL", "qwen3.5:35b-a3b");
                    if let Ok((_rx, child)) = cmd.spawn() {
                        let state = app.state::<SidecarState>();
                        if let Ok(mut guard) = state.0.lock() {
                            *guard = Some(child);
                        };
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building FlowPulse Tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            let state = app_handle.state::<SidecarState>();
            if let Ok(mut guard) = state.0.lock() {
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            };
        }
    });
}
