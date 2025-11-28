import React, { createContext, useContext, useState, useEffect } from 'react';

const StoreContext = createContext();

export const useStore = () => useContext(StoreContext);

const API_BASE = 'http://localhost:4000/api';

export const StoreProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [token, setToken] = useState(null);
    const [members, setMembers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    const normalizeMedication = (med) => {
        if (!med) return med;
        const timesPerDay = Number(med.timesPerDay) > 0
            ? Number(med.timesPerDay)
            : (Array.isArray(med.doseTimes) && med.doseTimes.length > 0 ? med.doseTimes.length : 1);
        const baseTimes = Array.isArray(med.doseTimes) && med.doseTimes.length > 0
            ? [...med.doseTimes]
            : [med.intakeTime || '08:00'];
        const doseTimes = baseTimes.slice(0, timesPerDay);
        while (doseTimes.length < timesPerDay) {
            doseTimes.push(doseTimes[doseTimes.length - 1] || '08:00');
        }
        return {
            ...med,
            timesPerDay,
            doseTimes
        };
    };

    const normalizeMembers = (rawMembers = []) => {
        return rawMembers.map(member => ({
            ...member,
            medications: (member.medications || []).map(normalizeMedication)
        }));
    };

    // Load auth from localStorage on first mount
    useEffect(() => {
        const saved = localStorage.getItem('med_app_auth');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setCurrentUser(parsed.user || null);
                setToken(parsed.token || null);
            } catch {
                localStorage.removeItem('med_app_auth');
            }
        }
        setLoading(false);
    }, []);

    // When we have a token, load members and logs
    useEffect(() => {
        if (!token) {
            setMembers([]);
            setLogs([]);
            return;
        }

        const headers = {
            Authorization: `Bearer ${token}`
        };

        const fetchData = async () => {
            try {
                const [membersRes, logsRes] = await Promise.all([
                    fetch(`${API_BASE}/members`, { headers }),
                    fetch(`${API_BASE}/logs`, { headers })
                ]);
                if (membersRes.ok) {
                    const m = await membersRes.json();
                    setMembers(normalizeMembers(m));
                }
                if (logsRes.ok) {
                    const l = await logsRes.json();
                    setLogs(l);
                }
            } catch (err) {
                console.error('Failed to load data from backend', err);
            }
        };

        fetchData();
    }, [token]);

    const saveAuth = (user, tokenValue) => {
        setCurrentUser(user);
        setToken(tokenValue);
        localStorage.setItem('med_app_auth', JSON.stringify({ user, token: tokenValue }));
    };

    // Actions
    const login = async (username, password) => {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) {
            throw new Error('Invalid credentials');
        }
        const data = await res.json();
        saveAuth(data.user, data.token);
    };

    const register = async (username, password, phone) => {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, phone, isHead: true })
        });
        if (!res.ok) {
            throw new Error('Registration failed');
        }
        const data = await res.json();
        saveAuth(data.user, data.token);
    };

    const logout = async () => {
        if (token) {
            try {
                await fetch(`${API_BASE}/auth/logout`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` }
                });
            } catch (err) {
                console.error('Logout error (ignored)', err);
            }
        }
        setCurrentUser(null);
        setToken(null);
        setMembers([]);
        setLogs([]);
        localStorage.removeItem('med_app_auth');
    };

    const authHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
    });

    const addMember = async (memberData) => {
        const res = await fetch(`${API_BASE}/members`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(memberData)
        });
        if (!res.ok) {
            throw new Error('Failed to add member');
        }
        const created = await res.json();
        setMembers(prev => [...prev, normalizeMembers([created])[0]]);
        // logs are already updated in backend; refresh logs
        await refreshLogs();
    };

    const updateMember = async (memberId, memberData) => {
        const res = await fetch(`${API_BASE}/members/${memberId}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(memberData)
        });
        if (!res.ok) {
            throw new Error('Failed to update member');
        }
        const updated = await res.json();
        const normalized = normalizeMembers([updated])[0];
        setMembers(prev => prev.map(m => (m.id === normalized.id ? normalized : m)));
        await refreshLogs();
    };

    const updateSupply = async (memberId, medId, change) => {
        const res = await fetch(`${API_BASE}/members/${memberId}/medications/${medId}/consume`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ change })
        });
        if (!res.ok) {
            throw new Error('Failed to update supply');
        }
        const result = await res.json();
        setMembers(prev => prev.map(member => {
            if (member.id !== memberId) return member;
            return {
                ...member,
                medications: member.medications.map(med => {
                    if (med.id !== medId) return med;
                    return {
                        ...med,
                        supply: result.supply,
                        consumedCount: result.consumedCount
                    };
                })
            };
        }));
        await refreshLogs();
    };

    const addLog = async (message) => {
        const res = await fetch(`${API_BASE}/logs`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ message })
        });
        if (!res.ok) return;
        const created = await res.json();
        setLogs(prev => [created, ...prev]);
    };

    const refreshLogs = async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API_BASE}/logs`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const l = await res.json();
                setLogs(l);
            }
        } catch (err) {
            console.error('Failed to refresh logs', err);
        }
    };

    const triggerReminderForMember = async (memberId, medicationId, doseTime) => {
        const res = await fetch(`${API_BASE}/reminders/trigger`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ memberId, medicationId, doseTime })
        });
        if (!res.ok) {
            throw new Error('Failed to trigger reminder');
        }
        const data = await res.json();
        await refreshLogs();
        return data;
    };

    return (
        <StoreContext.Provider value={{
            currentUser,
            members,
            logs,
            loading,
            login,
            register,
            logout,
            addMember,
            updateMember,
            updateSupply,
            addLog,
            triggerReminderForMember
        }}>
            {children}
        </StoreContext.Provider>
    );
};

