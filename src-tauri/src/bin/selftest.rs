fn main() {
    lazy_editor_lib::run_with_context(
        tauri::generate_context!("tauri.selftest.conf.json"),
    );
}
