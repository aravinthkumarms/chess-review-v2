'use client';

import React from 'react';

interface AnalysisSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    depth: number;
    setDepth: (d: number) => void;
    engineType: 'lite' | 'original';
    setEngineType: (t: 'lite' | 'original') => void;
    showSuggestions: boolean;
    setShowSuggestions: (s: boolean) => void;
    showThreats: boolean;
    setShowThreats: (s: boolean) => void;
}

export default function AnalysisSettings({
    isOpen, onClose, depth, setDepth, engineType, setEngineType,
    showSuggestions, setShowSuggestions, showThreats, setShowThreats
}: AnalysisSettingsProps) {
    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{ position: 'fixed', inset: 0, zIndex: 100 }}
            />

            {/* Popup */}
            <div style={{
                position: 'absolute',
                top: 50,
                right: 20,
                width: 280,
                background: 'var(--review-bg)',
                borderRadius: 8,
                boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                zIndex: 101,
                border: '1px solid var(--review-border)',
                padding: '16px 20px',
                fontFamily: 'Nunito, sans-serif',
                color: '#fff'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Settings</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b8987', cursor: 'pointer', fontSize: 18 }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Engine Depth */}
                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 13, color: '#8b8987', marginBottom: 8, fontWeight: 700 }}>ENGINE DEPTH</label>
                    <select
                        value={depth}
                        onChange={(e) => setDepth(parseInt(e.target.value))}
                        style={{
                            width: '100%', background: 'var(--review-surface)', color: '#fff', border: '1px solid var(--review-border)',
                            borderRadius: 4, padding: '8px 12px', fontSize: 14, outline: 'none'
                        }}
                    >
                        {[10, 14, 18, 20, 24].map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                </div>

                {/* Engine Model */}
                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 13, color: '#8b8987', marginBottom: 8, fontWeight: 700 }}>ENGINE MODEL</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {['lite', 'original'].map(t => (
                            <button
                                key={t}
                                onClick={() => setEngineType(t as any)}
                                style={{
                                    flex: 1, padding: '8px', borderRadius: 4, fontSize: 13, fontWeight: 800,
                                    background: engineType === t ? 'var(--color-green)' : 'var(--review-surface)',
                                    color: '#fff', border: 'none', cursor: 'pointer', textTransform: 'capitalize'
                                }}
                            >
                                {t === 'lite' ? 'Lite (7MB)' : 'Original'}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ height: '1px', background: 'var(--review-border)', margin: '20px 0' }} />

                {/* Toggles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Toggle
                        label="Suggestion Arrows"
                        active={showSuggestions}
                        onChange={setShowSuggestions}
                    />
                    <Toggle
                        label="Show Threats"
                        active={showThreats}
                        onChange={setShowThreats}
                    />
                </div>
            </div>
        </>
    );
}

function Toggle({ label, active, onChange }: { label: string; active: boolean; onChange: (v: boolean) => void }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>{label}</span>
            <div
                onClick={() => onChange(!active)}
                style={{
                    width: 44, height: 22, borderRadius: 11, background: active ? 'var(--color-green)' : 'var(--review-surface)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                }}
            >
                <div style={{
                    position: 'absolute', top: 3, left: active ? 25 : 3, width: 16, height: 16,
                    borderRadius: '50%', background: '#fff', transition: 'left 0.2s'
                }} />
            </div>
        </div>
    );
}
