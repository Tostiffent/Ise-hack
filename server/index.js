const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { loadDb, saveDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

// In-memory state loaded from disk
let db = loadDb();

// Very simple in-memory session store: token -> userId
const sessions = new Map();

app.use(cors());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const [, token] = auth.split(' ');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = sessions.get(token);
  const user = db.users.find(u => u.id === userId);
  if (!user) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = user;
  req.token = token;
  next();
}

function isHeadOfFamily(user) {
  return user.role === 'HEAD_OF_FAMILY';
}

function normalizeTimesPerDay(value) {
  if (typeof value === 'number' && value > 0) return value;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatPhoneNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length >= 12) {
    return `+${digits.slice(0, 12)}`;
  }
  const lastTen = digits.slice(-10);
  return lastTen ? `+91${lastTen}` : '';
}

function normalizeTime(value) {
  const fallback = '08:00';
  if (!value || typeof value !== 'string') return fallback;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? `${match[1]}:${match[2]}` : fallback;
}

function normalizeDoseTimes(timesPerDay, incoming) {
  const count = normalizeTimesPerDay(timesPerDay);
  const provided = Array.isArray(incoming) ? incoming : [];
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(normalizeTime(provided[i] ?? result[i - 1] ?? '08:00'));
  }
  return result;
}

function subtractMinutes(timeStr, minutes = 5) {
  const [hStr, mStr] = (timeStr || '08:00').split(':');
  let total = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) - minutes;
  total = (total + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function currentTimeHHMM() {
  const now = new Date();
  return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function sanitizeDb() {
  db.users = (db.users || []).map(user => ({
    ...user,
    phone: formatPhoneNumber(user.phone)
  }));

  db.members = (db.members || []).map(member => ({
    ...member,
    phone: formatPhoneNumber(member.phone),
    medications: (member.medications || []).map(med => {
      const timesPerDay = normalizeTimesPerDay(med.timesPerDay || (med.doseTimes?.length || 1));
      return {
        ...med,
        timesPerDay,
        doseTimes: normalizeDoseTimes(
          timesPerDay,
          med.doseTimes && med.doseTimes.length > 0 ? med.doseTimes : [med.intakeTime]
        )
      };
    })
  }));

  saveDb(db);
}

sanitizeDb();

const CALL_SERVICE_URL = process.env.CALL_SERVICE_URL || 'https://fd706f40c6ea.ngrok-free.app/call-reminder';

async function triggerCallReminder({ member, medication, scheduledDoseTime, heads, isMinor }) {
  const headPhones = heads
    .map(h => formatPhoneNumber(h.phone))
    .filter(Boolean);
  const primaryHeadPhone = headPhones[0];
  const memberPhone = formatPhoneNumber(member.phone);
  const phoneNumber = (!isMinor && memberPhone) ? memberPhone : (primaryHeadPhone || memberPhone);
  if (!phoneNumber) {
    console.warn('Reminder call skipped: no phone number available.');
    return;
  }

  const payload = {
    phone_number: phoneNumber,
    user_name: member.name,
    user_type: isMinor ? 'minor' : 'adult',
    medicine: {
      name: medication.name,
      dosage: medication.dosage || '1 dose',
      next_dose_time: scheduledDoseTime || 'now'
    },
    head_of_family_phones: headPhones
  };

  try {
    const response = await fetch(CALL_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`Reminder call API responded with status ${response.status}: ${text}`);
    }
  } catch (err) {
    console.error('Failed to trigger reminder call API:', err.message, err.cause ? err.cause : '');
  }
}

// ----- Auth -----

// Simple registration – for demo, no email verification, no hashing
app.post('/api/auth/register', (req, res) => {
  const { username, password, phone, isHead = true } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (db.users.some(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const familyId = crypto.randomUUID();

  const user = {
    id: crypto.randomUUID(),
    username,
    password, // NOTE: plain text for demo only
    phone: formatPhoneNumber(phone),
    role: isHead ? 'HEAD_OF_FAMILY' : 'ADULT',
    familyId
  };

  db.users.push(user);
  db.families.push({
    id: familyId,
    headUserIds: [user.id]
  });
  saveDb(db);

  const token = createToken();
  sessions.set(token, user.id);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      phone: user.phone,
      familyId: user.familyId
    }
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = createToken();
  sessions.set(token, user.id);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      phone: user.phone,
      familyId: user.familyId
    }
  });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  if (req.token) {
    sessions.delete(req.token);
  }
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = req.user;
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    phone: user.phone,
    familyId: user.familyId
  });
});

// ----- Members & Medications -----

