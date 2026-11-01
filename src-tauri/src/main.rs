// Prevents additional console window on Windows in release build
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
extern "system" {
    fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, dw_extra_info: usize);
    fn LockWorkStation() -> i32;
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct GpuMetrics {
    gpu_percent: f32,
    vram_used_gb: f32,
    vram_total_gb: f32,
    vram_percent: f32,
    gpu_temp_celsius: f32,
}

impl Default for GpuMetrics {
    fn default() -> Self {
        Self {
            gpu_percent: 0.0,
            vram_used_gb: 0.0,
            vram_total_gb: 0.0,
            vram_percent: 0.0,
            gpu_temp_celsius: 0.0,
        }
    }
}

fn fetch_nvidia_gpu_metrics() -> GpuMetrics {
    let mut cmd = std::process::Command::new("nvidia-smi");
    cmd.args(&[
        "--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total",
        "--format=csv,noheader,nounits",
    ]);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = match cmd.output() {
        Ok(o) if o.status.success() => o,
        _ => return GpuMetrics::default(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = match stdout.lines().next() {
        Some(l) => l.trim(),
        None => return GpuMetrics::default(),
    };

    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    if parts.len() < 5 {
        return GpuMetrics::default();
    }

    let gpu_temp_celsius = parts[1].parse::<f32>().unwrap_or(0.0);
    let gpu_percent = parts[2].parse::<f32>().unwrap_or(0.0).clamp(0.0, 100.0);
    let vram_used_mb = parts[3].parse::<f32>().unwrap_or(0.0);
    let vram_total_mb = parts[4].parse::<f32>().unwrap_or(0.0);

    let vram_used_gb = vram_used_mb / 1024.0;
    let vram_total_gb = vram_total_mb / 1024.0;

    let vram_percent = if vram_total_mb > 0.0 {
        ((vram_used_mb / vram_total_mb) * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };

    GpuMetrics {
        gpu_percent,
        vram_used_gb,
        vram_total_gb,
        vram_percent,
        gpu_temp_celsius,
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct SystemMetrics {
    cpu_percent: f32,
    memory_percent: f32,
    used_ram_gb: f32,
    total_ram_gb: f32,
    uptime_str: String,
    gpu_percent: f32,
    vram_used_gb: f32,
    vram_total_gb: f32,
    vram_percent: f32,
    gpu_temp_celsius: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct InstalledApp {
    name: String,
    version: Option<String>,
    publisher: Option<String>,
    exe_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ActionResult {
    success: bool,
    message: String,
    result: Option<serde_json::Value>,
}

struct AppState {
    sys: Mutex<System>,
}

#[tauri::command]
fn get_system_metrics(state: tauri::State<AppState>) -> Result<SystemMetrics, String> {
    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;

    sys.refresh_cpu();
    sys.refresh_memory();

    let cpu_percent = sys.global_cpu_info().cpu_usage();
    let total_ram_bytes = sys.total_memory();
    let used_ram_bytes = sys.used_memory();

    let total_ram_gb = (total_ram_bytes as f32) / (1024.0 * 1024.0 * 1024.0);
    let used_ram_gb = (used_ram_bytes as f32) / (1024.0 * 1024.0 * 1024.0);

    let memory_percent = if total_ram_gb > 0.0 {
        (used_ram_gb / total_ram_gb) * 100.0
    } else {
        0.0
    };

    let uptime_secs = System::uptime();
    let days = uptime_secs / 86400;
    let hours = (uptime_secs % 86400) / 3600;
    let mins = (uptime_secs % 3600) / 60;
    let uptime_str = if days > 0 {
        format!("{}d {}h {}m", days, hours, mins)
    } else if hours > 0 {
        format!("{}h {}m", hours, mins)
    } else {
        format!("{}m", mins)
    };

    let gpu_metrics = fetch_nvidia_gpu_metrics();

    Ok(SystemMetrics {
        cpu_percent,
        memory_percent,
        used_ram_gb,
        total_ram_gb,
        uptime_str,
        gpu_percent: gpu_metrics.gpu_percent,
        vram_used_gb: gpu_metrics.vram_used_gb,
        vram_total_gb: gpu_metrics.vram_total_gb,
        vram_percent: gpu_metrics.vram_percent,
        gpu_temp_celsius: gpu_metrics.gpu_temp_celsius,
    })
}

#[tauri::command]
fn scan_installed_apps() -> Result<Vec<InstalledApp>, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let mut apps = Vec::new();
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        let paths = [
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
            "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        ];

        for &path_str in &paths {
            if let Ok(key) = hklm.open_subkey(path_str) {
                for name in key.enum_keys().filter_map(|x| x.ok()) {
                    if let Ok(app_key) = key.open_subkey(&name) {
                        let display_name: Result<String, _> = app_key.get_value("DisplayName");
                        if let Ok(name) = display_name {
                            if !name.trim().is_empty() {
                                let version: Option<String> = app_key.get_value("DisplayVersion").ok();
                                let publisher: Option<String> = app_key.get_value("Publisher").ok();
                                let exe_path: Option<String> = app_key.get_value("DisplayIcon").ok();

                                apps.push(InstalledApp {
                                    name,
                                    version,
                                    publisher,
                                    exe_path,
                                });
                            }
                        }
                    }
                }
            }
        }

        if let Ok(key) = hkcu.open_subkey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall") {
            for name in key.enum_keys().filter_map(|x| x.ok()) {
                if let Ok(app_key) = key.open_subkey(&name) {
                    let display_name: Result<String, _> = app_key.get_value("DisplayName");
                    if let Ok(name) = display_name {
                        if !name.trim().is_empty() {
                            let version: Option<String> = app_key.get_value("DisplayVersion").ok();
                            let publisher: Option<String> = app_key.get_value("Publisher").ok();
                            let exe_path: Option<String> = app_key.get_value("DisplayIcon").ok();

                            apps.push(InstalledApp {
                                name,
                                version,
                                publisher,
                                exe_path,
                            });
                        }
                    }
                }
            }
        }

        apps.sort_by(|a, b| a.name.cmp(&b.name));
        apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));

        Ok(apps)
    }

    #[cfg(not(target_os = "windows"))]
    Ok(Vec::new())
}

/// Provides the genuine desktop bootstrap token to the Tauri webview via secure IPC
#[tauri::command]
fn get_desktop_bootstrap_token() -> Result<String, String> {
    if let Ok(env_tok) = std::env::var("SUSI_BOOTSTRAP_SECRET") {
        if !env_tok.is_empty() {
            return Ok(env_tok);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let token_path = std::path::Path::new(&local_app_data).join(".susi").join("desktop_bootstrap.token");
            if token_path.exists() {
                if let Ok(tok) = std::fs::read_to_string(token_path) {
                    let trimmed = tok.trim().to_string();
                    if !trimmed.is_empty() {
                        return Ok(trimmed);
                    }
                }
            }
        }
        if let Ok(home) = std::env::var("USERPROFILE") {
            let token_path = std::path::Path::new(&home).join(".susi").join("desktop_bootstrap.token");
            if token_path.exists() {
                if let Ok(tok) = std::fs::read_to_string(token_path) {
                    let trimmed = tok.trim().to_string();
                    if !trimmed.is_empty() {
                        return Ok(trimmed);
                    }
                }
            }
        }
    }

    Err("Desktop bootstrap token not found in protected storage".to_string())
}

/// Windows Credential Manager: Secure Storage (Accepts both user and key for complete resilience)
#[tauri::command]
fn save_credential_secure(
    service: String,
    user: Option<String>,
    key: Option<String>,
    secret: String,
) -> Result<bool, String> {
    let target_user = user
        .or(key)
        .ok_or_else(|| "Missing required 'user' or 'key' parameter".to_string())?;
    let entry = keyring::Entry::new(&service, &target_user).map_err(|e| e.to_string())?;
    entry.set_password(&secret).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Windows Credential Manager: Secure Retrieval
#[tauri::command]
fn get_credential_secure(
    service: String,
    user: Option<String>,
    key: Option<String>,
) -> Result<Option<String>, String> {
    let target_user = user
        .or(key)
        .ok_or_else(|| "Missing required 'user' or 'key' parameter".to_string())?;
    let entry = keyring::Entry::new(&service, &target_user).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Windows Credential Manager: Secure Deletion
#[tauri::command]
fn delete_credential_secure(
    service: String,
    user: Option<String>,
    key: Option<String>,
) -> Result<bool, String> {
    let target_user = user
        .or(key)
        .ok_or_else(|| "Missing required 'user' or 'key' parameter".to_string())?;
    let entry = keyring::Entry::new(&service, &target_user).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

/// Executes a verified native PC action with ZERO shell script dependencies
#[tauri::command]
fn execute_pc_action(
    action_type: String,
    target: Option<String>,
    payload: Option<serde_json::Value>,
) -> Result<ActionResult, String> {
    let act = action_type.to_uppercase();
    let pl = payload.unwrap_or(serde_json::json!({}));

    match act.as_str() {
        "OPEN_APP" => {
            let app = target
                .or_else(|| pl.get("appName").and_then(|v| v.as_str()).map(String::from))
                .or_else(|| pl.get("target").and_then(|v| v.as_str()).map(String::from))
                .unwrap_or_else(|| "chrome".to_string());

            #[cfg(target_os = "windows")]
            {
                let app_lower = app.to_lowercase();
                let binary: &str = match app_lower.as_str() {
                    "chrome" | "google chrome" => "chrome.exe",
                    "notepad" => "notepad.exe",
                    "calc" | "calculator" => "calc.exe",
                    "code" | "vscode" | "vs code" => "code.cmd",
                    "paint" | "mspaint" => "mspaint.exe",
                    "edge" => "msedge.exe",
                    "settings" => "ms-settings:",
                    "spotify" => "spotify:",
                    "discord" => "discord:",
                    _ => &app,
                };

                let is_protocol = binary.contains(':') && !binary.contains('\\');
                let child = if is_protocol {
                    // Protocol associations launch via native explorer.exe directly (zero cmd.exe)
                    let mut cmd = std::process::Command::new("explorer.exe");
                    cmd.arg(binary);
                    cmd.spawn().map_err(|e| e.to_string())?
                } else {
                    // Executables spawn directly via native OS CreateProcessW
                    let mut cmd = std::process::Command::new(binary);
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    cmd.spawn().map_err(|e| e.to_string())?
                };

                let pid = child.id();

                Ok(ActionResult {
                    success: true,
                    message: format!("Successfully launched \"{}\" natively.", app),
                    result: Some(serde_json::json!({ "appName": app, "binary": binary, "pid": pid })),
                })
            }
            #[cfg(not(target_os = "windows"))]
            Ok(ActionResult {
                success: false,
                message: "Unsupported on this OS".to_string(),
                result: None,
            })
        }
        "CLOSE_APP" => {
            let app = target
                .or_else(|| pl.get("appName").and_then(|v| v.as_str()).map(String::from))
                .or_else(|| pl.get("target").and_then(|v| v.as_str()).map(String::from))
                .unwrap_or_default();

            if app.is_empty() {
                return Ok(ActionResult {
                    success: false,
                    message: "appName is required to close application".to_string(),
                    result: None,
                });
            }

            let proc_name = if !app.ends_with(".exe") {
                format!("{}.exe", app)
            } else {
                app.clone()
            };

            // Block critical system processes from being terminated
            let critical = [
                "csrss.exe", "lsass.exe", "explorer.exe", "services.exe",
                "smss.exe", "wininit.exe", "taskmgr.exe", "svchost.exe",
            ];
            if critical.iter().any(|c| c.eq_ignore_ascii_case(&proc_name)) {
                return Ok(ActionResult {
                    success: false,
                    message: format!("Terminating critical process \"{}\" is blocked.", proc_name),
                    result: None,
                });
            }

            #[cfg(target_os = "windows")]
            {
                // Native Win32 Process Termination (Zero taskkill.exe)
                let mut sys = System::new_all();
                sys.refresh_processes();

                let mut terminated_count = 0;
                for (_pid, process) in sys.processes() {
                    if process.name().eq_ignore_ascii_case(&proc_name) {
                        if process.kill() {
                            terminated_count += 1;
                        }
                    }
                }

                if terminated_count > 0 {
                    Ok(ActionResult {
                        success: true,
                        message: format!("Closed application process \"{}\" ({} instance(s) terminated) via native Win32 API.", proc_name, terminated_count),
                        result: Some(serde_json::json!({ "process": proc_name, "terminatedCount": terminated_count })),
                    })
                } else {
                    Ok(ActionResult {
                        success: false,
                        message: format!("Process \"{}\" not found or already closed.", proc_name),
                        result: None,
                    })
                }
            }
            #[cfg(not(target_os = "windows"))]
            Ok(ActionResult {
                success: false,
                message: "Unsupported on this OS".to_string(),
                result: None,
            })
        }
        "CLIPBOARD_ACTION" => {
            let action = pl.get("action").and_then(|v| v.as_str()).unwrap_or("read").to_lowercase();
            // Native Win32 Clipboard via arboard crate (Zero PowerShell)
            match arboard::Clipboard::new() {
                Ok(mut clipboard) => {
                    if action == "write" {
                        let text = pl.get("text").and_then(|v| v.as_str()).unwrap_or_default();
                        clipboard.set_text(text).map_err(|e| e.to_string())?;
                        Ok(ActionResult {
                            success: true,
                            message: "Text safely copied to Windows clipboard natively via Win32 API.".to_string(),
                            result: Some(serde_json::json!({ "copied": true })),
                        })
                    } else {
                        let content = clipboard.get_text().unwrap_or_default();
                        Ok(ActionResult {
                            success: true,
                            message: format!("Clipboard content retrieved natively ({} chars).", content.len()),
                            result: Some(serde_json::json!({ "content": content })),
                        })
                    }
                }
                Err(e) => Ok(ActionResult {
                    success: false,
                    message: format!("Failed to access native clipboard: {}", e),
                    result: None,
                }),
            }
        }
        "OPEN_URL" => {
            let url = pl.get("url").and_then(|v| v.as_str()).unwrap_or_default();
            if !url.starts_with("http://") && !url.starts_with("https://") {
                return Ok(ActionResult {
                    success: false,
                    message: "Only http and https URLs are allowed.".to_string(),
                    result: None,
                });
            }

            #[cfg(target_os = "windows")]
            {
                // Native URL launcher via explorer.exe (Zero cmd.exe)
                let mut cmd = std::process::Command::new("explorer.exe");
                cmd.arg(url);
                cmd.spawn().map_err(|e| e.to_string())?;

                Ok(ActionResult {
                    success: true,
                    message: format!("Opened URL \"{}\" natively.", url),
                    result: Some(serde_json::json!({ "url": url })),
                })
            }
            #[cfg(not(target_os = "windows"))]
            Ok(ActionResult {
                success: false,
                message: "Unsupported on this OS".to_string(),
                result: None,
            })
        }
        "VOLUME_CONTROL" => {
            let action = pl.get("action").and_then(|v| v.as_str()).unwrap_or("mute").to_lowercase();
            #[cfg(target_os = "windows")]
            {
                // Native Win32 Multimedia Keybd Event Emulation (Zero PowerShell)
                unsafe {
                    match action.as_str() {
                        "up" | "increase" => {
                            for _ in 0..4 {
                                keybd_event(0xAF, 0, 0, 0); // VK_VOLUME_UP down
                                keybd_event(0xAF, 0, 2, 0); // VK_VOLUME_UP up
                            }
                        }
                        "down" | "decrease" => {
                            for _ in 0..4 {
                                keybd_event(0xAE, 0, 0, 0); // VK_VOLUME_DOWN down
                                keybd_event(0xAE, 0, 2, 0); // VK_VOLUME_DOWN up
                            }
                        }
                        _ => {
                            keybd_event(0xAD, 0, 0, 0); // VK_VOLUME_MUTE down
                            keybd_event(0xAD, 0, 2, 0); // VK_VOLUME_MUTE up
                        }
                    }
                }

                Ok(ActionResult {
                    success: true,
                    message: format!("Volume action \"{}\" executed natively via Win32 keybd_event.", action),
                    result: Some(serde_json::json!({ "action": action })),
                })
            }
            #[cfg(not(target_os = "windows"))]
            Ok(ActionResult {
                success: false,
                message: "Unsupported on this OS".to_string(),
                result: None,
            })
        }
        "MEDIA_CONTROL" => {
            let action = pl.get("action").and_then(|v| v.as_str()).unwrap_or("play_pause").to_lowercase();
            #[cfg(target_os = "windows")]
            {
                // Native Win32 Media Keybd Event Emulation (Zero PowerShell)
                let vk: u8 = if action.contains("next") {
                    0xB0 // VK_MEDIA_NEXT_TRACK
                } else if action.contains("prev") {
                    0xB1 // VK_MEDIA_PREV_TRACK
                } else {
                    0xB3 // VK_MEDIA_PLAY_PAUSE
                };

                unsafe {
                    keybd_event(vk, 0, 0, 0);
                    keybd_event(vk, 0, 2, 0);
                }

                Ok(ActionResult {
                    success: true,
                    message: format!("Media control \"{}\" executed natively via Win32 keybd_event.", action),
                    result: Some(serde_json::json!({ "action": action })),
                })
            }
            #[cfg(not(target_os = "windows"))]
            Ok(ActionResult {
                success: false,
                message: "Unsupported on this OS".to_string(),
                result: None,
            })
        }
        "WINDOW_CONTROL" => {
            let action = pl.get("action").and_then(|v| v.as_str()).unwrap_or("show_desktop").to_lowercase();
            #[cfg(target_os = "windows")]
            {
                // Native Win32 Desktop Toggle (Win + D) Emulation (Zero PowerShell)
                unsafe {
                    keybd_event(0x5B, 0, 0, 0); // VK_LWIN down
                    keybd_event(0x44, 0, 0, 0); // 'D' down
                    keybd_event(0x44, 0, 2, 0); // 'D' up
                    keybd_event(0x5B, 0, 2, 0); // VK_LWIN up
                }

                Ok(ActionResult {
                    success: true,
                    message: format!("Window control \"{}\" executed natively via Win32 shortcut.", action),
                    result: Some(serde_json::json!({ "action": action })),
                })
            }
            #[cfg(not(target_os = "windows"))]
            Ok(ActionResult {
                success: false,
                message: "Unsupported on this OS".to_string(),
                result: None,
            })
        }
        "LOCK" | "POWER_CONTROL" => {
            let pwr = pl.get("action").and_then(|v| v.as_str()).unwrap_or("lock").to_lowercase();
            #[cfg(target_os = "windows")]
            {
                if pwr == "lock" || act == "LOCK" {
                    // Native Win32 LockWorkStation API (Zero rundll32.exe)
                    unsafe {
                        LockWorkStation();
                    }
                } else {
                    return Ok(ActionResult {
                        success: false,
                        message: format!("Power action \"{}\" is not natively supported for safety.", pwr),
                        result: None,
                    });
                }

                Ok(ActionResult {
                    success: true,
                    message: format!("Power action \"{}\" executed natively via Win32 API.", pwr),
                    result: Some(serde_json::json!({ "action": pwr })),
                })
            }
            #[cfg(not(target_os = "windows"))]
            Ok(ActionResult {
                success: false,
                message: "Unsupported on this OS".to_string(),
                result: None,
            })
        }
        "OPEN_SPECIAL_FOLDER" => {
            let folder = pl.get("folder").and_then(|v| v.as_str()).unwrap_or("downloads").to_lowercase();
            #[cfg(target_os = "windows")]
            {
                let target_shell = match folder.as_str() {
                    "desktop" => "shell:Desktop",
                    "documents" | "doc" => "shell:Personal",
                    "pictures" => "shell:My Pictures",
                    "recycle" | "recycle_bin" => "shell:RecycleBinFolder",
                    _ => "shell:Downloads",
                };

                let mut cmd = std::process::Command::new("explorer.exe");
                cmd.arg(target_shell);
                cmd.spawn().map_err(|e| e.to_string())?;

                Ok(ActionResult {
                    success: true,
                    message: format!("Opened special folder \"{}\" natively.", folder),
                    result: Some(serde_json::json!({ "folder": folder })),
                })
            }
            #[cfg(not(target_os = "windows"))]
            Ok(ActionResult {
                success: false,
                message: "Unsupported on this OS".to_string(),
                result: None,
            })
        }
        _ => Ok(ActionResult {
            success: false,
            message: format!("Action \"{}\" is not natively supported.", action_type),
            result: None,
        }),
    }
}

fn main() {
    let sys = System::new_with_specifics(
        RefreshKind::new()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );

    tauri::Builder::default()
        .manage(AppState {
            sys: Mutex::new(sys),
        })
        .invoke_handler(tauri::generate_handler![
            get_system_metrics,
            scan_installed_apps,
            get_desktop_bootstrap_token,
            execute_pc_action,
            save_credential_secure,
            get_credential_secure,
            delete_credential_secure
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
