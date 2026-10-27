// Prevents additional console window on Windows in release build
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::sync::Mutex;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Serialize, Clone, Debug)]
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

    // Index 0: name ("NVIDIA GeForce RTX 3050 Laptop GPU")
    // Index 1: temperature.gpu
    // Index 2: utilization.gpu
    // Index 3: memory.used (MiB)
    // Index 4: memory.total (MiB)
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

#[derive(Serialize)]
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
        .invoke_handler(tauri::generate_handler![get_system_metrics])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
