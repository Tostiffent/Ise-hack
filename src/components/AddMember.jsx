import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { Plus, Trash2, Pill, User, Phone, X, Edit2 } from 'lucide-react';

const AddMember = ({ onClose, editMember = null }) => {
    const { addMember, updateMember } = useStore();
    const isEditMode = !!editMember;

    const [formData, setFormData] = useState({
        name: editMember?.name || '',
        ageGroup: editMember?.ageGroup || 'Adult',
        phone: editMember?.phone || ''
    });

    const normalizeDoseTimes = (timesPerDay, doseTimes = []) => {
        const count = Math.max(1, timesPerDay);
        const times = (doseTimes.length > 0 ? doseTimes : ['08:00']).slice(0, count);
        while (times.length < count) {
            times.push(times[times.length - 1] || '08:00');
        }
        return times;
    };

    const [medications, setMedications] = useState(() => {
        if (editMember?.medications) {
            return editMember.medications.map(med => {
                const timesPerDay = med.timesPerDay || (med.doseTimes?.length || 1);
                const doseTimes = normalizeDoseTimes(timesPerDay, med.doseTimes && med.doseTimes.length > 0 ? med.doseTimes : [med.intakeTime || '08:00']);
                return {
                    ...med,
                    id: med.id || crypto.randomUUID(),
                    timesPerDay,
                    doseTimes
                };
            });
        }
        return [];
    });
    const [currentMed, setCurrentMed] = useState({
        name: '',
        dosage: '',
        supply: 30,
        timesPerDay: 1,
        doseTimes: ['08:00']
    });
    const [editingMedId, setEditingMedId] = useState(null);

    const handleTimesPerDayChange = (value) => {
        const count = Math.max(1, value);
        setCurrentMed(prev => ({
            ...prev,
            timesPerDay: count,
            doseTimes: normalizeDoseTimes(count, prev.doseTimes)
        }));
    };

    const handleDoseTimeChange = (index, value) => {
        setCurrentMed(prev => {
            const updated = [...prev.doseTimes];
            updated[index] = value || '08:00';
            return { ...prev, doseTimes: updated };
        });
    };

    const handleAddMed = () => {
        if (currentMed.name && currentMed.dosage) {
            const normalized = {
                ...currentMed,
                timesPerDay: Math.max(1, currentMed.timesPerDay),
                doseTimes: normalizeDoseTimes(currentMed.timesPerDay, currentMed.doseTimes)
            };
            setMedications([...medications, { ...normalized, id: crypto.randomUUID() }]);
            setCurrentMed({ name: '', dosage: '', supply: 30, timesPerDay: 1, doseTimes: ['08:00'] });
        }
    };

    const removeMed = (id) => {
        setMedications(medications.filter(m => m.id !== id));
        if (editingMedId === id) {
            setEditingMedId(null);
            setCurrentMed({ name: '', dosage: '', supply: 30, timesPerDay: 1, doseTimes: ['08:00'] });
        }
    };

    const startEditMed = (med) => {
        setEditingMedId(med.id);
        setCurrentMed({
            name: med.name,
            dosage: med.dosage,
            supply: med.supply,
            timesPerDay: med.timesPerDay || (med.doseTimes?.length || 1),
            doseTimes: normalizeDoseTimes(
                med.timesPerDay || (med.doseTimes?.length || 1),
                med.doseTimes && med.doseTimes.length > 0 ? med.doseTimes : [med.intakeTime || '08:00']
            )
        });
    };

    const handleUpdateMed = () => {
        if (currentMed.name && currentMed.dosage && editingMedId) {
            const normalized = {
                ...currentMed,
                timesPerDay: Math.max(1, currentMed.timesPerDay),
                doseTimes: normalizeDoseTimes(currentMed.timesPerDay, currentMed.doseTimes)
            };
            setMedications(medications.map(med => 
                med.id === editingMedId 
                    ? { ...normalized, id: editingMedId }
                    : med
            ));
            setCurrentMed({ name: '', dosage: '', supply: 30, timesPerDay: 1, doseTimes: ['08:00'] });
            setEditingMedId(null);
        }
    };

    const cancelEditMed = () => {
        setCurrentMed({ name: '', dosage: '', supply: 30, timesPerDay: 1, doseTimes: ['08:00'] });
        setEditingMedId(null);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const memberData = {
            ...formData,
            medications
        };

        if (isEditMode) {
            updateMember(editMember.id, memberData);
        } else {
            addMember(memberData);
        }
        onClose();
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div className="glass-panel animate-fade-in" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', position: 'relative' }}>
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1.5rem',
                        right: '1.5rem',
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        borderRadius: '6px',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                        e.currentTarget.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                    title="Close"
                >
                    <X size={18} />
                </button>
                <h2 style={{ marginTop: 0, marginBottom: '1.5rem', paddingRight: '2.5rem' }}>
                    {isEditMode ? 'Edit Family Member' : 'Add Family Member'}
                </h2>

                <form onSubmit={handleSubmit}>
                    {/* Personal Details */}
                    <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
                        <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>Personal Details</h3>
                        <div className="glass-input" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <User size={18} color="var(--text-secondary)" />
                            <input
                                style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none' }}
                                placeholder="Full Name"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <select
                                className="glass-input"
                                value={formData.ageGroup}
                                onChange={e => setFormData({ ...formData, ageGroup: e.target.value })}
                            >
                                <option value="Minor">Minor (&lt;18)</option>
                                <option value="Adult">Adult (18-60)</option>
                                <option value="Senior">Senior (60+)</option>
                            </select>

                            {formData.ageGroup !== 'Minor' && (
                                <div className="glass-input" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Phone size={18} color="var(--text-secondary)" />
                                    <input
                                        style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none' }}
                                        placeholder="Phone Number"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        required
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Medications */}
                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>Prescriptions</h3>

                        {/* List of added meds */}
                        {medications.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                                {medications.map(med => (
                                    <div key={med.id} style={{
                                        background: editingMedId === med.id ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)', 
                                        padding: '0.75rem', 
                                        borderRadius: '8px',
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center',
                                        border: editingMedId === med.id ? '1px solid var(--accent)' : '1px solid transparent',
                                        transition: 'all 0.2s'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{med.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {med.dosage} • {med.supply} pills • {med.timesPerDay || med.doseTimes?.length || 1}x/day • times: {(med.doseTimes && med.doseTimes.length > 0 ? med.doseTimes : [med.intakeTime || '08:00']).join(', ')}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            {editingMedId !== med.id && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => startEditMed(med)} 
                                                    style={{ 
                                                        background: 'rgba(255,255,255,0.1)', 
                                                        border: 'none', 
                                                        color: 'var(--accent)', 
                                                        cursor: 'pointer',
                                                        borderRadius: '4px',
                                                        padding: '0.4rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                    title="Edit Medication"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                            )}
                                            <button 
                                                type="button" 
                                                onClick={() => removeMed(med.id)} 
                                                style={{ 
                                                    background: 'none', 
                                                    border: 'none', 
                                                    color: 'var(--danger)', 
                                                    cursor: 'pointer',
                                                    padding: '0.4rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                                title="Remove Medication"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add/Edit med inputs */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: editingMedId ? '1px solid var(--accent)' : '1px dashed var(--glass-border)' }}>
                            {editingMedId && (
                                <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--accent)' }}>
                                    Editing medication...
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <input
                                    className="glass-input"
                                    placeholder="Medicine Name"
                                    value={currentMed.name}
                                    onChange={e => setCurrentMed({ ...currentMed, name: e.target.value })}
                                />
                                <input
                                    className="glass-input"
                                    placeholder="Dosage (e.g. 500mg)"
                                    value={currentMed.dosage}
                                    onChange={e => setCurrentMed({ ...currentMed, dosage: e.target.value })}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <input
                                    type="number"
                                    className="glass-input"
                                    placeholder="Qty"
                                    style={{ width: '100px' }}
                                    value={currentMed.supply}
                                    onChange={e => setCurrentMed({ ...currentMed, supply: parseInt(e.target.value) || 0 })}
                                />
                                <input
                                    type="number"
                                    className="glass-input"
                                    placeholder="Times/day"
                                    style={{ width: '120px' }}
                                    min={1}
                                    value={currentMed.timesPerDay}
                                    onChange={e => handleTimesPerDayChange(parseInt(e.target.value) || 1)}
                                />
                                {currentMed.doseTimes.map((time, idx) => (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                            Dose {idx + 1}
                                        </label>
                                        <input
                                            type="time"
                                            className="glass-input"
                                            style={{ width: '130px' }}
                                            value={time}
                                            onChange={e => handleDoseTimeChange(idx, e.target.value)}
                                        />
                                    </div>
                                ))}
                                {editingMedId ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={handleUpdateMed}
                                            className="btn-primary"
                                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                        >
                                            <Edit2 size={16} /> Update Medicine
                                        </button>
                                        <button
                                            type="button"
                                            onClick={cancelEditMed}
                                            className="btn-secondary"
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 1rem' }}
                                        >
                                            <X size={16} />
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleAddMed}
                                        className="btn-secondary"
                                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                    >
                                        <Plus size={16} /> Add Medicine
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                        <button type="submit" className="btn-primary">Save Member</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddMember;
