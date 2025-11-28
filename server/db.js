const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const defaultData = {
  users: [],
  families: [],
  members: [],
  logs: []
};

function loadDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf-8');
      return JSON.parse(JSON.stringify(defaultData));
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...defaultData, ...parsed };
  } catch (err) {
    console.error('Failed to load DB file, using in-memory default.', err);
    return JSON.parse(JSON.stringify(defaultData));
  }
}

function saveDb(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save DB file.', err);
  }
}

module.exports = {
  loadDb,
  saveDb
};


