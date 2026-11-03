fn main() {
    // tauri-build embeds icons/icon.ico in the Windows exe but doesn't watch it, so `make icons` alone left the old icon.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
