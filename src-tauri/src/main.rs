// Prevents additional console window on Windows in release build
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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
    sys.refresh_cpu_specifics(CpuRefreshKind::everything());
    sys.refresh_memory();

    let cpus = sys.cpus();
    let cpu_percent = if !cpus.is_empty() {
        let total: f32 = cpus.iter().map(|c| c.cpu_usage()).sum();
        (total / cpus.len() as f32).clamp(0.0, 100.0)
    } else {
        sys.global_cpu_info().cpu_usage().clamp(0.0, 100.0)
    };

    let total_ram_bytes = sys.total_memory();
    let used_ram_bytes = sys.used_memory();

    let memory_percent = if total_ram_bytes > 0 {
        ((used_ram_bytes as f32 / total_ram_bytes as f32) * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };

    let uptime_secs = System::uptime();
    let days = uptime_secs / 86400;
    let hours = (uptime_secs % 86400) / 3600;
    let mins = (uptime_secs % 3600) / 60;

    let uptime_str = if days > 0 {
        format!("{}d {}h", days, hours)
    } else if hours > 0 {
        format!("{}h {}m", hours, mins)
    } else {
        format!("{}m", mins)
    };

    let gpu_metrics = fetch_nvidia_gpu_metrics();

    Ok(SystemMetrics {
        cpu_percent,
        memory_percent,
        used_ram_gb: used_ram_bytes as f32 / 1024.0 / 1024.0 / 1024.0,
        total_ram_gb: total_ram_bytes as f32 / 1024.0 / 1024.0 / 1024.0,
        uptime_str,
        gpu_percent: gpu_metrics.gpu_percent,
        vram_used_gb: gpu_metrics.vram_used_gb,
        vram_total_gb: gpu_metrics.vram_total_gb,
        vram_percent: gpu_metrics.vram_percent,
        gpu_temp_celsius: gpu_metrics.gpu_temp_celsius,
    })
}