app.get('/api/members', requireAuth, (req, res) => {
  const user = req.user;

  // Only head of family can see all members for the family
  if (!isHeadOfFamily(user)) {
    return res.status(403).json({ error: 'Only head of family can view members' });
  }

  const members = db.members.filter(m => m.familyId === user.familyId);
  res.json(members);
});

app.post('/api/members', requireAuth, (req, res) => {
  const user = req.user;
  if (!isHeadOfFamily(user)) {
    return res.status(403).json({ error: 'Only head of family can add members' });
  }

  const { name, ageGroup, phone, medications = [] } = req.body || {};
  if (!name || !ageGroup) {
    return res.status(400).json({ error: 'Name and ageGroup are required' });
  }

  const memberId = crypto.randomUUID();
  const member = {
    id: memberId,
    familyId: user.familyId,
    name,
    ageGroup,
    phone: formatPhoneNumber(phone),
    medications: medications.map(med => {
      const timesPerDay = normalizeTimesPerDay(med.timesPerDay);
      return {
        id: med.id || crypto.randomUUID(),
        name: med.name,
        dosage: med.dosage,
        supply: typeof med.supply === 'number' ? med.supply : 0,
        consumedCount: med.consumedCount || 0,
        timesPerDay,
        doseTimes: normalizeDoseTimes(timesPerDay, med.doseTimes?.length ? med.doseTimes : [med.intakeTime])
      };
    })
  };

  db.members.push(member);
  db.logs.unshift({
    id: crypto.randomUUID(),
    familyId: user.familyId,
    timestamp: new Date().toISOString(),
    message: `Added new family member: ${member.name}`
  });
  saveDb(db);

  res.status(201).json(member);
});

