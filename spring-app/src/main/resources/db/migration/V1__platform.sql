CREATE TABLE app_user (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  wechat VARCHAR(100) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('USER','ADMIN')),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  security_version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE TABLE platform_guard (id INTEGER PRIMARY KEY);
INSERT INTO platform_guard(id) VALUES (1);
CREATE TABLE auth_token (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  purpose VARCHAR(10) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX auth_token_user ON auth_token(user_id, purpose);
CREATE TABLE assessment (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  draft_json TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  published_version INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE TABLE assessment_version (
  id VARCHAR(36) PRIMARY KEY,
  assessment_id VARCHAR(36) NOT NULL REFERENCES assessment(id),
  version_number INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(assessment_id, version_number)
);
CREATE TABLE assignment (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
  version_id VARCHAR(36) NOT NULL REFERENCES assessment_version(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(user_id, version_id)
);
CREATE TABLE submission (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
  assignment_id VARCHAR(36) NOT NULL REFERENCES assignment(id),
  version_id VARCHAR(36) NOT NULL REFERENCES assessment_version(id),
  idempotency_key VARCHAR(64) NOT NULL,
  answers_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  total INTEGER NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX submission_user_time ON submission(user_id, submitted_at);
CREATE INDEX assignment_user ON assignment(user_id);
