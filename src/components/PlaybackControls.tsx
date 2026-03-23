'use client';

import React from 'react';

interface PlaybackControlsProps {
    isPlaying: boolean;
    onTogglePlay: () => void;
    onFirst: () => void;
    onPrev: () => void;
    onNext: () => void;
    onLast: () => void;
    onFlip: () => void;
}

export default function PlaybackControls({
    isPlaying,
    onTogglePlay,
    onFirst,
    onPrev,
    onNext,
    onLast,
    onFlip
}: PlaybackControlsProps) {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, width: '100%' }}>
            {[
                { icon: 'fa-fast-backward', title: 'Start', action: onFirst },
                { icon: 'fa-step-backward', title: 'Back', action: onPrev },
                { icon: isPlaying ? 'fa-pause' : 'fa-play', title: isPlaying ? 'Pause' : 'Play', action: onTogglePlay, isPlayButton: true },
                { icon: 'fa-step-forward', title: 'Next', action: onNext },
                { icon: 'fa-fast-forward', title: 'End', action: onLast },
                { icon: 'fa-retweet', title: 'Flip', action: onFlip, ml: 12 },
            ].map(({ icon, title, action, ml, isPlayButton }) => (
                <button
                    key={icon}
                    onClick={action}
                    title={title}
                    style={{
                        flex: isPlayButton ? '1.5 1 0%' : '1 1 0%',
                        background: 'var(--review-surface-2)',
                        border: 'none',
                        color: isPlayButton ? '#fff' : 'var(--review-text-dim)',
                        fontSize: isPlayButton ? 20 : 18,
                        cursor: 'pointer',
                        padding: '16px 0',
                        borderRadius: 8,
                        transition: 'all 0.1s ease',
                        marginLeft: ml,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'var(--review-surface-3)';
                        e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'var(--review-surface-2)';
                        e.currentTarget.style.color = isPlayButton ? '#fff' : 'var(--review-text-dim)';
                    }}
                    onMouseDown={e => {
                        e.currentTarget.style.transform = 'scale(0.96)';
                    }}
                    onMouseUp={e => {
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    <i className={`fas ${icon}`}></i>
                </button>
            ))}
        </div>
    );
}