app.put('/api/members/:id', requireAuth, (req, res) => {
  const user = req.user;
  if (!isHeadOfFamily(user)) {
    return res.status(403).json({ error: 'Only head of family can update members' });
  }

  const memberId = req.params.id;
  const idx = db.members.findIndex(m => m.id === memberId && m.familyId === user.familyId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const { name, ageGroup, phone, medications = [] } = req.body || {};
  const existing = db.members[idx];

  const updated = {
    ...existing,
    name: name ?? existing.name,
    ageGroup: ageGroup ?? existing.ageGroup,
    phone: typeof phone !== 'undefined' ? formatPhoneNumber(phone) : existing.phone,
    medications: medications.map(med => {
      const existingMed = existing.medications.find(x => x.id === med.id);
      const timesPerDay = normalizeTimesPerDay(med.timesPerDay ?? (existingMed ? existingMed.timesPerDay : 1));
      return {
        id: med.id || crypto.randomUUID(),
        name: med.name,
        dosage: med.dosage,
        supply: typeof med.supply === 'number' ? med.supply : (existingMed ? existingMed.supply : 0),
        consumedCount: existingMed ? existingMed.consumedCount : 0,
        timesPerDay,
        doseTimes: normalizeDoseTimes(
          timesPerDay,
          med.doseTimes && med.doseTimes.length > 0
            ? med.doseTimes
            : existingMed?.doseTimes
        )
      };
    })
  };

  db.members[idx] = updated;
  db.logs.unshift({
    id: crypto.randomUUID(),
    familyId: user.familyId,
    timestamp: new Date().toISOString(),
    message: `Updated family member: ${updated.name}`
  });
  saveDb(db);

  res.json(updated);
});

// Change supply & track consumption
app.post('/api/members/:memberId/medications/:medId/consume', requireAuth, (req, res) => {
  const user = req.user;

  const { memberId, medId } = req.params;
  const { change = -1 } = req.body || {};

  const member = db.members.find(m => m.id === memberId && m.familyId === user.familyId);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const med = member.medications.find(m => m.id === medId);
  if (!med) {
    return res.status(404).json({ error: 'Medication not found' });
  }

  const oldSupply = med.supply;
  const newSupply = Math.max(0, oldSupply + change);
  med.supply = newSupply;
  med.consumedCount = (med.consumedCount || 0) + (change < 0 ? -change : 0);

  db.logs.unshift({
    id: crypto.randomUUID(),
    familyId: user.familyId,
    timestamp: new Date().toISOString(),
    message: `Dose taken: ${med.name} (${member.name}). Remaining: ${med.supply}`
  });

  // Low supply warning
  if (newSupply <= 5 && oldSupply > 5) {
    db.logs.unshift({
      id: crypto.randomUUID(),
      familyId: user.familyId,
      timestamp: new Date().toISOString(),
      message: `WARNING: Low supply for ${med.name} (${member.name}). Notify head of family.`
    });
  }

  saveDb(db);
  res.json({
    memberId,
    medId,
    supply: med.supply,
    consumedCount: med.consumedCount,
    timesPerDay: med.timesPerDay || 1,
    doseTimes: med.doseTimes || [normalizeTime('08:00')]
  });
});

// ----- Activity Logs -----

app.get('/api/logs', requireAuth, (req, res) => {
  const user = req.user;
  const logs = db.logs
    .filter(log => log.familyId === user.familyId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(logs);
});

app.post('/api/logs', requireAuth, (req, res) => {
  const user = req.user;
  const { message } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  const log = {
    id: crypto.randomUUID(),
    familyId: user.familyId,
    timestamp: new Date().toISOString(),
    message
  };
  db.logs.unshift(log);
  saveDb(db);
  res.status(201).json(log);
});

// ----- Reminder Simulation (cases 1–4) -----

function getFamilyHeads(familyId) {
  const family = db.families.find(f => f.id === familyId);
  if (!family) return [];
  return family.headUserIds
    .map(id => db.users.find(u => u.id === id))
    .filter(Boolean);
}

app.post('/api/reminders/trigger', requireAuth, async (req, res) => {
  const user = req.user;
  const { memberId, medicationId, doseTime } = req.body || {};

  const member = db.members.find(m => m.id === memberId && m.familyId === user.familyId);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const medication = member.medications.find(m => m.id === medicationId);

  if (!medication) {
    return res.status(400).json({ error: 'Medication not found for member' });
  }

  if (!medication.doseTimes || medication.doseTimes.length === 0) {
    medication.doseTimes = [normalizeTime(medication.intakeTime)];
    medication.timesPerDay = medication.timesPerDay || medication.doseTimes.length;
  }

  const normalizedDoseTime = doseTime ? normalizeTime(doseTime) : (medication.doseTimes?.[0] || '08:00');

  const heads = getFamilyHeads(member.familyId);
  const headNames = heads.map(h => h.username).join(', ') || 'Head of family';

  const events = [];
  const timesPerDay = medication.timesPerDay || 1;
  const intervalMinutes = Math.round((24 * 60) / timesPerDay);
  const reminderTime = currentTimeHHMM();

  if (member.ageGroup === 'Minor') {
    // CASE 2: minors – call head directly
    events.push(`Minor reminder: ${medication.name} (${timesPerDay}x/day, scheduled dose at ${normalizedDoseTime}). Calling head(s) ${headNames} now (${reminderTime}).`);
    db.logs.unshift({
      id: crypto.randomUUID(),
      familyId: member.familyId,
      timestamp: new Date().toISOString(),
      message: `REMINDER (Minor): Immediate call to head(s) ${headNames} for ${member.name}'s ${medication.name} dose scheduled ${normalizedDoseTime}.`
    });
  } else {
    // CASE 1: adults – call patient, retry, then escalate
    events.push(`Calling ${member.name} now (${reminderTime}) for ${medication.name} dose scheduled ${normalizedDoseTime}.`);
    events.push('Waiting for patient to pick up...');
    events.push('Call missed. Waiting briefly before retry...');
    events.push('Second call missed. Escalating to head(s): ' + headNames + '.');

    const now = new Date().toISOString();
    db.logs.unshift(
      {
        id: crypto.randomUUID(),
        familyId: member.familyId,
        timestamp: now,
        message: `REMINDER (Adult): Immediate call to ${member.name} at ${reminderTime} for ${medication.name} dose scheduled ${normalizedDoseTime}.`
      },
      {
        id: crypto.randomUUID(),
        familyId: member.familyId,
        timestamp: now,
        message: `REMINDER (Adult): 2 missed calls for ${member.name}, escalating to head(s) ${headNames}.`
      }
    );
  }

  // CASE 4: multiple heads – try in order
  if (heads.length > 1) {
    events.push(`If first head does not respond, contacting backup head(s): ${headNames}.`);
    db.logs.unshift({
      id: crypto.randomUUID(),
      familyId: member.familyId,
      timestamp: new Date().toISOString(),
      message: `HEAD ESCALATION: Primary head did not respond, attempting other head(s): ${headNames}.`
    });
  }

  saveDb(db);

  await triggerCallReminder({
    member,
    medication,
    scheduledDoseTime: normalizedDoseTime,
    heads,
    isMinor: member.ageGroup === 'Minor'
  });

  res.json({
    memberId: member.id,
    memberName: member.name,
    ageGroup: member.ageGroup,
    medication: {
      id: medication.id,
      name: medication.name,
      timesPerDay,
      doseTimes: medication.doseTimes,
      scheduledDoseTime: normalizedDoseTime,
      reminderTime
    },
    events
  });
});

app.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
});


