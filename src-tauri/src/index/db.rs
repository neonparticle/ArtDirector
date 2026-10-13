use std::ops::{Deref, DerefMut};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;

use crate::error::Result;

const SCHEMA: &str = include_str!("schema.sql");
const MAX_IDLE: usize = 8;

/// A tiny connection pool: SQLite connections are cheap but not free, and the
/// thumbnail protocol resolves an asset id on every image request.
pub struct Db {
    path: PathBuf,
    idle: Mutex<Vec<Connection>>,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Self::connect(path)?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self {
            path: path.to_path_buf(),
            idle: Mutex::new(vec![conn]),
        })
    }

    fn connect(path: &Path) -> Result<Connection> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;
             PRAGMA temp_store = MEMORY;",
        )?;
        Ok(conn)
    }

    pub fn get(&self) -> Result<Conn<'_>> {
        let pooled = self.idle.lock().ok().and_then(|mut idle| idle.pop());
        let conn = match pooled {
            Some(c) => c,
            None => Self::connect(&self.path)?,
        };
        Ok(Conn {
            db: self,
            conn: Some(conn),
        })
    }
}

pub struct Conn<'a> {
    db: &'a Db,
    conn: Option<Connection>,
}

impl Deref for Conn<'_> {
    type Target = Connection;
    fn deref(&self) -> &Connection {
        self.conn.as_ref().expect("connection taken")
    }
}

impl DerefMut for Conn<'_> {
    fn deref_mut(&mut self) -> &mut Connection {
        self.conn.as_mut().expect("connection taken")
    }
}

impl Drop for Conn<'_> {
    fn drop(&mut self) {
        if let (Some(conn), Ok(mut idle)) = (self.conn.take(), self.db.idle.lock()) {
            if idle.len() < MAX_IDLE {
                idle.push(conn);
            }
        }
    }
}
