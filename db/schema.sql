PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Teams ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
    abbr        TEXT PRIMARY KEY,   -- e.g. "KC", "SF"
    espn_id     INTEGER,
    name        TEXT NOT NULL,
    conference  TEXT NOT NULL,      -- "American Football Conference" | "National Football Conference"
    division    TEXT NOT NULL,      -- "North" | "South" | "East" | "West"
    logo_url    TEXT
);

-- ─── Team season standings / aggregate stats ──────────────────────────────────
CREATE TABLE IF NOT EXISTS team_season_stats (
    abbr    TEXT    NOT NULL REFERENCES teams(abbr),
    season  INTEGER NOT NULL,
    won     INTEGER NOT NULL DEFAULT 0,
    lost    INTEGER NOT NULL DEFAULT 0,
    tied    INTEGER NOT NULL DEFAULT 0,
    ppg     REAL    NOT NULL DEFAULT 0,   -- points per game (offense)
    papg    REAL    NOT NULL DEFAULT 0,   -- points allowed per game
    ypg     REAL    NOT NULL DEFAULT 0,   -- yards per game (offense)
    yapg    REAL    NOT NULL DEFAULT 0,   -- yards allowed per game
    PRIMARY KEY (abbr, season)
);

-- ─── Players (identity — one row forever per unique player) ───────────────────
CREATE TABLE IF NOT EXISTS players (
    espn_id     TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    position    TEXT,               -- QB | RB | WR | TE | K | DEF
    height      TEXT,               -- e.g. "6'2\""
    weight      INTEGER,            -- lbs
    birth_date  TEXT,               -- YYYY-MM-DD
    college     TEXT,
    sleeper_id  TEXT                -- Sleeper fantasy platform ID if known
);

-- ─── Team stints (tracks mid-season trades / signings without duplicating player) ─
CREATE TABLE IF NOT EXISTS player_team_stints (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    espn_id     TEXT    NOT NULL REFERENCES players(espn_id),
    team_abbr   TEXT    NOT NULL REFERENCES teams(abbr),
    season      INTEGER NOT NULL,
    week_start  INTEGER NOT NULL DEFAULT 1,
    week_end    INTEGER             -- NULL means still on this team
);
CREATE INDEX IF NOT EXISTS idx_stints_player  ON player_team_stints(espn_id, season);
CREATE INDEX IF NOT EXISTS idx_stints_team    ON player_team_stints(team_abbr, season);

-- ─── Game-level player stats ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_logs (
    espn_id         TEXT    NOT NULL REFERENCES players(espn_id),
    game_id         TEXT    NOT NULL,   -- Tank01 format: "20260909_NE@SEA"
    season          INTEGER NOT NULL,
    week            INTEGER NOT NULL,
    game_date       TEXT    NOT NULL,   -- YYYYMMDD
    team_abbr       TEXT    NOT NULL,   -- team they played *for* this game
    opp_abbr        TEXT    NOT NULL,
    home_away       TEXT,               -- "home" | "away"
    -- passing
    passing_att     INTEGER DEFAULT 0,
    passing_cmp     INTEGER DEFAULT 0,
    passing_yds     INTEGER DEFAULT 0,
    passing_tds     INTEGER DEFAULT 0,
    interceptions   INTEGER DEFAULT 0,
    -- rushing
    rushing_att     INTEGER DEFAULT 0,
    rushing_yds     INTEGER DEFAULT 0,
    rushing_tds     INTEGER DEFAULT 0,
    -- receiving
    targets         INTEGER DEFAULT 0,
    receptions      INTEGER DEFAULT 0,
    receiving_yds   INTEGER DEFAULT 0,
    receiving_tds   INTEGER DEFAULT 0,
    -- misc
    fumbles_lost    INTEGER DEFAULT 0,
    two_pt_conv     INTEGER DEFAULT 0,
    fantasy_pts_std REAL    DEFAULT 0,
    fantasy_pts_ppr REAL    DEFAULT 0,
    snap_count      INTEGER,
    snap_pct        REAL,
    PRIMARY KEY (espn_id, game_id)
);
CREATE INDEX IF NOT EXISTS idx_gamelogs_season ON game_logs(season, week);
CREATE INDEX IF NOT EXISTS idx_gamelogs_team   ON game_logs(team_abbr, season);

