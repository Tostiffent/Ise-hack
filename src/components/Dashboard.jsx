import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { Plus, Users, Pill, LogOut, AlertCircle, Edit2 } from 'lucide-react';
import AddMember from './AddMember';
import ReminderSimulation from './ReminderSimulation';

const Dashboard = () => {
    const { currentUser, members, logout, updateSupply, logs } = useStore();
    const [showAddMember, setShowAddMember] = useState(false);
    const [editingMember, setEditingMember] = useState(null);

    return (
        <div className="container">
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ margin: 0 }}>Family Health Dashboard</h1>
                    <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>
                        Welcome, {currentUser?.username}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => setShowAddMember(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plus size={18} /> Add Member
                    </button>
                    <button onClick={logout} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <LogOut size={18} /> Logout
                    </button>
                </div>
            </header>

            {/* Main Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>

                {/* Left Column: Members */}
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Users size={20} /> Family Members
                    </h2>

                    {members.length === 0 ? (
                        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No family members added yet. Click "Add Member" to get started.
                        </div>
                    ) : (
                        <div className="grid-auto-fit">
                            {members.map(member => (
                                <div key={member.id} className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{member.name}</h3>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                background: 'rgba(255,255,255,0.1)',
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '12px',
                                                marginTop: '0.5rem',
                                                display: 'inline-block'
                                            }}>
                                                {member.ageGroup}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => setEditingMember(member)}
                                                style={{
                                                    background: 'rgba(255,255,255,0.1)',
                                                    border: 'none',
                                                    color: 'var(--accent)',
                                                    borderRadius: '6px',
                                                    padding: '0.5rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                                title="Edit Member"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {member.name.charAt(0)}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {member.medications.map(med => (
                                            <div key={med.id} style={{ fontSize: '0.9rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                                    <span style={{ fontWeight: 500 }}>{med.name}</span>
                                                    <span style={{ color: med.supply <= 5 ? 'var(--danger)' : 'var(--success)' }}>
                                                        {med.supply} left
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{med.dosage}</span>
                                                    <button
                                                        onClick={() => updateSupply(member.id, med.id, -1)}
                                                        style={{
                                                            background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
                                                            borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem'
                                                        }}
                                                    >
                                                        Take Dose
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <ReminderSimulation />
                </div>

                {/* Right Column: Logs/Alerts */}
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <AlertCircle size={20} /> Activity Log
                    </h2>
                    <div className="glass-panel" style={{ padding: '1rem', maxHeight: '500px', overflowY: 'auto' }}>
                        {logs.length === 0 ? (
                            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.9rem' }}>No activity yet.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {logs.map(log => (
                                    <div key={log.id} style={{ fontSize: '0.85rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </div>
                                        <div>{log.message}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showAddMember && <AddMember onClose={() => setShowAddMember(false)} />}
            {editingMember && (
                <AddMember
                    editMember={editingMember}
                    onClose={() => setEditingMember(null)}
                />
            )}
        </div>
    );
};

export default Dashboard;
