const path = require('path');
const fs = require('fs-extra');

const DATA_PATH = path.join(__dirname, '..', 'data', 'db.json');

async function readDB() {
  await fs.ensureFile(DATA_PATH);
  try {
    const data = await fs.readJson(DATA_PATH);
    return {
      users: data.users || [],
      members: data.members || [],
      logs: data.logs || [],
    };
  } catch (error) {
    const fallback = { users: [], members: [], logs: [] };
    await fs.writeJson(DATA_PATH, fallback, { spaces: 2 });
    return fallback;
  }
}

async function writeDB(data) {
  await fs.writeJson(
    DATA_PATH,
    {
      users: data.users || [],
      members: data.members || [],
      logs: data.logs || [],
    },
    { spaces: 2 }
  );
}

module.exports = {
  readDB,
  writeDB,
  DATA_PATH,
};