/// Scans installed Windows applications from the Registry
#[tauri::command]
fn scan_installed_apps() -> Result<Vec<InstalledApp>, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let mut apps: Vec<InstalledApp> = Vec::new();
        let subkeys = [
            (HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
            (HKEY_LOCAL_MACHINE, r"Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
            (HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
        ];

        for (hive, path) in subkeys {
            let root = RegKey::predef(hive);
            if let Ok(key) = root.open_subkey(path) {
                for name_res in key.enum_keys().map(|x| x.unwrap_or_default()) {
                    if let Ok(subkey) = key.open_subkey(&name_res) {
                        let display_name: String = subkey.get_value("DisplayName").unwrap_or_default();
                        if !display_name.trim().is_empty() {
                            let version: Option<String> = subkey.get_value("DisplayVersion").ok();
                            let publisher: Option<String> = subkey.get_value("Publisher").ok();
                            let exe_path: Option<String> = subkey.get_value("DisplayIcon").ok();

                            apps.push(InstalledApp {
                                name: display_name.trim().to_string(),
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

/// Windows Credential Manager: Secure Storage
#[tauri::command]
fn save_credential_secure(service: String, user: String, secret: String) -> Result<bool, String> {
    let entry = keyring::Entry::new(&service, &user).map_err(|e| e.to_string())?;
    entry.set_password(&secret).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Windows Credential Manager: Secure Retrieval
#[tauri::command]
fn get_credential_secure(service: String, user: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(&service, &user).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Windows Credential Manager: Secure Deletion
#[tauri::command]
fn delete_credential_secure(service: String, user: String) -> Result<bool, String> {
    let entry = keyring::Entry::new(&service, &user).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

/// Executes a verified native PC action
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
                    "code" | "vscode" | "vs code" => "code",
                    "paint" | "mspaint" => "mspaint.exe",
                    "edge" => "msedge.exe",
                    "settings" => "ms-settings:",
                    "spotify" => "spotify:",
                    "discord" => "discord:",
                    _ => &app,
                };

                let mut cmd = std::process::Command::new("cmd.exe");
                cmd.args(&["/c", "start", "", binary]);
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                let child = cmd.spawn().map_err(|e| e.to_string())?;
                let pid = child.id();

                Ok(ActionResult {
                    success: true,
                    message: format!("Successfully launched \"{}\"", app),
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

            // Block critical system processes
            let critical = ["csrss.exe", "lsass.exe", "explorer.exe", "services.exe", "smss.exe", "wininit.exe", "taskmgr.exe"];
            if critical.iter().any(|c| c.eq_ignore_ascii_case(&proc_name)) {
                return Ok(ActionResult {
                    success: false,
                    message: format!("Terminating critical process \"{}\" is blocked.", proc_name),
                    result: None,
                });
            }

            #[cfg(target_os = "windows")]
            {
                let mut cmd = std::process::Command::new("taskkill");
                cmd.args(&["/IM", &proc_name, "/F"]);
                cmd.creation_flags(0x08000000);
                let output = cmd.output().map_err(|e| e.to_string())?;

                if output.status.success() {
                    Ok(ActionResult {
                        success: true,
                        message: format!("Closed application process \"{}\".", proc_name),
                        result: Some(serde_json::json!({ "process": proc_name })),
                    })
                } else {
                    let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    Ok(ActionResult {
                        success: false,
                        message: if err_msg.is_empty() { format!("Process \"{}\" not found or already closed.", proc_name) } else { err_msg },
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
                let mut cmd = std::process::Command::new("cmd.exe");
                cmd.args(&["/c", "start", "", url]);
                cmd.creation_flags(0x08000000);
                cmd.spawn().map_err(|e| e.to_string())?;

                Ok(ActionResult {
                    success: true,
                    message: format!("Opened URL \"{}\"", url),
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
                let (key_char, count) = match action.as_str() {
                    "up" | "increase" => (175, 4),
                    "down" | "decrease" => (174, 4),
                    _ => (173, 1),
                };
                let ps_cmd = format!(
                    "1..{} | ForEach-Object {{ (New-Object -ComObject WScript.Shell).SendKeys([char]{}) }}",
                    count, key_char
                );
                let mut cmd = std::process::Command::new("powershell");
                cmd.args(&["-NoProfile", "-Command", &ps_cmd]);
                cmd.creation_flags(0x08000000);
                cmd.spawn().map_err(|e| e.to_string())?;

                Ok(ActionResult {
                    success: true,
                    message: format!("Volume action \"{}\" executed.", action),
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
                let key_char = if action.contains("next") {
                    176
                } else if action.contains("prev") {
                    177
                } else {
                    179
                };
                let ps_cmd = format!("(New-Object -ComObject WScript.Shell).SendKeys([char]{})", key_char);
                let mut cmd = std::process::Command::new("powershell");
                cmd.args(&["-NoProfile", "-Command", &ps_cmd]);
                cmd.creation_flags(0x08000000);
                cmd.spawn().map_err(|e| e.to_string())?;

                Ok(ActionResult {
                    success: true,
                    message: format!("Media control \"{}\" dispatched.", action),
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
                let method = if action.contains("restore") {
                    "UndoMinimizeAll"
                } else {
                    "MinimizeAll"
                };
                let ps_cmd = format!("(New-Object -ComObject Shell.Application).{}()", method);
                let mut cmd = std::process::Command::new("powershell");
                cmd.args(&["-NoProfile", "-Command", &ps_cmd]);
                cmd.creation_flags(0x08000000);
                cmd.spawn().map_err(|e| e.to_string())?;

                Ok(ActionResult {
                    success: true,
                    message: format!("Window control \"{}\" executed.", action),
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
                    let mut cmd = std::process::Command::new("rundll32.exe");
                    cmd.args(&["user32.dll,LockWorkStation"]);
                    cmd.creation_flags(0x08000000);
                    cmd.spawn().map_err(|e| e.to_string())?;
                } else if pwr == "sleep" {
                    let mut cmd = std::process::Command::new("rundll32.exe");
                    cmd.args(&["powrprof.dll,SetSuspendState", "0,1,0"]);
                    cmd.creation_flags(0x08000000);
                    cmd.spawn().map_err(|e| e.to_string())?;
                }

                Ok(ActionResult {
                    success: true,
                    message: format!("Power action \"{}\" executed.", pwr),
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
                let mut cmd = std::process::Command::new("cmd.exe");
                cmd.args(&["/c", "start", "", target_shell]);
                cmd.creation_flags(0x08000000);
                cmd.spawn().map_err(|e| e.to_string())?;

                Ok(ActionResult {
                    success: true,
                    message: format!("Opened special folder \"{}\".", folder),
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
            execute_pc_action,
            save_credential_secure,
            get_credential_secure,
            delete_credential_secure
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