-- ─── Season totals (precomputed cache — rebuilt from game_logs) ───────────────
-- Split by season so each table's PK is just (espn_id, team_abbr).
-- A player who changed teams gets one row per team PLUS one row with team_abbr='TOT'.

CREATE TABLE IF NOT EXISTS season_player_totals_2025 (
    espn_id         TEXT    NOT NULL REFERENCES players(espn_id),
    team_abbr       TEXT    NOT NULL,
    games_played    INTEGER NOT NULL DEFAULT 0,
    passing_att     INTEGER DEFAULT 0,
    passing_cmp     INTEGER DEFAULT 0,
    passing_yds     INTEGER DEFAULT 0,
    passing_tds     INTEGER DEFAULT 0,
    interceptions   INTEGER DEFAULT 0,
    rushing_att     INTEGER DEFAULT 0,
    rushing_yds     INTEGER DEFAULT 0,
    rushing_tds     INTEGER DEFAULT 0,
    targets         INTEGER DEFAULT 0,
    receptions      INTEGER DEFAULT 0,
    receiving_yds   INTEGER DEFAULT 0,
    receiving_tds   INTEGER DEFAULT 0,
    fumbles_lost    INTEGER DEFAULT 0,
    fantasy_pts_std REAL    DEFAULT 0,
    fantasy_pts_ppr REAL    DEFAULT 0,
    PRIMARY KEY (espn_id, team_abbr)
);

CREATE TABLE IF NOT EXISTS season_player_totals_2026 (
    espn_id         TEXT    NOT NULL REFERENCES players(espn_id),
    team_abbr       TEXT    NOT NULL,
    games_played    INTEGER NOT NULL DEFAULT 0,
    passing_att     INTEGER DEFAULT 0,
    passing_cmp     INTEGER DEFAULT 0,
    passing_yds     INTEGER DEFAULT 0,
    passing_tds     INTEGER DEFAULT 0,
    interceptions   INTEGER DEFAULT 0,
    rushing_att     INTEGER DEFAULT 0,
    rushing_yds     INTEGER DEFAULT 0,
    rushing_tds     INTEGER DEFAULT 0,
    targets         INTEGER DEFAULT 0,
    receptions      INTEGER DEFAULT 0,
    receiving_yds   INTEGER DEFAULT 0,
    receiving_tds   INTEGER DEFAULT 0,
    fumbles_lost    INTEGER DEFAULT 0,
    fantasy_pts_std REAL    DEFAULT 0,
    fantasy_pts_ppr REAL    DEFAULT 0,
    PRIMARY KEY (espn_id, team_abbr)
);

-- ─── Schedule ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedules (
    game_id     TEXT    PRIMARY KEY,    -- "20260909_NE@SEA"
    season      INTEGER NOT NULL,
    week        INTEGER NOT NULL,
    game_date   TEXT    NOT NULL,       -- YYYYMMDD
    home_team   TEXT    NOT NULL,
    away_team   TEXT    NOT NULL,
    kickoff     TEXT,                   -- "8:00p" etc
    channel     TEXT,
    status      TEXT    DEFAULT 'upcoming',  -- upcoming | live | final
    home_score  INTEGER,
    away_score  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_schedules_date   ON schedules(game_date);
CREATE INDEX IF NOT EXISTS idx_schedules_season ON schedules(season, week);

-- ─── Injury report snapshots ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS injuries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    espn_id     TEXT    NOT NULL,       -- no FK — player may not be in players table yet
    report_date TEXT    NOT NULL,       -- YYYY-MM-DD
    team_abbr   TEXT,
    status      TEXT,                   -- Active | Injured Reserve | PUP | Suspended
    designation TEXT,                   -- Questionable | Doubtful | Out | IR | null
    body_part   TEXT,
    UNIQUE (espn_id, report_date)       -- one snapshot per player per day
);
CREATE INDEX IF NOT EXISTS idx_injuries_player ON injuries(espn_id);
