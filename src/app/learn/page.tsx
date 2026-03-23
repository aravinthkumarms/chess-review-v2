'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LessonPlayer from '@/components/LessonPlayer';
import { LessonData } from '@/hooks/useLessonLogic';
import { getLocalApiBase, fetchWithFallback } from '@/lib/api';

interface CourseStudy {
    id: string;
    name: string;
    path: string;
    videoPath?: string | null;
    type?: string;
    variationCount?: number;  // stored in index after re-sync
}

interface Chapter {
    id: string;
    name: string;
    studies: CourseStudy[];
}

interface Course {
    id: string;
    name: string;
    chapters?: Chapter[];
    orientation?: 'w' | 'b';
    kind?: string;
}

// SVG tile icons — alternating book and puzzle styles to mirror Chess.com aesthetics
function BookIcon() {
    return (
        <svg width="80" height="70" viewBox="0 0 120 105" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.45 57.4l-.28-12.87 112.51-.8.15 15.54a8 8 0 01-3.18 6.46L71.44 97.65a16 16 0 01-19.37-.05L7.59 63.58a8 8 0 01-3.14-6.18z" fill="url(#tileGrad1)" />
            <path d="M114.65 39.38L71.17 7.03a16 16 0 00-18.96-.1L6.24 40.35c-2.75 2-2.75 6.09 0 8.09l45.36 32.96a16 16 0 0019.15-.26l43.96-33.78c2.63-2.02 2.6-5.99-.06-7.98z" fill="#6366f1" />
            <path d="M65.32 60.58a17.91 17.91 0 0110.2-3.166c1.7 0 3.35.237 4.91.677a1.8 1.8 0 002.29-1.732v-26.4a1.8 1.8 0 00-1.31-1.732 21.617 21.617 0 00-5.89-.813 21.51 21.51 0 00-10.2 2.556v30.61zM61.72 29.97a21.51 21.51 0 00-10.2-2.556c-2.04 0-4.016.283-5.89.813a1.8 1.8 0 00-1.31 1.732v26.4a1.8 1.8 0 002.29 1.732 18.017 18.017 0 014.91-.677 17.91 17.91 0 0110.2 3.167V29.97z" fill="#c7f4f1" />
            <defs>
                <linearGradient id="tileGrad1" x1="4.36" y1="72.23" x2="116.87" y2="72.23" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#c7f4f1" />
                    <stop offset="0.43" stopColor="#13d0bf" />
                    <stop offset="0.57" stopColor="#0D839F" />
                </linearGradient>
            </defs>
        </svg>
    );
}

function PuzzleIcon() {
    return (
        <svg width="80" height="70" viewBox="0 0 120 105" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.45 57.4l-.28-12.87 112.51-.8.15 15.54a8 8 0 01-3.18 6.46L71.44 97.65a16 16 0 01-19.37-.05L7.59 63.58a8 8 0 01-3.14-6.18z" fill="url(#tileGrad2)" />
            <path d="M114.65 39.38L71.17 7.03a16 16 0 00-18.96-.1L6.24 40.35c-2.75 2-2.75 6.09 0 8.09l45.36 32.96a16 16 0 0019.15-.26l43.96-33.78c2.63-2.02 2.6-5.99-.06-7.98z" fill="#c7f4f1" />
            <path d="M72.2 38.07l.69-5.68c.48-3.95-.44-4.64-4.88-5.18-4.44-.62-5.46.15-5.86 3.52l-12.26-1.71c.4-3.37-.6-4.14-5.04-4.77-4.44-.62-5.24.26-5.7 4.18l-.69 5.68c-.48 3.96.44 4.64 4.88 5.18s5.46-.26 5.86-3.64l12.26 1.71c-.4 3.38.6 4.14 5.04 4.77s5.24-.26 5.7-4.07zM55 60.06l-1.38-5.53c-.97-3.82-2.06-4.27-6.39-3.04-4.34 1.24-4.84 2.33-3.87 6.15l11.95-3.43-11.95 3.43 1.38 5.53c.97 3.82 2.06 4.27 6.39 3.04 4.34-1.24 4.84-2.33 3.87-6.15l11.95-3.43-.81 3.21-.58 2.31c-.97 3.83-2.06 4.28-6.39 3.05-4.34-1.24-4.84-2.34-3.87-6.16z" fill="#6366f1" />
            <defs>
                <linearGradient id="tileGrad2" x1="4.36" y1="72.23" x2="116.87" y2="72.23" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#c7f4f1" />
                    <stop offset="0.43" stopColor="#13d0bf" />
                    <stop offset="0.57" stopColor="#0D839F" />
                </linearGradient>
            </defs>
        </svg>
    );
}

function LockIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 32 33" fill="none" style={{ position: 'absolute', top: 6, right: 6 }}>
            <path d="M16 3.166a6.674 6.674 0 0 0-6.666 6.667v4H8a2.667 2.667 0 0 0-2.666 2.666v10.667A2.667 2.667 0 0 0 8 29.833h16a2.667 2.667 0 0 0 2.667-2.667V16.499A2.667 2.667 0 0 0 24 13.833h-1.333v-4A6.674 6.674 0 0 0 16 3.166m-4 6.667c0-2.206 1.795-4 4-4s4 1.794 4 4v4h-8zm5.334 14.297v3.036h-2.667V24.13a2.657 2.657 0 0 1 .756-4.903 2.668 2.668 0 0 1 3.244 2.606 2.65 2.65 0 0 1-1.334 2.297" fill="#888" />
        </svg>
    );
}

