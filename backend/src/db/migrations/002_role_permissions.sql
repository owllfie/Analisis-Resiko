-- ---------------------------------------------------------------------------
-- Perizinan berbasis peran (dapat diubah dari halaman Matriks Hak Akses)
--
-- Setiap baris menyatakan apakah sebuah peran boleh melakukan sebuah aksi.
-- Tabel ini menjadi sumber kebenaran: penjaga rute (authorize) membacanya,
-- bukan lagi daftar peran yang dipaku di kode.
-- `scope` menyatakan apakah izin berlaku untuk semua data ('all') atau hanya
-- untuk data yang dimiliki pengguna ('own').
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
    id             INT          NOT NULL AUTO_INCREMENT,
    role           VARCHAR(30)  NOT NULL,
    permission_key VARCHAR(60)  NOT NULL,
    allowed        TINYINT(1)   NOT NULL DEFAULT 0,
    scope          ENUM('all','own') NOT NULL DEFAULT 'all',
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_role_permission (role, permission_key),
    KEY idx_role_permissions_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nilai awal: menyalin perilaku yang berlaku sebelum tabel ini ada, agar
-- aplikasi tidak berubah perilaku sampai admin mengubahnya sendiri.
INSERT INTO role_permissions (role, permission_key, allowed, scope) VALUES
  -- superadmin: seluruhnya diizinkan untuk semua data.
  ('superadmin','user.view',1,'all'),
  ('superadmin','user.manage',1,'all'),
  ('superadmin','project.view',1,'all'),
  ('superadmin','project.create',1,'all'),
  ('superadmin','project.update',1,'all'),
  ('superadmin','project.delete',1,'all'),
  ('superadmin','task.create',1,'all'),
  ('superadmin','task.update',1,'all'),
  ('superadmin','task.delete',1,'all'),
  ('superadmin','task.progress',1,'all'),
  ('superadmin','dependency.manage',1,'all'),
  ('superadmin','risk.analyze',1,'all'),
  ('superadmin','history.view',1,'all'),
  ('superadmin','history.revert',1,'all'),
  ('superadmin','activity.view',1,'all'),
  ('superadmin','activity.delete',1,'all'),
  ('superadmin','trash.manage',1,'all'),
  ('superadmin','access.manage',1,'all'),

  -- admin: seluruhnya diizinkan untuk semua data.
  ('admin','user.view',1,'all'),
  ('admin','user.manage',1,'all'),
  ('admin','project.view',1,'all'),
  ('admin','project.create',1,'all'),
  ('admin','project.update',1,'all'),
  ('admin','project.delete',1,'all'),
  ('admin','task.create',1,'all'),
  ('admin','task.update',1,'all'),
  ('admin','task.delete',1,'all'),
  ('admin','task.progress',1,'all'),
  ('admin','dependency.manage',1,'all'),
  ('admin','risk.analyze',1,'all'),
  ('admin','history.view',1,'all'),
  ('admin','history.revert',1,'all'),
  ('admin','activity.view',1,'all'),
  ('admin','activity.delete',1,'all'),
  ('admin','trash.manage',1,'all'),
  ('admin','access.manage',1,'all'),

  -- manager: boleh mengelola proyek/tugas, tetapi hanya yang ia pimpin ('own').
  ('manager','user.view',1,'all'),
  ('manager','user.manage',0,'all'),
  ('manager','project.view',1,'all'),
  ('manager','project.create',1,'all'),
  ('manager','project.update',1,'own'),
  ('manager','project.delete',1,'own'),
  ('manager','task.create',1,'own'),
  ('manager','task.update',1,'own'),
  ('manager','task.delete',1,'own'),
  ('manager','task.progress',1,'all'),
  ('manager','dependency.manage',1,'own'),
  ('manager','risk.analyze',1,'all'),
  ('manager','history.view',1,'all'),
  ('manager','history.revert',0,'all'),
  ('manager','activity.view',1,'all'),
  ('manager','activity.delete',0,'all'),
  ('manager','trash.manage',0,'all'),
  ('manager','access.manage',0,'all'),

  -- member: hanya mengerjakan tugas yang ditugaskan kepadanya.
  ('member','user.view',0,'all'),
  ('member','user.manage',0,'all'),
  ('member','project.view',1,'own'),
  ('member','project.create',0,'all'),
  ('member','project.update',0,'all'),
  ('member','project.delete',0,'all'),
  ('member','task.create',0,'all'),
  ('member','task.update',0,'all'),
  ('member','task.delete',0,'all'),
  ('member','task.progress',1,'own'),
  ('member','dependency.manage',0,'all'),
  ('member','risk.analyze',0,'all'),
  ('member','history.view',1,'own'),
  ('member','history.revert',0,'all'),
  ('member','activity.view',1,'all'),
  ('member','activity.delete',0,'all'),
  ('member','trash.manage',0,'all'),
  ('member','access.manage',0,'all')
ON DUPLICATE KEY UPDATE role = role;
