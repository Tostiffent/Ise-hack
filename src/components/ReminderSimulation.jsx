import React, { useState, useEffect } from 'react';
import { Phone, Bell, AlertTriangle } from 'lucide-react';
import { useStore } from '../context/StoreContext';

const ReminderSimulation = () => {
    const { members, triggerReminderForMember } = useStore();
    const [status, setStatus] = useState('IDLE'); // IDLE, RUNNING, DONE
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [selectedMedicationId, setSelectedMedicationId] = useState('');
    const [events, setEvents] = useState([]);
    const [selectedDoseTime, setSelectedDoseTime] = useState('');
    const [lastReminder, setLastReminder] = useState(null);
    const [error, setError] = useState('');

    const selectedMember = members.find(m => m.id === selectedMemberId);
    const availableMeds = selectedMember?.medications || [];
    const selectedMedication = availableMeds.find(m => m.id === selectedMedicationId);
    const availableTimes = selectedMedication
        ? (selectedMedication.doseTimes && selectedMedication.doseTimes.length > 0
            ? selectedMedication.doseTimes
            : [selectedMedication.intakeTime || '08:00'])
        : [];

    useEffect(() => {
        if (!selectedMember) {
            setSelectedMedicationId('');
            setSelectedDoseTime('');
            return;
        }
        const firstMed = selectedMember.medications[0];
        setSelectedMedicationId(firstMed?.id || '');
    }, [selectedMemberId, selectedMember]);

    useEffect(() => {
        if (!selectedMedication) {
            setSelectedDoseTime('');
            return;
        }
        const firstTime = (selectedMedication.doseTimes && selectedMedication.doseTimes.length > 0
            ? selectedMedication.doseTimes[0]
            : selectedMedication.intakeTime || '');
        setSelectedDoseTime(firstTime);
    }, [selectedMedicationId, selectedMedication]);

    const handleTrigger = async () => {
        if (!selectedMemberId) {
            setError('Select a member to simulate reminder flow.');
            return;
        }
        if (!selectedMedicationId) {
            setError('Select a medication to simulate its reminder flow.');
            return;
        }
        if (!selectedDoseTime) {
            setError('Select the specific scheduled dose time.');
            return;
        }
        setError('');
        setStatus('RUNNING');
        setEvents([]);
        try {
            const result = await triggerReminderForMember(selectedMemberId, selectedMedicationId, selectedDoseTime);
            setEvents(result.events || []);
            setLastReminder(result.medication ? {
                ...result.medication,
                memberName: result.memberName,
                ageGroup: result.ageGroup
            } : null);
            setStatus('DONE');
        } catch (err) {
            setError(err.message || 'Failed to trigger reminder');
            setLastReminder(null);
            setStatus('IDLE');
        }
    };

    const reset = () => {
        setStatus('IDLE');
        setEvents([]);
        setLastReminder(null);
        setError('');
    };

    return (
        <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '2rem', border: '1px solid var(--warning)' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)' }}>
                <AlertTriangle size={20} /> Reminder Simulation
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Select a family member + medication to simulate the reminder flow. Calls are placed immediately; the schedule is shown just for context/escalation.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <select
                    className="glass-input"
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                >
                    <option value="">Select member</option>
                    {members.map(member => (
                        <option key={member.id} value={member.id}>
                            {member.name} ({member.ageGroup})
                        </option>
                    ))}
                </select>

                {selectedMember && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Simulating reminder for <strong>{selectedMember.name}</strong> ({selectedMember.ageGroup}).
                    </div>
                )}

                {selectedMember && (
                    <select
                        className="glass-input"
                        value={selectedMedicationId}
                        onChange={(e) => setSelectedMedicationId(e.target.value)}
                    >
                        <option value="">Select medication</option>
                        {availableMeds.map(med => (
                            <option key={med.id} value={med.id}>
                                {med.name} • {med.timesPerDay || 1}x/day
                            </option>
                        ))}
                    </select>
                )}

                {selectedMedication && (
                    <select
                        className="glass-input"
                        value={selectedDoseTime}
                        onChange={(e) => setSelectedDoseTime(e.target.value)}
                    >
                        <option value="">Select dose time</option>
                        {availableTimes.map(time => (
                            <option key={time} value={time}>{time}</option>
                        ))}
                    </select>
                )}

                {selectedMedication && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <span>
                            {selectedMedication.name} schedule: {(selectedMedication.doseTimes && selectedMedication.doseTimes.length > 0
                                ? selectedMedication.doseTimes
                                : [selectedMedication.intakeTime || '08:00']
                            ).join(', ')}
                        </span>
                        {selectedDoseTime && (
                            <span>
                                Calls go out immediately when you trigger them; the selected time is used for context/escalation only.
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <button
                    onClick={handleTrigger}
                    className="btn-primary"
                    style={{ background: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    disabled={status === 'RUNNING'}
                >
                    <Bell size={16} /> {status === 'RUNNING' ? 'Running...' : 'Trigger Reminder'}
                </button>
                {status !== 'IDLE' && (
                    <button
                        onClick={reset}
                        className="btn-secondary"
                        style={{ fontSize: '0.8rem' }}
                    >
                        Reset
                    </button>
                )}
                {status === 'RUNNING' && (
                    <div style={{ color: 'var(--accent)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Phone className="animate-pulse" /> Processing reminder flow...
                    </div>
                )}
            </div>

            {error && (
                <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                    {error}
                </div>
            )}

            {lastReminder && (
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span>
                        Calling <strong>{lastReminder.memberName}</strong> ({lastReminder.ageGroup}) right now (<strong>{lastReminder.reminderTime}</strong>) regarding the scheduled dose time <strong>{lastReminder.scheduledDoseTime}</strong> for <strong>{lastReminder.name}</strong>.
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Full schedule: {(lastReminder.doseTimes && lastReminder.doseTimes.length > 0 ? lastReminder.doseTimes : [lastReminder.scheduledDoseTime]).join(', ')} ({lastReminder.timesPerDay}x/day)
                    </span>
                </div>
            )}

            {events.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Flow events:
                    </div>
                    <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.85rem' }}>
                        {events.map((ev, idx) => (
                            <li key={idx} style={{ marginBottom: '0.25rem' }}>
                                {ev}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default ReminderSimulation;