function DrillIcon() {
    return (
        <svg width="80" height="70" viewBox="0 0 120 105" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.45 57.4l-.28-12.87 112.51-.8.15 15.54a8 8 0 01-3.18 6.46L71.44 97.65a16 16 0 01-19.37-.05L7.59 63.58a8 8 0 01-3.14-6.18z" fill="url(#drillGrad)" />
            <path d="M114.65 39.38L71.17 7.03a16 16 0 00-18.96-.1L6.24 40.35c-2.75 2-2.75 6.09 0 8.09l45.36 32.96a16 16 0 0019.15-.26l43.96-33.78c2.63-2.02 2.6-5.99-.06-7.98z" fill="#f5a623" />
            {/* Trophy cup shape */}
            <path d="M52 22h16v14c0 6-4 10-8 12-4-2-8-6-8-12V22z" fill="#fff" opacity="0.9" />
            <path d="M44 26h6v8a10 10 0 003 7M70 26h6v8a10 10 0 01-3 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
            <rect x="55" y="48" width="10" height="5" rx="1" fill="#fff" opacity="0.9" />
            <rect x="50" y="53" width="20" height="3" rx="1.5" fill="#fff" opacity="0.9" />
            <defs>
                <linearGradient id="drillGrad" x1="4.36" y1="72.23" x2="116.87" y2="72.23" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#ffe066" />
                    <stop offset="0.5" stopColor="#f5a623" />
                    <stop offset="1" stopColor="#e8860a" />
                </linearGradient>
            </defs>
        </svg>
    );
}

export default function LearnPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: '100vh', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}><i className="fas fa-spinner fa-spin fa-2x" /></div>}>
            <LearnContent />
        </Suspense>
    );
}

function LearnContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
    const [activeLessonData, setActiveLessonData] = useState<LessonData | null>(null);
    const [loadingLesson, setLoadingLesson] = useState(false);
    const [completedStudies, setCompletedStudies] = useState<Set<string>>(new Set());
    // Tile metadata — which variation + mode was clicked
    const [tileConfig, setTileConfig] = useState<{ variationIndex: number; isPractice: boolean }>({
        variationIndex: 0, isPractice: false
    });
    // Track actual variation count per study (populated when lesson is first fetched)
    const [studyVarCounts, setStudyVarCounts] = useState<Record<string, number>>({});


    useEffect(() => {
        // Fetch courses
        fetchWithFallback('/api/lessons/index')
            .then(res => {
                if (!res.ok) throw new Error('Could not load course library.');
                return res.json();
            })
            .then(data => {
                setCourses(data);
                const urlCourse = searchParams.get('course');
                if (urlCourse && data.find((c: Course) => c.id === urlCourse)) {
                    setActiveCourseId(urlCourse);
                } else if (data.length > 0) {
                    setActiveCourseId(data[0].id);
                }
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });

        // Fetch user progress (no static fallback for progress)
        const localApi = getLocalApiBase();
        fetch(`${localApi}/api/progress`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.completedStudies) {
                    setCompletedStudies(new Set(data.completedStudies));
                }
            })
            .catch(err => console.error('Failed to load progress:', err));
    }, []);

    // NEW: Fetch full course details when activeCourseId changes
    const [fetchingDetails, setFetchingDetails] = useState(false);
    useEffect(() => {
        if (!activeCourseId) return;

        setFetchingDetails(true);
        fetchWithFallback(`/api/lessons/index?courseId=${encodeURIComponent(activeCourseId)}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.chapters) {
                    // Update the specific course in our list with its chapters
                    setCourses(prev => prev.map(c => c.id === activeCourseId ? { ...c, chapters: data.chapters } : c));

                    // Pre-populate variation counts from the index data
                    const counts: Record<string, number> = {};
                    data.chapters.forEach((ch: Chapter) => {
                        ch.studies.forEach((s: CourseStudy) => {
                            if (s.variationCount) counts[s.id] = s.variationCount;
                        });
                    });
                    setStudyVarCounts(prev => ({ ...prev, ...counts }));
                }
            })
            .catch(err => console.error('Failed to fetch course details:', err))
            .finally(() => setFetchingDetails(false));
    }, [activeCourseId]);

    // Scoped Prefetch: Only fetch variation counts for the active course if missing
    useEffect(() => {
        if (!activeCourseId || fetchingDetails) return;
        const activeCourse = courses.find(c => c.id === activeCourseId);
        if (!activeCourse || !activeCourse.chapters) return;

        const allStudies = activeCourse.chapters.flatMap(ch => ch.studies);
        allStudies.forEach(study => {
            // Only fetch if we don't already have a valid count
            if (!studyVarCounts[study.id] && !study.variationCount) {
                fetchWithFallback(`/api/lessons/${study.path}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(data => {
                        if (!data?.moves) return;
                        let maxVarIdx = 0;
                        for (const movesArr of Object.values(data.moves) as any[]) {
                            for (const move of movesArr) {
                                if (typeof move.variationIndex === 'number' && move.variationIndex > maxVarIdx) {
                                    maxVarIdx = move.variationIndex;
                                }
                            }
                        }
                        setStudyVarCounts(prev => ({ ...prev, [study.id]: maxVarIdx + 1 }));
                    })
                    .catch(() => { });
            }
        });
    }, [activeCourseId, courses, fetchingDetails]);

    // Handle reactive routing from URL params (Deep linking + Back/Forward navigation)
    useEffect(() => {
        if (loading || courses.length === 0) return;

        // 1. Sync active course from URL if it diverges
        const urlCourseId = searchParams.get('course');
        if (urlCourseId && urlCourseId !== activeCourseId) {
            setActiveCourseId(urlCourseId);
            return; // Wait for activeCourseId state to update
        }
        if (!activeCourseId) return;

        // 2. Prevent infinite fetch loops
        if (loadingLesson) return;

        const lessonPath = searchParams.get('lesson');

        // 3. User clicked back to lobby
        if (!lessonPath) {
            if (activeLessonData) {
                setActiveLessonData(null);
            }
            return; // Stay in lobby
        }

        // 4. Validate if URL state matches current component state
        const varIdx = parseInt(searchParams.get('variation') || '0', 10);
        const isPractice = searchParams.get('practice') === 'true';

        const needsLessonFetch = activeLessonData?.id !== lessonPath;
        const needsConfigUpdate = !needsLessonFetch && (tileConfig.variationIndex !== varIdx || tileConfig.isPractice !== isPractice);

        if (needsLessonFetch || needsConfigUpdate) {
            const activeCourse = courses.find(c => c.id === activeCourseId);
            const study = activeCourse?.chapters?.flatMap(ch => ch.studies).find(s => s.path === lessonPath);
            if (study) {
                handleStudyClick(study, varIdx, isPractice, true); // true = skip URL update
            }
        }
    }, [loading, courses, activeCourseId, searchParams, activeLessonData, tileConfig, loadingLesson]);

    const handleStudyClick = async (study: CourseStudy, varIdx = 0, isPractice = false, skipUrlUpdate = false) => {
        setLoadingLesson(true);
        setError('');
        setTileConfig({ variationIndex: varIdx, isPractice });

        if (!skipUrlUpdate) {
            const currentLesson = searchParams.get('lesson');
            const params = new URLSearchParams(searchParams.toString());
            params.set('course', activeCourseId || '');
            params.set('lesson', study.path);
            params.set('variation', varIdx.toString());
            params.set('practice', isPractice.toString());

            // If already in a lesson, replace to avoid history bloat. If from lobby, push to create a history entry.
            if (currentLesson) {
                router.replace(`?${params.toString()}`, { scroll: false });
            } else {
                router.push(`?${params.toString()}`, { scroll: false });
            }
        }

        try {
            const res = await fetchWithFallback(`/api/lessons/${study.path}`);
            if (!res.ok) throw new Error('Failed to load lesson data.');
            const data = await res.json();
            const activeCourse = courses.find(c => c.id === activeCourseId);
            const lessonWithMeta: LessonData = {
                ...data,
                id: study.path, // ensure ID matches the click path for getNextStudy
                videoPath: study.videoPath,
                type: study.type,
                orientation: activeCourse?.orientation || 'w'
            };
            let maxVarIdx = 0;
            if (data.moves && typeof data.moves === 'object') {
                for (const movesArr of Object.values(data.moves) as any[]) {
                    for (const move of movesArr) {
                        if (typeof move.variationIndex === 'number' && move.variationIndex > maxVarIdx) {
                            maxVarIdx = move.variationIndex;
                        }
                    }
                }
            }
            const count = (data.moves && Object.keys(data.moves).length > 0) ? maxVarIdx + 1 : 0;
            setStudyVarCounts(prev => ({ ...prev, [study.id]: count }));
            setActiveLessonData(lessonWithMeta);
        } catch (err: any) {
            setError(err.message || 'Failed to load lesson.');
        } finally {
            setLoadingLesson(false);
        }
    };

    const getNextStudy = () => {
        if (!activeLessonData) return null;
        const activeCourse = courses.find((c: Course) => c.id === activeCourseId);
        if (!activeCourse) return null;
        const allStudies = activeCourse.chapters?.flatMap((ch: Chapter) => ch.studies || []) || [];
        const idx = allStudies.findIndex((s: CourseStudy) => s.path === activeLessonData.id);
        if (idx !== -1 && idx < allStudies.length - 1) return allStudies[idx + 1];
        return null;
    };

    const handleNext = () => {
        if (!activeLessonData) return;

        // Mark as completed locally and remotely
        if (!completedStudies.has(activeLessonData.id)) {
            setCompletedStudies(prev => new Set(prev).add(activeLessonData.id));
            const localApi = getLocalApiBase();
            fetch(`${localApi}/api/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studyId: activeLessonData.id })
            }).catch(err => console.error('Failed to save progress:', err));
        }

        const activeCourse = courses.find((c: Course) => c.id === activeCourseId);
        const study = activeCourse?.chapters?.flatMap((ch: Chapter) => ch.studies || []).find((s: CourseStudy) => s.path === activeLessonData.id);
        if (!study) return;

        const maxVars = studyVarCounts[study.id] ?? study.variationCount ?? 1;
        const currentTileIdx = tileConfig.variationIndex === -1 ? (maxVars * 2) : (tileConfig.variationIndex * 2 + (tileConfig.isPractice ? 1 : 0));

        // Logical progression: V1 -> P1 -> V2 -> P2 ... -> Drill -> Next Study
        if (currentTileIdx < maxVars * 2) {
            // Move to next tile in same study
            const nextTileIdx = currentTileIdx + 1;
            const nextVarIdx = Math.floor(nextTileIdx / 2);
            const nextIsPractice = nextTileIdx % 2 === 1;
            handleStudyClick(study, nextVarIdx, nextIsPractice);
        } else {
            // End of tiles for this study, go to NEXT study
            const nextStudy = getNextStudy();
            if (nextStudy) handleStudyClick(nextStudy);
            else {
                setActiveLessonData(null);
                router.replace('?', { scroll: false });
            }
        }
    };

    const handleCloseLesson = () => {
        setActiveLessonData(null);
        const params = new URLSearchParams(searchParams.toString());
        params.delete('lesson');
        params.delete('variation');
        params.delete('practice');
        router.replace(`?${params.toString()}`, { scroll: false });
    };

    if (activeLessonData) {
        return (
            <>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
                <LessonPlayer
                    lesson={activeLessonData}
                    onClose={handleCloseLesson}
                    onNext={handleNext}
                    targetVariationIndex={tileConfig.variationIndex}
                    isPracticeMode={tileConfig.isPractice}
                />
            </>
        );
    }

    const activeCourse = courses.find(c => c.id === activeCourseId);

    return (
        <div style={{ minHeight: '100vh', background: '#1a1a1a', fontFamily: "'Nunito', sans-serif", color: '#fff' }}>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');
                * { box-sizing: border-box; }
                body { margin: 0; padding: 0; }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: #111; }
                ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
                .tile-btn:hover { transform: translateY(-3px); filter: brightness(1.1); }
                .study-name:hover { color: #6366f1 !important; }
                .course-btn:hover { background: #252525 !important; }
            `}</style>

            {/* Top Nav */}
            <div style={{ background: '#111', borderBottom: '1px solid #222', padding: '0 24px', display: 'flex', alignItems: 'center', height: 56, gap: 16 }}>
                <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18, padding: 8 }}>
                    <i className="fas fa-arrow-left" />
                </button>
                <span style={{ color: '#6366f1', fontWeight: 800, fontSize: 18, letterSpacing: '-0.5px' }}>♟ ChessPath</span>
                {activeCourse && (
                    <span style={{ color: '#888', fontSize: 13, marginLeft: 8 }}>/ {activeCourse.name}</span>
                )}
            </div>

            <div style={{ display: 'flex', height: 'calc(100vh - 56px)' }}>
                {/* Sidebar: Course List */}
                <div style={{ width: 240, background: '#111', borderRight: '1px solid #222', overflowY: 'auto', flexShrink: 0 }}>
                    <div style={{ padding: '16px 12px 8px', color: '#666', fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
                        Courses
                    </div>
                    {courses.map(course => (
                        <button
                            key={course.id}
                            className="course-btn"
                            onClick={() => {
                                console.log(course.id);
                                router.push(`?course=${course.id}`);
                                //setActiveCourseId(course.id)
                            }}
                            style={{
                                width: '100%', textAlign: 'left', padding: '12px 16px',
                                background: activeCourseId === course.id ? '#1a2e2c' : 'transparent',
                                color: activeCourseId === course.id ? '#6366f1' : '#aaa',
                                border: 'none', borderLeft: activeCourseId === course.id ? '3px solid #6366f1' : '3px solid transparent',
                                cursor: 'pointer', fontSize: 13, fontWeight: activeCourseId === course.id ? 700 : 400,
                                lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 10,
                                transition: 'all 0.15s'
                            }}
                        >
                            <i className="fas fa-book" style={{ fontSize: 12, flexShrink: 0, color: activeCourseId === course.id ? '#6366f1' : '#555' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{course.name}</span>
                        </button>
                    ))}
                </div>

                {/* Main Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#888', marginTop: 60, justifyContent: 'center' }}>
                            <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }} /> Loading courses...
                        </div>
                    ) : error ? (
                        <div style={{ color: '#e74c3c', textAlign: 'center', marginTop: 60 }}>
                            <i className="fas fa-exclamation-triangle" style={{ fontSize: 28, marginBottom: 12, display: 'block' }} />
                            {error}
                        </div>
                    ) : !activeCourse ? (
                        <div style={{ color: '#666', textAlign: 'center', marginTop: 60 }}>Select a course to begin</div>
                    ) : (
                        <div>
                            <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 800, color: '#fff' }}>{activeCourse.name}</h1>
                            <div style={{ color: '#555', fontSize: 13, marginBottom: 40 }}>
                                {(activeCourse.chapters?.length || 0)} chapter{(activeCourse.chapters?.length || 0) !== 1 ? 's' : ''} • {activeCourse.chapters?.reduce((a, c) => a + (c.studies?.length || 0), 0) || 0} studies
                            </div>

                            {fetchingDetails && (
                                <div style={{ background: '#1a2e2c', border: '1px solid #6366f1', borderRadius: 8, padding: '12px 16px', marginBottom: 24, color: '#6366f1', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <i className="fas fa-spinner fa-spin" /> Updating course details...
                                </div>
                            )}

                            {loadingLesson && (
                                <div style={{ background: '#1a2e2c', border: '1px solid #6366f1', borderRadius: 8, padding: '12px 16px', marginBottom: 24, color: '#6366f1', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <i className="fas fa-spinner fa-spin" /> Loading lesson...
                                </div>
                            )}

                            {(activeCourse.chapters || []).map((chapter) => (
                                <div key={chapter.id} style={{ marginBottom: 48 }}>
                                    {/* Chapter Header */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                                            <i className="fas fa-chess-board" />
                                        </div>
                                        <span style={{ fontSize: 15, fontWeight: 700, color: '#ccc', letterSpacing: '0.3px' }}>{chapter.name}</span>
                                    </div>

                                    {/* Studies */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                        {chapter.studies.map((study, studyIdx) => {
                                            const isCompleted = completedStudies.has(study.id);
                                            // Use variation count from: runtime-fetched data > index field > fallback 1
                                            const numVariations = studyVarCounts[study.id] ?? study.variationCount ?? 1;
                                            return (
                                                <div key={study.id} style={{ background: '#1c1c1c', border: '1px solid #2a2a2a', borderRadius: 12, padding: '16px 20px', transition: 'border-color 0.2s' }}>
                                                    {/* Study Name Row */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                                        <button
                                                            className="study-name"
                                                            onClick={() => handleStudyClick(study)}
                                                            disabled={loadingLesson}
                                                            style={{
                                                                background: 'none', border: 'none', cursor: loadingLesson ? 'wait' : 'pointer',
                                                                fontSize: 14, fontWeight: 700, color: isCompleted ? '#6366f1' : '#e0e0e0',
                                                                padding: 0, textAlign: 'left', transition: 'color 0.2s',
                                                                display: 'flex', alignItems: 'center', gap: 8
                                                            }}
                                                        >
                                                            {isCompleted && <i className="fas fa-check-circle" style={{ color: '#6366f1', fontSize: 13 }} />}
                                                            {study.name}
                                                        </button>

                                                        {study.videoPath && (
                                                            <button
                                                                onClick={() => handleStudyClick({ ...study, type: 'VIDEO' })}
                                                                style={{
                                                                    background: 'none', border: '1px solid #333', borderRadius: 20,
                                                                    padding: '3px 10px', cursor: 'pointer', color: '#6366f1',
                                                                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600
                                                                }}
                                                            >
                                                                <svg width="12" height="12" viewBox="0 0 24 25" fill="none">
                                                                    <path d="M7.9 21.03c-.29 0-.57-.08-.82-.22a1.843 1.843 0 01-.91-1.61V5.61c0-.67.35-1.29.91-1.61a1.647 1.647 0 011.68.02l11.62 6.95a1.688 1.688 0 010 2.86l-11.62 6.96a1.663 1.663 0 01-.86.24z" fill="#6366f1" />
                                                                </svg>
                                                                Video
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Tiles Row — conditionally rendered based on study type */}
                                                    {study.type !== 'VIDEO' && (
                                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, alignItems: 'flex-start' }}>

                                                            {/* Standard Study / Lesson: Render V/P tiles if not legacy */}
                                                            {(!study.type || study.type === 'STUDY' || study.type === 'LESSON') && activeCourse?.kind !== 'legacy' && (
                                                                <>
                                                                    {/* numVariations * 2 tiles: V1, P1, V2, P2 ... */}
                                                                    {Array.from({ length: numVariations * 2 }).map((_, tileIdx) => {
                                                                        const varIdx = Math.floor(tileIdx / 2);
                                                                        const isPractice = tileIdx % 2 === 1;
                                                                        return (
                                                                            <div key={tileIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                                                                <button
                                                                                    className="tile-btn"
                                                                                    onClick={() => handleStudyClick(study, varIdx, isPractice)}
                                                                                    disabled={loadingLesson}
                                                                                    style={{
                                                                                        position: 'relative', background: 'none', border: 'none',
                                                                                        cursor: loadingLesson ? 'wait' : 'pointer',
                                                                                        padding: 0, opacity: 1,
                                                                                        transition: 'transform 0.2s, filter 0.2s',
                                                                                        display: 'flex', flexDirection: 'column', alignItems: 'center'
                                                                                    }}
                                                                                    title={isPractice ? `Practice (${varIdx + 1} variation${varIdx > 0 ? 's' : ''})` : `Learn Variation ${varIdx + 1}`}
                                                                                >
                                                                                    {isPractice ? <PuzzleIcon /> : <BookIcon />}
                                                                                </button>
                                                                                <span style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                                                                                    {isPractice ? `P${varIdx + 1}` : `V${varIdx + 1}`}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })}

                                                                    {/* Separator */}
                                                                    <div style={{ width: 1, background: '#2a2a2a', alignSelf: 'stretch', margin: '0 4px' }} />

                                                                    {/* Final Drill tile — all variations shuffled */}
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                                                        <button
                                                                            className="tile-btn"
                                                                            onClick={() => handleStudyClick(study, -1, true)}
                                                                            disabled={loadingLesson}
                                                                            style={{
                                                                                position: 'relative', background: 'none', border: 'none',
                                                                                cursor: loadingLesson ? 'wait' : 'pointer',
                                                                                padding: 0, opacity: 1,
                                                                                transition: 'transform 0.2s, filter 0.2s',
                                                                                display: 'flex', flexDirection: 'column', alignItems: 'center'
                                                                            }}
                                                                            title="Final Drill — all variations"
                                                                        >
                                                                            <DrillIcon />
                                                                        </button>
                                                                        <span style={{ fontSize: 9, color: '#f5a623', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                                                                            Drill
                                                                        </span>
                                                                    </div>
                                                                </>
                                                            )}

                                                            {/* Quiz Type: Render single Quiz tile */}
                                                            {study.type === 'QUIZ' && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                                                    <button
                                                                        className="tile-btn"
                                                                        onClick={() => handleStudyClick(study, -1, true)}
                                                                        disabled={loadingLesson}
                                                                        style={{
                                                                            position: 'relative', background: 'none', border: 'none',
                                                                            cursor: loadingLesson ? 'wait' : 'pointer',
                                                                            padding: 0, opacity: 1,
                                                                            transition: 'transform 0.2s, filter 0.2s',
                                                                            display: 'flex', flexDirection: 'column', alignItems: 'center'
                                                                        }}
                                                                        title="Take Quiz"
                                                                    >
                                                                        <DrillIcon />
                                                                    </button>
                                                                    <span style={{ fontSize: 9, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                                                                        Quiz
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {/* Drill Only Type: Render single Drill tile */}
                                                            {study.type === 'DRILL_AND_PRACTICE' && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                                                    <button
                                                                        className="tile-btn"
                                                                        onClick={() => handleStudyClick(study, -1, true)}
                                                                        disabled={loadingLesson}
                                                                        style={{
                                                                            position: 'relative', background: 'none', border: 'none',
                                                                            cursor: loadingLesson ? 'wait' : 'pointer',
                                                                            padding: 0, opacity: 1,
                                                                            transition: 'transform 0.2s, filter 0.2s',
                                                                            display: 'flex', flexDirection: 'column', alignItems: 'center'
                                                                        }}
                                                                        title="Start Practice/Drill"
                                                                    >
                                                                        <DrillIcon />
                                                                    </button>
                                                                    <span style={{ fontSize: 9, color: '#f5a623', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                                                                        Drill
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
