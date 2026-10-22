# Monitoring Bisnis iPhone

Aplikasi stok, penjualan, kas, dan ringkasan bulanan dengan login Supabase.

## Aktifkan website
Settings → Pages → Deploy from a branch → main → /(root) → Save.

## Buat akun login
Buka project monitoring-iphone di Supabase → Authentication → Users → Add user → Create new user. Isi email dan password sendiri, aktifkan Auto Confirm User. Nonaktifkan Allow new users to sign up di pengaturan Authentication setelah akun dibuat.

## Pindahkan data
Login di website, import backup JSON terbaru dari PC kantor, lalu tunggu status Tersinkron. Di perangkat lain, login dengan akun aplikasi yang sama. Backup bisnis jangan diupload ke repository publik.

## Sinkronisasi
Perubahan disimpan setelah jeda singkat; saat halaman terbuka, data online diperiksa tiap 15 detik. Jika muncul konflik antarperangkat, download perubahan lokal dulu sebelum mengambil versi online. Keluar setelah selesai di komputer bersama.

config.js hanya berisi Project URL dan publishable key publik. Database sudah memakai RLS dan pemeriksaan versi untuk mencegah penimpaan data. Jangan pernah memasukkan secret key atau service_role key ke frontend.
