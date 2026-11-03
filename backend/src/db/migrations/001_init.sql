-- Skema awal Sistem Informasi Manajemen Proyek Berbasis AI (MySQL 8 / InnoDB)
-- Konsolidasi dari migrasi PostgreSQL lama (001_init, 002_ml_risk, 003_roles_softdelete_history)
-- karena database dibangun ulang dari nol dengan MySQL.

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- Pengguna
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id             INT          NOT NULL AUTO_INCREMENT,
    name           VARCHAR(120) NOT NULL,
    email          VARCHAR(160) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(20)  NOT NULL DEFAULT 'member',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at     DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_deleted_at (deleted_at),
    CONSTRAINT chk_users_role CHECK (role IN ('superadmin', 'admin', 'manager', 'member'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Proyek
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id           INT            NOT NULL AUTO_INCREMENT,
    name         VARCHAR(200)   NOT NULL,
    description  TEXT           NULL,
    start_date   DATE           NULL,
    due_date     DATE           NULL,
    status       VARCHAR(20)    NOT NULL DEFAULT 'active',
    manager_id   INT            NULL,
    budget       DECIMAL(16,2)  NULL,
    created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at   DATETIME       NULL,
    PRIMARY KEY (id),
    KEY idx_projects_manager (manager_id),
    KEY idx_projects_status (status),
    KEY idx_projects_deleted_at (deleted_at),
    CONSTRAINT chk_projects_status CHECK (status IN ('active', 'archived', 'completed')),
    CONSTRAINT fk_projects_manager FOREIGN KEY (manager_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Tugas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id                  INT           NOT NULL AUTO_INCREMENT,
    project_id          INT           NOT NULL,
    title               VARCHAR(200)  NOT NULL,
    description         TEXT          NULL,
    assignee_id         INT           NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'todo',
    progress            INT           NOT NULL DEFAULT 0,
    estimated_duration  DECIMAL(6,2)  NULL,
    actual_duration     DECIMAL(6,2)  NULL,
    start_date          DATE          NULL,
    due_date            DATE          NULL,
    importance          VARCHAR(10)   NOT NULL DEFAULT 'medium',
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME      NULL,
    PRIMARY KEY (id),
    KEY idx_tasks_project (project_id),
    KEY idx_tasks_assignee (assignee_id),
    KEY idx_tasks_status (status),
    KEY idx_tasks_due_date (due_date),
    KEY idx_tasks_deleted_at (deleted_at),
    CONSTRAINT chk_tasks_status CHECK (status IN ('todo', 'in_progress', 'blocked', 'completed')),
    CONSTRAINT chk_tasks_progress CHECK (progress BETWEEN 0 AND 100),
    CONSTRAINT chk_tasks_importance CHECK (importance IN ('low', 'medium', 'high')),
    CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Ketergantungan antar tugas (prasyarat)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_dependencies (
    id                  INT NOT NULL AUTO_INCREMENT,
    task_id             INT NOT NULL,
    depends_on_task_id  INT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_task_dep (task_id, depends_on_task_id),
    KEY idx_dep_task (task_id),
    KEY idx_dep_depends (depends_on_task_id),
    CONSTRAINT chk_task_dep_not_self CHECK (task_id <> depends_on_task_id),
    CONSTRAINT fk_dep_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    CONSTRAINT fk_dep_depends FOREIGN KEY (depends_on_task_id) REFERENCES tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Riwayat progres tugas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_progress_history (
    id           INT          NOT NULL AUTO_INCREMENT,
    task_id      INT          NOT NULL,
    progress     INT          NOT NULL,
    status       VARCHAR(20)  NOT NULL,
    note         TEXT         NULL,
    updated_by   INT          NULL,
    recorded_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_progress_task (task_id),
    CONSTRAINT fk_progress_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    CONSTRAINT fk_progress_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Hasil analisis risiko (model ML atau fallback aturan)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_assessments (
    id                    INT            NOT NULL AUTO_INCREMENT,
    project_id            INT            NULL,
    task_id               INT            NULL,
    risk_level            VARCHAR(10)    NOT NULL,
    risk_score            DECIMAL(6,2)   NULL,
    predicted_delay_days  DECIMAL(6,2)   NULL,
    contributing_factors  JSON           NOT NULL,
    recommendation        TEXT           NULL,
    model_version         VARCHAR(40)    NOT NULL,
    confidence            DECIMAL(6,4)   NULL,
    probabilities         JSON           NULL,
    analyzed_at           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_risk_project (project_id),
    KEY idx_risk_task (task_id),
    CONSTRAINT chk_risk_level CHECK (risk_level IN ('low', 'medium', 'high')),
    CONSTRAINT fk_risk_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_risk_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Log aktivitas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
    id           INT          NOT NULL AUTO_INCREMENT,
    entity_type  VARCHAR(30)  NOT NULL,
    entity_id    INT          NULL,
    action       VARCHAR(40)  NOT NULL,
    description  TEXT         NULL,
    actor_id     INT          NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_activity_created (created_at DESC),
    KEY idx_activity_entity (entity_type, entity_id),
    CONSTRAINT fk_activity_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Histori pembaruan (dapat di-revert)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS update_history (
    id             INT          NOT NULL AUTO_INCREMENT,
    entity_type    VARCHAR(30)  NOT NULL,
    entity_id      INT          NOT NULL,
    action         VARCHAR(40)  NOT NULL,
    snapshot       JSON         NOT NULL,
    diff           JSON         NOT NULL,
    metadata       JSON         NOT NULL,
    actor_id       INT          NULL,
    reverted_at    DATETIME     NULL,
    reverted_by    INT          NULL,
    revert_to_id   INT          NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_update_history_entity (entity_type, entity_id, created_at DESC),
    KEY idx_update_history_actor (actor_id),
    CONSTRAINT fk_history_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_history_reverted_by FOREIGN KEY (reverted_by) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_history_revert_to FOREIGN KEY (revert_to_id) REFERENCES update_history (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
