-- A user's live projects have distinct nicknames, ignoring letter case.
-- A soft-deleted project frees its nickname (there is no restore).
CREATE UNIQUE INDEX project_owner_nickname_uq
    ON project (owner_id, lower(nickname))
    WHERE deleted_at IS NULL;
